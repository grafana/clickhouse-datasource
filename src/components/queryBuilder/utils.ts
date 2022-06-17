import { astVisitor, Expr, FromTable, parseFirst, ExprRef, SelectedColumn, Statement, astMapper } from 'pgsql-ast-parser';
import { isString } from 'lodash';
import {
  BuilderMetricField,
  BuilderMode,
  OrderBy,
  SqlBuilderOptions,
  Filter,
  NullFilter,
  BooleanFilter,
  NumberFilter,
  DateFilter,
  StringFilter,
  MultiFilter,
  FilterOperator,
  DateFilterWithoutValue,
  BuilderMetricFieldAggregation,
  SqlBuilderOptionsAggregate,
  SqlBuilderOptionsTrend,
} from 'types';

export const isBooleanType = (type: string): boolean => {
  return ['boolean'].includes(type?.toLowerCase());
};
export const isNumberType = (type: string): boolean => {
  const numericTypes = ['int', 'float', 'decimal'];
  const match = numericTypes.find((t) => type?.toLowerCase().includes(t));
  return match !== undefined;
};
export const isDateType = (type: string): boolean => {
  return ['date', 'datetime'].includes(type?.toLowerCase());
};
export const isStringType = (type: string): boolean => {
  return !(isBooleanType(type) || isNumberType(type) || isDateType(type));
};
export const isNullFilter = (filter: Filter): filter is NullFilter => {
  return [FilterOperator.IsNull, FilterOperator.IsNotNull].includes(filter.operator);
};
export const isBooleanFilter = (filter: Filter): filter is BooleanFilter => {
  return isBooleanType(filter.type);
};
export const isNumberFilter = (filter: Filter): filter is NumberFilter => {
  return isNumberType(filter.type);
};
export const isDateFilterWithOutValue = (filter: Filter): filter is DateFilterWithoutValue => {
  return (
    isDateType(filter.type) &&
    [FilterOperator.WithInGrafanaTimeRange, FilterOperator.OutsideGrafanaTimeRange].includes(filter.operator)
  );
};
export const isDateFilter = (filter: Filter): filter is DateFilter => {
  return isDateType(filter.type);
};
export const isStringFilter = (filter: Filter): filter is StringFilter => {
  return isStringType(filter.type) && ![FilterOperator.In, FilterOperator.NotIn].includes(filter.operator);
};
export const isMultiFilter = (filter: Filter): filter is MultiFilter => {
  return isStringType(filter.type) && [FilterOperator.In, FilterOperator.NotIn].includes(filter.operator);
};

const getListQuery = (database = '', table = '', fields: string[] = []): string => {
  const sep = database === '' || table === '' ? '' : '.';
  fields = fields && fields.length > 0 ? fields : [''];
  return `SELECT ${fields.join(', ')} FROM ${database}${sep}${table}`;
};

const getAggregationQuery = (
  database = '',
  table = '',
  fields: string[] = [],
  metrics: BuilderMetricField[] = [],
  groupBy: string[] = []
): string => {
  let selected = fields.length > 0 ? fields.join(', ') : '';
  let metricsQuery = metrics
    .map((m) => {
      const alias = m.alias ? ` ${m.alias.replace(/ /g, '_')}` : '';
      return `${m.aggregation}(${m.field})${alias}`;
    })
    .join(', ');
  const groupByQuery = groupBy
    .filter((x) => !fields.some((y) => y === x)) // not adding field if its already is selected
    .join(', ');
  const sep = database === '' || table === '' ? '' : '.';
  return `SELECT ${selected}${selected && (groupByQuery || metricsQuery) ? ', ' : ''}${groupByQuery}${metricsQuery && groupByQuery ? ', ' : ''
    }${metricsQuery} FROM ${database}${sep}${table}`;
};

const getTrendByQuery = (
  database = '',
  table = '',
  metrics: BuilderMetricField[] = [],
  groupBy: string[] = [],
  timeField = '',
  timeFieldType = ''
): string => {
  metrics = metrics && metrics.length > 0 ? metrics : [];

  let metricsQuery = metrics
    .map((m) => {
      const alias = m.alias ? ` ` + m.alias.replace(/ /g, '_') : '';
      return `${m.aggregation}(${m.field})${alias}`;
    })
    .join(', ');
  const time = `$__timeInterval(${timeField}) as time`;
  if (metricsQuery !== '') {
    const group = groupBy.length > 0 ? `${groupBy.join(', ')},` : '';
    metricsQuery = `${time}, ${group} ${metricsQuery}`;
  } else if (groupBy.length > 0) {
    metricsQuery = `${time}, ${groupBy.join(', ')}`;
  } else {
    metricsQuery = `${time}`;
  }

  const sep = database === '' || table === '' ? '' : '.';
  return `SELECT ${metricsQuery} FROM ${database}${sep}${table}`;
};

const getFilters = (filters: Filter[]): string => {
  return filters.reduce((previousValue, currentFilter, currentIndex) => {
    const prefixCondition = currentIndex === 0 ? '' : currentFilter.condition;
    let filter = '';
    let field = currentFilter.key;
    let operator = '';
    let notOperator = false;
    if (currentFilter.operator === FilterOperator.NotLike) {
      operator = 'LIKE';
      notOperator = true;
    } else if (currentFilter.operator === FilterOperator.OutsideGrafanaTimeRange) {
      operator = '';
      notOperator = true;
    } else {
      if ([FilterOperator.WithInGrafanaTimeRange].includes(currentFilter.operator)) {
        operator = '';
      } else {
        operator = currentFilter.operator;
      }
    }
    filter = `${field} ${operator}`;
    if (isNullFilter(currentFilter)) {
    } else if (isBooleanFilter(currentFilter)) {
      filter += ` ${currentFilter.value}`;
    } else if (isNumberFilter(currentFilter)) {
      filter += ` ${currentFilter.value || '0'}`;
    } else if (isDateFilter(currentFilter)) {
      if (isDateFilterWithOutValue(currentFilter)) {
        if (isDateType(currentFilter.type)) {
          filter += ` >= \$__fromTime AND ${currentFilter.key} <= \$__toTime`;
        }
      } else {
        switch (currentFilter.value) {
          case 'GRAFANA_START_TIME':
            if (isDateType(currentFilter.type)) {
              filter += ` \$__fromTime`;
            }
            break;
          case 'GRAFANA_END_TIME':
            if (isDateType(currentFilter.type)) {
              filter += ` \$__toTime`;
            }
            break;
          default:
            filter += ` ${currentFilter.value || 'TODAY'}`;
        }
      }
    } else if (isStringFilter(currentFilter)) {
      if (currentFilter.operator === FilterOperator.Like || currentFilter.operator === FilterOperator.NotLike) {
        filter += ` '%${currentFilter.value || ''}%'`;
      } else {
        filter += ` '${currentFilter.value || ''}'`;
      }
    } else if (isMultiFilter(currentFilter)) {
      let values = currentFilter.value;
      filter += ` (${values.map((v) => `'${v.trim()}'`).join(', ')} )`;
    }
    if (notOperator) {
      filter = ` NOT ( ${filter} )`;
    }
    return filter ? `${previousValue} ${prefixCondition} ( ${filter} )` : previousValue;
  }, '');
};

const getGroupBy = (groupBy: string[] = [], timeField?: string): string => {
  const clause = groupBy.length > 0 ? ` GROUP BY ${groupBy.join(', ')}` : '';
  if (timeField === undefined) {
    return clause;
  }
  if (groupBy.length === 0) {
    return ` GROUP BY time`;
  }
  return `${clause}, time`;
};

const getOrderBy = (orderBy?: OrderBy[], prefix = true): string => {
  const pfx = prefix ? ' ORDER BY ' : '';
  return orderBy && orderBy.filter((o) => o.name).length > 0
    ? pfx +
    orderBy
      .filter((o) => o.name)
      .map((o) => {
        return `${o.name} ${o.dir}`;
      })
      .join(', ')
    : '';
};

const getLimit = (limit?: number): string => {
  return ` LIMIT ` + (limit || 100);
};

export const getSQLFromQueryOptions = (options: SqlBuilderOptions): string => {
  const limit = options.limit ? getLimit(options.limit) : '';
  let query = ``;
  switch (options.mode) {
    case BuilderMode.Aggregate:
      query += getAggregationQuery(options.database, options.table, options.fields, options.metrics, options.groupBy);
      let aggregateFilters = getFilters(options.filters || []);
      if (aggregateFilters) {
        query += ` WHERE ${aggregateFilters}`;
      }
      query += getGroupBy(options.groupBy);
      break;
    case BuilderMode.Trend:
      query += getTrendByQuery(
        options.database,
        options.table,
        options.metrics,
        options.groupBy,
        options.timeField,
        options.timeFieldType
      );
      if (isDateType(options.timeFieldType)) {
        query += ` WHERE $__timeFilter(${options.timeField})`;
      }
      const trendFilters = getFilters(options.filters || []);
      query += trendFilters ? ` AND ${trendFilters}` : '';
      query += getGroupBy(options.groupBy, options.timeField);
      break;
    case BuilderMode.List:
    default:
      query += getListQuery(options.database, options.table, options.fields);
      const filters = getFilters(options.filters || []);
      if (filters) {
        query += ` WHERE ${filters}`;
      }
  }
  if (options.mode === BuilderMode.Trend) {
    query += ` ORDER BY time ASC`;
    const orderBy = getOrderBy(options.orderBy, false);
    if (orderBy.trim() !== '') {
      query += `, ${orderBy}`;
    }
    query += limit;
  } else {
    query += getOrderBy(options.orderBy);
    query += limit;
  }
  return query;
};

function createAST(sql: string): Statement {
  const replaceFuncs = [] as {
    startIndex: number,
    name: string,
    replacementName: string,
  }[];
  const re = /(\$__timeInterval|\$__timeFilter|\$__fromTime|\$__toTime)/gi
  let regExpArray: RegExpExecArray | null;
  while ((regExpArray = re.exec(sql)) !== null) {
    replaceFuncs.push({ startIndex: regExpArray.index, name: regExpArray[0], replacementName: '' })
  }

  //need to process in reverse so starting positions aren't effected by replacing other things
  for (let i = replaceFuncs.length - 1; i >= 0; i--) {
    const si = replaceFuncs[i].startIndex;
    const replacementName = 'f' + (Math.random() + 1).toString(36).substring(7);
    replaceFuncs[i].replacementName = replacementName;
    sql = sql.substring(0, si) + replacementName + sql.substring(si + replaceFuncs[i].name.length);
  }

  let ast: Statement;
  try {
    ast = parseFirst(sql);
  } catch (err) {
    //err invalid sql
    return {} as Statement;
  }

  const mapper = astMapper(map => ({
    ref: r => {
      const rf = replaceFuncs.find(x => x.replacementName === r.name);
      if (rf) {
        return { ...r, name: rf.name };
      }
      return map.super().ref(r);
    },
    call: c => {
      const rf = replaceFuncs.find(x => x.replacementName === c.function.name);
      if (rf) {
        return { ...c, function: { ...c.function, name: rf.name } };
      }
      return map.super().call(c);
    }
  }));
  return mapper.statement(ast)!;
}

export function getQueryOptionsFromSql(sql: string): SqlBuilderOptions {
  const ast = createAST(sql);
  if (!ast) {
    console.error("Issues with select parsing select statement");
    return {} as SqlBuilderOptions;
  }
  if (ast.type !== 'select') {
    console.error("Not a select statement");
    return {} as SqlBuilderOptions;
  }
  if (!ast.from || ast.from.length !== 1) {
    console.error("Too many from clauses");
    return {} as SqlBuilderOptions;
  }
  if (ast.from[0].type !== 'table') {
    console.error("From clause is not a table");
    return {} as SqlBuilderOptions;
  }
  const fromTable = ast.from[0] as FromTable;

  const fieldsAndMetrics = getMetricsFromAst(ast.columns!);

  let builder = {
    mode: BuilderMode.List,
    database: fromTable.name.schema,
    table: fromTable.name.name,
  } as SqlBuilderOptions;

  if (fieldsAndMetrics.fields) {
    builder.fields = fieldsAndMetrics.fields;
  }

  if (fieldsAndMetrics.metrics.length > 0) {
    builder.mode = BuilderMode.Aggregate;
    (builder as SqlBuilderOptionsAggregate).metrics = fieldsAndMetrics.metrics;
  }

  if (fieldsAndMetrics.timeField) {
    builder.mode = BuilderMode.Trend;
    (builder as SqlBuilderOptionsTrend).timeField = fieldsAndMetrics.timeField;
  }

  if (ast.where) {
    builder.filters = getFiltersFromAst(ast.where);
  }

  const orderBy = ast.orderBy
    ?.map<OrderBy>((ob) => {
      if (ob.by.type !== 'ref') {
        return {} as OrderBy;
      }
      return { name: ob.by.name, dir: ob.order } as OrderBy;
    })
    .filter((x) => x);

  if (orderBy && orderBy.length > 0) {
    (builder as SqlBuilderOptionsAggregate).orderBy = orderBy!;
  }

  builder.limit = ast.limit?.limit?.type === 'integer' ? ast.limit?.limit.value : undefined;

  const groupBy = ast.groupBy
    ?.map((gb) => {
      if (gb.type !== 'ref') {
        return '';
      }
      return gb.name;
    })
    .filter((x) => x !== '');
  if (groupBy && groupBy.length > 0) {
    (builder as SqlBuilderOptionsAggregate).groupBy = groupBy;
  }
  return builder;
}

function getFiltersFromAst(expr: Expr): Filter[] {
  //SELECT a, j, q FROM t WHERE   ( f != 'a' ) AND ( g = 'a' ) AND ( h = 'a' ) AND ( i = 'a' ) AND ( Id IS NOT NULL ) ORDER BY j ASC LIMIT 100

  const filters: Filter[] = [];
  let i = 0;
  const visitor = astVisitor(map => ({
    expr: e => {
      console.log(e);
      switch (e?.type) {
        case 'binary':
          if (e.op === 'AND' || e.op === 'OR') {
            filters.unshift({
              condition: e.op,
            } as Filter);
          }
          else if (Object.values(FilterOperator).find(x => e.op === x)) {
            if (i === 0) filters.unshift({} as Filter);
            filters[i].operator = e.op as FilterOperator;
          }
          map.super().expr(e);
          break;
        case 'ref':
          filters[i].key = e.name;
          if (filters[i].operator === FilterOperator.IsNotNull) {
            i++;
          }
          break;
        case 'string':
          filters[i] = { ...filters[i], value: e.value, type: 'string' } as Filter;
          i++;
          break;
        case 'integer':
          filters[i] = { ...filters[i], value: e.value, type: 'int' } as Filter;
          i++;
          break;
        case 'unary':
          if (i === 0) filters.unshift({} as Filter);
          filters[i].operator = e.op as FilterOperator;
          break;
        case 'call':
          const val = `${e.function.name}(${e.args.map<string>(x => (x as ExprRef).name).join(',')})`;
          filters[i] = { ...filters[i], value: val, type: 'datetime' } as Filter;
          if (!val) i++;
          break;
        default:
          console.debug(e?.type + ' add this type');
          break;
      }
    },
  }))
  visitor.expr(expr);
  return filters;
}

function selectCallFunc(s: SelectedColumn): BuilderMetricField | string {
  if (s.expr.type !== 'call') return {} as BuilderMetricField;
  let fields = s.expr.args.map(x => {
    if (x.type !== 'ref') {
      //err
      return '';
    }
    return x.name;
  });
  if (fields.length > 1) {
    //err
  }
  if (Object.values(BuilderMetricFieldAggregation).includes(s.expr.function.name.toLocaleLowerCase() as BuilderMetricFieldAggregation))
    return { aggregation: s.expr.function.name as BuilderMetricFieldAggregation, field: fields[0], alias: s.alias?.name } as BuilderMetricField;
  return fields[0];
}

function getMetricsFromAst(selectClauses: SelectedColumn[]): { timeField: string, metrics: BuilderMetricField[]; fields: string[] } {
  const metrics: BuilderMetricField[] = [];
  const fields: string[] = [];
  let timeField = '';

  for (let s of selectClauses) {
    switch (s.expr.type) {
      case 'ref':
        fields.push(s.expr.name);
        break;
      case 'call':
        const f = selectCallFunc(s)
        if (isString(f)) {
          timeField = f;
        }
        else {
          metrics.push(f);
        }
        break;
      default:
        //error
        break;
    }
  }
  return { timeField: timeField, metrics, fields };
}

export const operMap = new Map<string, FilterOperator>([
  ['equals', FilterOperator.Equals],
  ['contains', FilterOperator.Like],
]);

export function getOper(v: string): FilterOperator {
  return operMap.get(v) || FilterOperator.Equals;
}
