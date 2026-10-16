import { CoreApp } from '@grafana/data';
import { Datasource } from 'data/CHDatasource';
import {
  BuilderMode,
  ColumnHint,
  QueryBuilderOptions,
  QueryType,
  SelectedColumn,
  TableColumn,
} from 'types/queryBuilder';
import { SignalType } from 'types/config';
import { isBuilderOptionsRunnable } from 'data/utils';
import { getColumnByHint } from 'data/sqlGenerator';
import otel from 'otel';
import {
  getDefaultLogsFilters,
  getDefaultLogsOrderBy,
  getDefaultTraceFilters,
  getDefaultTraceOrderBy,
} from './defaultQueryOptions';
import { isBooleanType, isDateType, isNumberType } from './utils';
import { isCollectionColumnType } from './views/columnNameHeuristics';

/**
 * Appends the datasource's configured extra log columns (`additionalColumns`, an explicit list) so
 * they surface as first-class fields. Mutates `columns` / `includedColumns` in place.
 */
export const appendAdditionalLogColumns = (
  datasource: Datasource,
  allColumns: readonly TableColumn[],
  columns: SelectedColumn[],
  includedColumns: Set<string>
): void => {
  for (const columnName of datasource.getAdditionalLogColumns()) {
    const baseName = columnName.split('[')[0];
    if (includedColumns.has(columnName) || includedColumns.has(baseName)) {
      continue;
    }
    // Carry the schema type so downstream consumers (e.g. the labels fold's
    // collection/date checks) can reason about the column. `allColumns` is the
    // fetched table schema; it is empty on a cold load before the schema
    // resolves, in which case the type stays undefined (best effort).
    const type = allColumns.find((c) => c.name === columnName || c.name === baseName)?.type;
    columns.push(type ? { name: columnName, type } : { name: columnName });
    includedColumns.add(columnName);
  }
};

export const getCompactQueryType = (signalType: SignalType): QueryType => {
  return signalType === 'logs' ? QueryType.Logs : QueryType.Traces;
};

export const isDefaultCompactQuery = (builderOptions: QueryBuilderOptions): boolean => {
  return (
    builderOptions.queryType === QueryType.Table &&
    !builderOptions.database &&
    !builderOptions.table &&
    (!builderOptions.columns || builderOptions.columns.length === 0) &&
    (!builderOptions.filters || builderOptions.filters.length === 0) &&
    (!builderOptions.aggregates || builderOptions.aggregates.length === 0)
  );
};

export const isCompactQueryTypeMismatch = (builderOptions: QueryBuilderOptions, signalType: SignalType): boolean => {
  return builderOptions.queryType !== getCompactQueryType(signalType);
};

/**
 * The database and table a single-table data source is configured to query for its signal type.
 * Either value is empty when the configuration leaves it unset.
 */
export const getSingleTableLocation = (
  datasource: Datasource,
  signalType: SignalType
): { database: string; table: string } => {
  if (signalType === 'logs') {
    return {
      database: datasource.getDefaultLogsDatabase() || datasource.getDefaultDatabase(),
      table: datasource.getDefaultLogsTable() || datasource.getDefaultTable() || '',
    };
  }

  return {
    database: datasource.getDefaultTraceDatabase() || datasource.getDefaultDatabase(),
    table: datasource.getDefaultTraceTable() || datasource.getDefaultTable() || '',
  };
};

/**
 * True when a logs or traces builder query was built for another single-table data source: its
 * query type does not match the signal, or it reads a table other than the configured one.
 * Grafana keeps the query as-is when the user switches between two data sources of the same
 * plugin type, so this is how a query carried over from another data source arrives.
 *
 * Table and time series queries are never treated as carried over, since a single-table data
 * source does not build them; they were authored and are kept. Neither are queries opened from
 * a trace or log link, which carry `meta.minimized` (even once expanded).
 */
export const isQueryFromOtherSingleTableSource = (
  builderOptions: QueryBuilderOptions,
  datasource: Datasource,
  signalType: SignalType
): boolean => {
  const isCompactShaped = builderOptions.queryType === QueryType.Logs || builderOptions.queryType === QueryType.Traces;
  const { database, table } = getSingleTableLocation(datasource, signalType);
  if (!isCompactShaped || builderOptions.meta?.minimized !== undefined || !table) {
    return false;
  }

  return (
    isCompactQueryTypeMismatch(builderOptions, signalType) ||
    builderOptions.table !== table ||
    Boolean(database && builderOptions.database !== database)
  );
};

/**
 * True when the compact editor converts a carried-over query for this data source. Only
 * Explore does this, since its queries are not saved. In a dashboard the same query may have
 * been authored before the data source switched to single-table mode, so it is kept.
 */
export const shouldConvertCarriedOverQuery = (
  builderOptions: QueryBuilderOptions,
  datasource: Datasource,
  signalType: SignalType,
  app: CoreApp | undefined
): boolean => {
  return app === CoreApp.Explore && isQueryFromOtherSingleTableSource(builderOptions, datasource, signalType);
};

/**
 * Coarse kind of a ClickHouse column type, for matching a filter to a same-named column in
 * another table. Nullable and LowCardinality wrappers do not change the kind.
 */
const getColumnTypeKind = (type: string): string => {
  let inner = type.trim();
  while (/^(Nullable|LowCardinality)\(/.test(inner) && inner.endsWith(')')) {
    inner = inner.slice(inner.indexOf('(') + 1, -1).trim();
  }

  if (isCollectionColumnType(inner)) {
    return inner.split('(')[0];
  }
  if (isDateType(inner)) {
    return 'date';
  }
  if (isNumberType(inner)) {
    return 'number';
  }
  if (isBooleanType(inner)) {
    return 'boolean';
  }
  return 'string';
};

/**
 * Rebuilds a query carried over from another data source: this data source's compact defaults,
 * plus the carried filters that still fit. A filter on a column fits when this table has the
 * column with the same kind of type. A filter on a role fits when both queries have the same
 * signal, or when it is a trace ID filter and the defaults have a trace ID column. Search text
 * carries over only between data sources of the same signal.
 *
 * Filters are joined in order with no grouping, so dropping one side of an OR would change what
 * the rest selects. When some filters do not fit and any filter uses OR, none are carried.
 */
export const convertCarriedOverQuery = (
  carried: QueryBuilderOptions,
  defaults: QueryBuilderOptions,
  tableColumns: readonly TableColumn[]
): QueryBuilderOptions => {
  const sameSignal = carried.queryType === defaults.queryType;
  const columnKinds = new Map(tableColumns.map((column) => [column.name, getColumnTypeKind(column.type)]));
  const hasTraceIdColumn = Boolean(getColumnByHint(defaults, ColumnHint.TraceId));
  const carriedFilters = carried.filters || [];
  const fittingFilters = carriedFilters.filter((filter) =>
    filter.key
      ? columnKinds.get(filter.key) === getColumnTypeKind(filter.type)
      : sameSignal || (filter.hint === ColumnHint.TraceId && hasTraceIdColumn)
  );

  let filters = defaults.filters || [];
  if (sameSignal && fittingFilters.length === carriedFilters.length) {
    filters = carriedFilters;
  } else if (!carriedFilters.some((filter) => filter.condition === 'OR')) {
    // Roles the carried filters do not set keep their defaults, so the time range still applies.
    const carriedRoles = new Set(fittingFilters.filter((filter) => !filter.key).map((filter) => filter.hint));
    filters = [...filters.filter((filter) => filter.key || !carriedRoles.has(filter.hint)), ...fittingFilters];
  }

  const logMessageLike = sameSignal ? carried.meta?.logMessageLike : undefined;
  return {
    ...defaults,
    filters,
    meta: logMessageLike ? { ...defaults.meta, logMessageLike } : defaults.meta,
  };
};

/**
 * True when the compact editor should replace the saved options with generated defaults.
 * A mismatched query type alone is not enough: a query with meaningful user content
 * (columns, filters, aggregates, group by, or order by) must be preserved, never
 * silently replaced.
 */
export const shouldBuildCompactQueryDefaults = (
  builderOptions: QueryBuilderOptions,
  signalType: SignalType
): boolean => {
  if (isDefaultCompactQuery(builderOptions)) {
    return true;
  }

  return isCompactQueryTypeMismatch(builderOptions, signalType) && !isBuilderOptionsRunnable(builderOptions);
};

export function buildCompactQueryDefaults(
  datasource: Datasource,
  signalType: SignalType,
  fallbackTable = '',
  allColumns: readonly TableColumn[] = []
): QueryBuilderOptions {
  return signalType === 'logs'
    ? buildCompactLogsDefaults(datasource, fallbackTable, allColumns)
    : buildCompactTracesDefaults(datasource, fallbackTable);
}

const buildCompactLogsDefaults = (
  datasource: Datasource,
  fallbackTable: string,
  allColumns: readonly TableColumn[]
): QueryBuilderOptions => {
  const location = getSingleTableLocation(datasource, 'logs');
  const otelVersion = datasource.getLogsOtelVersion();
  const columns = getLogsDefaultColumns(datasource, allColumns);

  return {
    database: location.database,
    table: location.table || fallbackTable,
    queryType: QueryType.Logs,
    mode: BuilderMode.List,
    columns,
    filters: getDefaultLogsFilters(),
    orderBy: getDefaultLogsOrderBy(),
    limit: 1000,
    meta: {
      otelEnabled: Boolean(otelVersion),
      otelVersion,
    },
  };
};

const buildCompactTracesDefaults = (datasource: Datasource, fallbackTable: string): QueryBuilderOptions => {
  const location = getSingleTableLocation(datasource, 'traces');
  const otelVersion = datasource.getTraceOtelVersion();

  return {
    database: location.database,
    table: location.table || fallbackTable,
    queryType: QueryType.Traces,
    columns: getDefaultColumns(datasource.getDefaultTraceColumns()),
    filters: getDefaultTraceFilters(),
    orderBy: getDefaultTraceOrderBy(),
    limit: 1000,
    meta: {
      otelEnabled: Boolean(otelVersion),
      otelVersion,
      traceDurationUnit: datasource.getDefaultTraceDurationUnit(),
      flattenNested: datasource.getDefaultTraceFlattenNested(),
      traceEventsColumnPrefix: datasource.getDefaultTraceEventsColumnPrefix(),
      traceLinksColumnPrefix: datasource.getDefaultTraceLinksColumnPrefix(),
      traceTimestampTableSuffix: datasource.getTraceTimestampTableSuffix(),
    },
  };
};

// The 'latest' OTel alias resolves the log schema against the actual table
// rather than a fixed version: pre-v0.151.0 collector tables keep their
// TimestampTime column, newer ones don't, and both exist in the wild (see
// #1900). This mirrors useOtelColumns in logsQueryBuilderHooks. Pinned
// versions are honoured as-is, and without fetched columns the static latest
// map from the datasource remains the fallback.
const getLogsDefaultColumnMap = (
  datasource: Datasource,
  tableColumnNames: readonly string[]
): Map<ColumnHint, string> => {
  const otelConfig = otel.getVersion(datasource.getLogsOtelVersion());
  if (otelConfig?.version === 'latest' && tableColumnNames.length > 0) {
    return otel.detectLogsVersion(tableColumnNames).logColumnMap;
  }

  return datasource.getDefaultLogsColumns();
};

const getLogsDefaultColumns = (datasource: Datasource, allColumns: readonly TableColumn[]): SelectedColumn[] => {
  const nextColumns = getDefaultColumns(
    getLogsDefaultColumnMap(
      datasource,
      allColumns.map((column) => column.name)
    )
  );
  const includedColumns = new Set(nextColumns.map((c) => c.name));

  if (datasource.shouldSelectLogContextColumns()) {
    const contextColumnNames = datasource.getLogContextColumnNames();

    for (let columnName of contextColumnNames) {
      if (includedColumns.has(columnName) || includedColumns.has(columnName.split('[')[0])) {
        continue;
      }

      nextColumns.push({ name: columnName });
      includedColumns.add(columnName);
    }
  }

  appendAdditionalLogColumns(datasource, allColumns, nextColumns, includedColumns);

  return nextColumns;
};

const getDefaultColumns = (columns: Map<ColumnHint, string>): SelectedColumn[] => {
  const nextColumns: SelectedColumn[] = [];
  for (let [hint, name] of columns) {
    nextColumns.push({ name, hint });
  }
  return nextColumns;
};
