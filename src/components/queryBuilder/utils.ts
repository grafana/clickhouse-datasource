import { isString } from 'lodash';
import {
  AggregateColumn,
  AggregateType,
  BooleanFilter,
  BuilderMode,
  DateFilter,
  DateFilterWithoutValue,
  Filter,
  FilterOperator,
  MultiFilter,
  NullFilter,
  NumberFilter,
  StringFilter,
  OrderBy,
  OrderByDirection,
  QueryBuilderOptions,
  ColumnHint,
  SelectedColumn as CHSelectedColumn,
  QueryType,
} from 'types/queryBuilder';
import { sqlToStatement, ParsedSelectQuery } from 'data/ast';
import { ParsedColumn, ParsedFilter } from 'ch-parser/sql-parser';
import { isTimeIntervalMacro } from 'ch-parser/macro-preprocessor';
import { getColumnByHint, logColumnHintsToAlias } from 'data/sqlGenerator';
import { Datasource } from 'data/CHDatasource';
import { tryApplyColumnHints } from 'data/utils';

// ─── Type guards (shared by both paths) ──────────────────────────────────────

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

// ─── WASM path helpers ────────────────────────────────────────────────────────

const OPERATOR_MAP: Record<string, FilterOperator> = {
  '=':          FilterOperator.Equals,
  '!=':         FilterOperator.NotEquals,
  '<':          FilterOperator.LessThan,
  '<=':         FilterOperator.LessThanOrEqual,
  '>':          FilterOperator.GreaterThan,
  '>=':         FilterOperator.GreaterThanOrEqual,
  'like':       FilterOperator.Like,
  'notLike':    FilterOperator.NotLike,
  'ilike':      FilterOperator.ILike,
  'notILike':   FilterOperator.NotILike,
  'in':         FilterOperator.In,
  'notIn':      FilterOperator.NotIn,
  'isNull':     FilterOperator.IsNull,
  'isNotNull':  FilterOperator.IsNotNull,
  'timeFilter':       FilterOperator.WithInGrafanaTimeRange,
  'withinTimeRange':  FilterOperator.WithInGrafanaTimeRange,
  'outsideTimeRange': FilterOperator.OutsideGrafanaTimeRange,
};

function mapOperator(op: string): FilterOperator {
  return OPERATOR_MAP[op] ?? FilterOperator.Equals;
}

function filterType(valueType: string): string {
  switch (valueType) {
    case 'number':   return 'int';
    case 'datetime': return 'datetime';
    case 'list':     return 'string';
    default:         return 'string';
  }
}

function buildColumnsAndAggregates(parsed: ParsedColumn[]): {
  columns: CHSelectedColumn[];
  aggregates: AggregateColumn[];
} {
  const columns: CHSelectedColumn[] = [];
  const aggregates: AggregateColumn[] = [];

  for (const col of parsed) {
    if (col.isAggregate) {
      const aggType = col.aggregateType?.toLowerCase() as AggregateType | undefined;
      if (aggType && Object.values(AggregateType).includes(aggType)) {
        aggregates.push({
          aggregateType: aggType,
          column: col.aggregateColumn ?? '',
          alias: col.alias ?? undefined,
        });
      }
      continue;
    }

    if (isTimeIntervalMacro(col.name)) {
      const arg = col.name;
      columns.push({ name: arg, type: 'datetime', alias: col.alias ?? undefined, hint: ColumnHint.Time });
      continue;
    }

    columns.push({ name: col.name, alias: col.alias ?? undefined });
  }

  return { columns, aggregates };
}

function buildFilters(parsed: ParsedFilter[]): Filter[] {
  return parsed.map((f) => {
    const operator = mapOperator(f.operator);
    const type = filterType(f.valueType);
    const condition = f.condition as 'AND' | 'OR';

    if (operator === FilterOperator.IsNull || operator === FilterOperator.IsNotNull) {
      return {
        filterType: 'custom',
        key: f.key,
        type,
        operator,
        condition,
      } as NullFilter;
    }

    if (operator === FilterOperator.WithInGrafanaTimeRange || operator === FilterOperator.OutsideGrafanaTimeRange) {
      return {
        filterType: 'custom',
        key: f.key,
        type: 'datetime',
        operator,
        condition,
      } as DateFilterWithoutValue;
    }

    if (operator === FilterOperator.In || operator === FilterOperator.NotIn) {
      const values = Array.isArray(f.value)
        ? f.value
        : f.value !== null
        ? [f.value]
        : [];
      return {
        filterType: 'custom',
        key: f.key,
        type,
        operator,
        condition,
        value: values,
      } as MultiFilter;
    }

    if (type === 'int') {
      return {
        filterType: 'custom',
        key: f.key,
        type,
        operator,
        condition,
        value: f.value !== null ? Number(f.value) : 0,
      } as NumberFilter;
    }

    return {
      filterType: 'custom',
      key: f.key,
      type,
      operator,
      condition,
      value: f.value ?? '',
    } as Filter;
  });
}

function getQueryOptionsFromSqlWasm(
  sql: string,
  queryType?: QueryType,
  datasource?: Datasource
): QueryBuilderOptions {
  const parsed: ParsedSelectQuery | null = sqlToStatement(sql);

  if (!parsed) {
    throw new Error('The query is not valid SQL.');
  }
  if (!parsed.table) {
    throw new Error(`The 'FROM' clause is not a table.`);
  }

  const { columns, aggregates } = buildColumnsAndAggregates(parsed.columns);

  const builderOptions: QueryBuilderOptions = {
    database:  parsed.database || '',
    table:     parsed.table    || '',
    queryType: queryType || QueryType.Table,
    mode:      BuilderMode.List,
    columns:   [],
    aggregates: [],
  };

  if (columns.length > 0) {
    builderOptions.columns = columns;
  }

  if (queryType === QueryType.Logs) {
    tryApplyColumnHints(builderOptions.columns!, datasource?.getDefaultLogsColumns());
    tryApplyColumnHints(builderOptions.columns!, logColumnHintsToAlias);
  } else if (queryType === QueryType.Traces) {
    tryApplyColumnHints(builderOptions.columns!, datasource?.getDefaultTraceColumns());
  }

  if (aggregates.length > 0) {
    builderOptions.mode = BuilderMode.Aggregate;
    builderOptions.aggregates = aggregates;
  }

  const timeColumn = getColumnByHint(builderOptions, ColumnHint.Time);
  if (!queryType && timeColumn) {
    builderOptions.queryType = QueryType.TimeSeries;
    if (builderOptions.aggregates?.length || 0) {
      builderOptions.mode = BuilderMode.Trend;
    }
  }

  if (parsed.filters.length > 0) {
    builderOptions.filters = buildFilters(parsed.filters);
  }

  const orderBy: OrderBy[] = parsed.orderBy.map((ob) => ({
    name: ob.name,
    dir:  ob.dir === 'DESC' ? OrderByDirection.DESC : OrderByDirection.ASC,
  }));
  if (orderBy.length > 0) {
    builderOptions.orderBy = orderBy;
  }

  if (typeof parsed.limit === 'number') {
    builderOptions.limit = parsed.limit;
  }

  if (parsed.groupBy.length > 0) {
    builderOptions.groupBy = parsed.groupBy;
  }

  return builderOptions;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function getQueryOptionsFromSql(
  sql: string,
  queryType?: QueryType,
  datasource?: Datasource
): QueryBuilderOptions {
  return getQueryOptionsFromSqlWasm(sql, queryType, datasource);
}

// ─── Legacy helpers (still exported for compatibility) ────────────────────────

export const operMap = new Map<string, FilterOperator>([
  ['equals',   FilterOperator.Equals],
  ['contains', FilterOperator.Like],
]);

export function getOper(v: string): FilterOperator {
  return operMap.get(v) || FilterOperator.Equals;
}

// isString re-export so existing callers of this module that imported it here
// continue to work without modification.
export { isString };
