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
import otel from 'otel';
import {
  getDefaultLogsFilters,
  getDefaultLogsOrderBy,
  getDefaultTraceFilters,
  getDefaultTraceOrderBy,
} from './defaultQueryOptions';
import { isCollectionColumnType, isDateTimeColumn } from './views/columnNameHeuristics';

/**
 * Appends the datasource's configured extra log columns so they surface as first-class fields
 * (both modes default off): `includeAllColumns` adds every detected top-level scalar column and
 * needs the table schema; `additionalColumns` adds an explicit list and needs none. Mutates
 * `columns` / `includedColumns` in place.
 */
export const appendAdditionalLogColumns = (
  datasource: Datasource,
  allColumns: readonly TableColumn[],
  columns: SelectedColumn[],
  includedColumns: Set<string>
): void => {
  if (datasource.shouldIncludeAllLogColumns()) {
    for (const col of allColumns) {
      if (
        includedColumns.has(col.name) ||
        isCollectionColumnType(col.type) ||
        col.name.startsWith('__') ||
        isDateTimeColumn(col)
      ) {
        continue;
      }
      columns.push({ name: col.name, type: col.type });
      includedColumns.add(col.name);
    }
    return;
  }

  for (const columnName of datasource.getAdditionalLogColumns()) {
    if (includedColumns.has(columnName) || includedColumns.has(columnName.split('[')[0])) {
      continue;
    }
    columns.push({ name: columnName });
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
  const defaultDb = datasource.getDefaultLogsDatabase() || datasource.getDefaultDatabase();
  const defaultTable = datasource.getDefaultLogsTable() || datasource.getDefaultTable() || fallbackTable;
  const otelVersion = datasource.getLogsOtelVersion();
  const columns = getLogsDefaultColumns(datasource, allColumns);

  return {
    database: defaultDb,
    table: defaultTable || '',
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
  const defaultDb = datasource.getDefaultTraceDatabase() || datasource.getDefaultDatabase();
  const defaultTable = datasource.getDefaultTraceTable() || datasource.getDefaultTable() || fallbackTable;
  const otelVersion = datasource.getTraceOtelVersion();

  return {
    database: defaultDb,
    table: defaultTable || '',
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
