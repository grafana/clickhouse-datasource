import sqlToAST, { Clause } from 'data/ast';
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
} from 'types';

export const isBooleanType = (type: string): boolean => {
  return ['boolean'].includes(type.toLowerCase());
};
export const isNumberType = (type: string): boolean => {
  const numericTypes = ['int', 'float', 'decimal'];
  const match = numericTypes.find((t) => type.toLowerCase().includes(t));
  return match !== undefined;
};
export const isDateType = (type: string): boolean => {
  return ['date', 'datetime'].includes(type.toLowerCase());
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
  return `SELECT ${selected}${selected && (groupByQuery || metricsQuery) ? ', ' : ''}${groupByQuery}${
    metricsQuery && groupByQuery ? ', ' : ''
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

export function getQueryOptionsFromSql(sql: string): SqlBuilderOptions {
  const ast = sqlToAST(sql);
  const fromPhrase = ast.get('FROM');
  if (!fromPhrase || fromPhrase.length > 1 || !isString(fromPhrase[0])) {
    return {} as SqlBuilderOptions;
  }

  const databaseAndTable = fromPhrase[0].trim().split('.');
  const where = ast.get('WHERE');
  const limit = ast.get('LIMIT');

  const fieldsAndMetrics = getMetricsFromAst(ast.get('SELECT')!);

  let builder = {
    mode: fieldsAndMetrics.metrics.length > 0 ? BuilderMode.Aggregate : BuilderMode.List,
    database: databaseAndTable[1] ? databaseAndTable[0].trim() : '',
    table: databaseAndTable[1] ? databaseAndTable[1].trim() : databaseAndTable[0].trim(),
  } as SqlBuilderOptions;

  if (fieldsAndMetrics.fields) {
    builder.fields = fieldsAndMetrics.fields;
  }

  if (where && where.length > 0) {
    builder.filters = getFiltersFromAst(where);
  }

  const orderBy = ast
    .get('ORDER BY')
    ?.map<OrderBy>((phrase) => {
      if (!isString(phrase) || phrase.trim() === ',') {
        return {} as OrderBy;
      }
      const orderBySplit = phrase.trim().split(' ');
      return { name: orderBySplit[0], dir: orderBySplit[1]?.toUpperCase() } as OrderBy;
    })
    .filter((x) => x);

  if (orderBy && orderBy.length > 0) {
    (builder as SqlBuilderOptionsAggregate).orderBy = orderBy!;
  }

  if (limit && limit.length > 0) {
    builder.limit = Number.parseInt(limit[0]!.toString(), 10);
  }

  if (fieldsAndMetrics.metrics.length > 0) {
    (builder as SqlBuilderOptionsAggregate).metrics = fieldsAndMetrics.metrics;
  }

  const groupBy = ast
    .get('GROUP BY')
    ?.map((field) => {
      if (!isString(field) || field.trim() === ',') {
        return '';
      }
      return field.trim();
    })
    .filter((x) => x !== '');
  if (groupBy && groupBy.length > 0) {
    (builder as SqlBuilderOptionsAggregate).groupBy = groupBy;
  }
  return builder;
}

function getFiltersFromAst(whereClauses: Clause[]): Filter[] {
  // first condition is always AND but is not used
  const filters: Filter[] = [{ condition: 'AND' } as Filter];
  for (const c of whereClauses) {
    if (!isString(c)) {
      continue;
    }
    if (c.trim().toUpperCase() === 'AND') {
      filters.push({ condition: 'AND' } as Filter);
      continue;
    } else if (c.trim().toUpperCase() === 'OR') {
      filters.push({ condition: 'OR' } as Filter);
      continue;
    }
    const stringPhrases = c.match(/([''])(?:(?=(\\?))\2.)*?\1/g)?.map((x) => (x = x.substring(1, x.length - 1)));
    const phrases = c.match(/(\w+|\$(\w+)|!=|<=|>=|=)/g);
    if (!phrases) {
      continue;
    }
    const isNotClause = phrases[0] === 'NOT';
    const opAndVal = getOperatorAndValues(phrases, stringPhrases ? stringPhrases : []);
    filters[filters.length - 1] = {
      ...filters[filters.length - 1],
      filterType: 'custom',
      key: isNotClause ? phrases[1] : phrases[0],
      operator: opAndVal.f ? opAndVal.f : '',
      value: opAndVal.v ? opAndVal.v : '',
      type: getFilterType(c, stringPhrases),
    } as Filter;
  }
  return filters;
}

function getOperatorAndValues(phrases: string[], stringPhrases: string[]): { f: FilterOperator; v: any } {
  if (isWithInTimeRangeFilter(phrases)) {
    return {
      f: phrases[0] === 'NOT' ? FilterOperator.OutsideGrafanaTimeRange : FilterOperator.WithInGrafanaTimeRange,
      v: '',
    };
  }

  let op = phrases[1];
  if (Object.values(FilterOperator).includes(op.toUpperCase() as FilterOperator)) {
    return {
      f: op.toUpperCase() as FilterOperator,
      v: stringPhrases.length > 0 ? stringPhrases : phrases.slice(2, phrases.length),
    };
  }
  for (let i = 2; i < phrases.length; i++) {
    op += ` ${phrases[i]}`;
    if (Object.values(FilterOperator).includes(op.toUpperCase() as FilterOperator)) {
      return {
        f: op.toUpperCase() as FilterOperator,
        v: stringPhrases.length > 0 ? stringPhrases : phrases.slice(i + 1, phrases.length),
      };
    }
  }
  return { f: '' as FilterOperator, v: null };
}

function getFilterType(whereClause: string, stringPhrases?: string[]): '' | 'datetime' | 'date' | 'string' {
  if (stringPhrases && stringPhrases.length > 0) {
    return 'string';
  }
  if (whereClause.includes('__time') || whereClause.includes('__from') || whereClause.includes('__to')) {
    return 'datetime';
  }
  return '';
}

function isWithInTimeRangeFilter(phrases: string[]): boolean {
  if (!phrases || phrases.length === 0) {
    return false;
  }
  const has = { from: false, to: false };
  for (const p of phrases) {
    if (p.includes('__from')) {
      has.from = true;
    } else if (p.includes('__to')) {
      has.to = true;
    }
  }
  return has.from && has.to;
}

function getMetricsFromAst(selectClauses: Clause[]): { metrics: BuilderMetricField[]; fields: string[] } {
  let metrics: BuilderMetricField[] = [];
  const fields: string[] = [];
  for (const c of selectClauses) {
    if (!isString(c) || !c.trim() || c.trim() === ',') {
      continue;
    }
    let isMetric = false;
    metrics = metrics.concat(
      Object.values(BuilderMetricFieldAggregation)
        .filter((x) => c.trim().toLowerCase().startsWith(`${x}`))
        .map((x) => {
          const phrases = c.match(/\w+|\$(\w+)/g);
          if (!phrases) {
            return null;
          }
          const metric = {
            field: phrases[1] ? phrases[1] : '',
            aggregation: x,
          } as BuilderMetricField;

          // Alias does use 'as' like sum(field) total_Fields
          if (phrases[2]) {
            metric.alias = phrases[2];
          }
          // Alias does use 'as' like field as aliasField
          if (phrases[3]) {
            metric.alias = phrases[3];
          }
          isMetric = true;
          return metric;
        })
        .filter((x) => x) as BuilderMetricField[]
    );

    if (!isMetric) {
      fields.push(c.trim());
    }
  }
  return { metrics, fields };
}
export const operMap = new Map<string, FilterOperator>([
  ['equals', FilterOperator.Equals],
  ['contains', FilterOperator.Like],
]);

export function getOper(v: string): FilterOperator {
  return operMap.get(v) || FilterOperator.Equals;
}
