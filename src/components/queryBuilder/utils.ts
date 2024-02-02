import {
  astVisitor,
  Expr,
  ExprBinary,
  ExprCall,
  ExprInteger,
  ExprList,
  ExprRef,
  ExprString,
  ExprUnary,
  FromTable,
  SelectedColumn,
} from 'pgsql-ast-parser';
import { isString } from 'lodash';
import {
  BooleanFilter,
  AggregateColumn,
  AggregateType,
  BuilderMode,
  DateFilter,
  DateFilterWithoutValue,
  Filter,
  FilterOperator,
  MultiFilter,
  NullFilter,
  NumberFilter,
  OrderBy,
  QueryBuilderOptions,
  ColumnHint,
  SelectedColumn as CHSelectedColumn,
  StringFilter,
  QueryType,
} from 'types/queryBuilder';
import { sqlToStatement } from 'data/ast';


export const isBooleanType = (type: string): boolean => {
  return ['boolean'].includes(type?.toLowerCase());
};

export const isNumberType = (type: string): boolean => {
  return ['int', 'float', 'decimal'].some((t) => type?.toLowerCase().includes(t));
};

export const isDateType = (type: string): boolean => {
  const normalizedName = type?.toLowerCase();
  return normalizedName?.startsWith('date') || normalizedName?.startsWith('nullable(date');
};
export const isDateTimeType = (type: string): boolean => {
  const normalizedName = type?.toLowerCase();
  return normalizedName?.startsWith('datetime') || normalizedName?.startsWith('nullable(datetime');
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

export function getQueryOptionsFromSql(sql: string): QueryBuilderOptions | string {
  const ast = sqlToStatement(sql);
  if (!ast) {
    return 'The query is not valid SQL.';
  }
  if (ast.type !== 'select') {
    return 'The query is not a select statement.';
  }
  if (!ast.from || ast.from.length !== 1) {
    return `The query has too many 'FROM' clauses.`;
  }
  if (ast.from[0].type !== 'table') {
    return `The 'FROM' clause is not a table.`;
  }
  const fromTable = ast.from[0] as FromTable;

  const columnsAndAggregates = getAggregatesFromAst(ast.columns ? ast.columns : null);

  let builder = {
    queryType: QueryType.Table,
    mode: BuilderMode.List,
    database: fromTable.name.schema,
    table: fromTable.name.name,
  } as QueryBuilderOptions;

  if (columnsAndAggregates.columns) {
    builder.columns = columnsAndAggregates.columns.map(f => ({ name: f }));
  }

  if (columnsAndAggregates.aggregates.length > 0) {
    builder.mode = BuilderMode.Aggregate;
    builder.aggregates = columnsAndAggregates.aggregates;
  }

  if (columnsAndAggregates.timeField) {
    builder.queryType = QueryType.TimeSeries;
    builder.mode = BuilderMode.Trend;
    const columns: CHSelectedColumn[] = builder.columns || [];
    columns.push({ name: columnsAndAggregates.timeField, type: 'datetime', hint: ColumnHint.Time });
    builder.columns = columns;
  }

  if (ast.where) {
    builder.filters = getFiltersFromAst(ast.where, columnsAndAggregates.timeField);
  }

  const orderBy = ast.orderBy
    ?.map<OrderBy>((ob) => {
      if (ob.by.type !== 'ref' || ob.by.name === 'time') {
        return {} as OrderBy;
      }
      return { name: ob.by.name, dir: ob.order } as OrderBy;
    })
    .filter((x) => x.name);

  if (orderBy && orderBy.length > 0) {
    builder.orderBy = orderBy!;
  }

  builder.limit = ast.limit?.limit?.type === 'integer' ? ast.limit?.limit.value : undefined;

  const groupBy = ast.groupBy
    ?.map((gb) => {
      if (gb.type !== 'ref' || gb.name === 'time') {
        return '';
      }
      return gb.name;
    })
    .filter((x) => x !== '');
  if (groupBy && groupBy.length > 0) {
    builder.groupBy = groupBy;
  }
  return builder;
}

function getFiltersFromAst(expr: Expr, timeField: string): Filter[] {
  const filters: Filter[] = [];
  let i = 0;
  let notFlag = false;
  const visitor = astVisitor((map) => ({
    expr: (e) => {
      switch (e?.type) {
        case 'binary':
          notFlag = getBinaryFilter(e, filters, i, notFlag);
          map.super().expr(e);
          break;
        case 'ref':
          ({ i, notFlag } = getRefFilter(e, filters, i, notFlag));
          break;
        case 'string':
          i = getStringFilter(filters, i, e);
          break;
        case 'integer':
          i = getIntFilter(filters, i, e);
          break;
        case 'unary':
          notFlag = getUnaryFilter(e, notFlag, i, filters);
          map.super().expr(e);
          break;
        case 'call':
          i = getCallFilter(e, timeField, filters, i);
          break;
        case 'list':
          i = getListFilter(filters, i, e);
          break;
        default:
          console.error(`${e?.type} is not supported. This is likely a bug.`);
          break;
      }
    },
  }));
  visitor.expr(expr);
  return filters;
}

function getRefFilter(e: ExprRef, filters: Filter[], i: number, notFlag: boolean): { i: number; notFlag: boolean } {
  if (e.name?.toLowerCase() === '$__fromtime' && filters[i].operator === FilterOperator.GreaterThanOrEqual) {
    if (notFlag) {
      filters[i].operator = FilterOperator.OutsideGrafanaTimeRange;
      notFlag = false;
    } else {
      filters[i].operator = FilterOperator.WithInGrafanaTimeRange;
    }
    filters[i].type = 'datetime';
    i++;
    return { i, notFlag };
  }
  if (e.name?.toLowerCase() === '$__totime') {
    filters.splice(i, 1);
    return { i, notFlag };
  }
  if (!filters[i].key) {
    filters[i].key = e.name;
    if (filters[i].operator === FilterOperator.IsNotNull) {
      i++;
    }
    return { i, notFlag };
  }
  filters[i] = { ...filters[i], value: [e.name], type: 'string' } as Filter;
  i++;
  return { i, notFlag };
}

function getListFilter(filters: Filter[], i: number, e: ExprList): number {
  filters[i] = {
    ...filters[i],
    value: e.expressions.map((x) => {
      const k = x as ExprString;
      return k.value;
    }),
    type: 'string',
  } as Filter;
  i++;
  return i;
}

function getCallFilter(e: ExprCall, timeField: string, filters: Filter[], i: number): number {
  const val = `${e.function.name}(${e.args.map<string>((x) => (x as ExprRef).name).join(',')})`;
  //do not add the timeFilter that is used when using time series and remove the condition
  if (val === `$__timefilter(${timeField})`) {
    filters.splice(i, 1);
    return i;
  }
  if (val.startsWith('$__timefilter(')) {
    filters[i] = {
      ...filters[i],
      key: (e.args[0] as ExprRef).name,
      operator: FilterOperator.WithInGrafanaTimeRange,
      type: 'datetime',
    } as Filter;
    i++;
    return i;
  }
  filters[i] = { ...filters[i], value: val, type: 'datetime' } as Filter;
  if (!val) {
    i++;
  }
  return i;
}

function getUnaryFilter(e: ExprUnary, notFlag: boolean, i: number, filters: Filter[]): boolean {
  if (e.op === 'NOT') {
    return true;
  }
  if (i === 0) {
    filters.unshift({} as Filter);
  }
  filters[i].operator = e.op as FilterOperator;
  return notFlag;
}

function getStringFilter(filters: Filter[], i: number, e: ExprString): number {
  if (!filters[i].key) {
    filters[i] = { ...filters[i], key: e.value } as Filter;
    return i;
  }
  filters[i] = { ...filters[i], value: e.value, type: 'string' } as Filter;
  i++;
  return i;
}

function getIntFilter(filters: Filter[], i: number, e: ExprInteger): number {
  if (!filters[i].key) {
    filters[i] = { ...filters[i], key: e.value.toString() } as Filter;
    return i;
  }
  filters[i] = { ...filters[i], value: e.value, type: 'int' } as Filter;
  i++;
  return i;
}

function getBinaryFilter(e: ExprBinary, filters: Filter[], i: number, notFlag: boolean): boolean {
  if (e.op === 'AND' || e.op === 'OR') {
    filters.unshift({
      condition: e.op,
    } as Filter);
  } else if (Object.values(FilterOperator).find((x) => e.op === x)) {
    if (i === 0) {
      filters.unshift({} as Filter);
    }
    filters[i].operator = e.op as FilterOperator;
    if (notFlag && filters[i].operator === FilterOperator.Like) {
      filters[i].operator = FilterOperator.NotLike;
      notFlag = false;
    }
  }
  return notFlag;
}

function selectCallFunc(s: SelectedColumn): AggregateColumn | string {
  if (s.expr.type !== 'call') {
    return {} as AggregateColumn;
  }
  let fields = s.expr.args.map((x) => {
    if (x.type !== 'ref') {
      return '';
    }
    return x.name;
  });
  if (fields.length > 1) {
    return '';
  }
  if (
    Object.values(AggregateType).includes(
      s.expr.function.name.toLowerCase() as AggregateType
    )
  ) {
    return {
      aggregateType: s.expr.function.name as AggregateType,
      column: fields[0],
      alias: s.alias?.name,
    } as AggregateColumn;
  }
  return fields[0];
}

function getAggregatesFromAst(selectClauses: SelectedColumn[] | null): {
  timeField: string;
  aggregates: AggregateColumn[];
  columns: string[];
} {
  if (!selectClauses) {
    return { timeField: '', aggregates: [], columns: [] };
  }
  const aggregates: AggregateColumn[] = [];
  const columns: string[] = [];
  let timeField = '';

  for (let s of selectClauses) {
    switch (s.expr.type) {
      case 'ref':
        columns.push(s.expr.name);
        break;
      case 'call':
        const f = selectCallFunc(s);
        if (!f) {
          return { timeField: '', aggregates: [], columns: [] };
        }
        if (isString(f)) {
          timeField = f;
        } else {
          aggregates.push(f);
        }
        break;
      default:
        return { timeField: '', aggregates: [], columns: [] };
    }
  }
  return { timeField, aggregates, columns };
}

export const operMap = new Map<string, FilterOperator>([
  ['equals', FilterOperator.Equals],
  ['contains', FilterOperator.Like],
]);

export function getOper(v: string): FilterOperator {
  return operMap.get(v) || FilterOperator.Equals;
}
