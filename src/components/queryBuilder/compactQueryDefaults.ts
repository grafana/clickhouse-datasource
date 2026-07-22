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
import {
  getDefaultLogsFilters,
  getDefaultLogsOrderBy,
  getDefaultTraceFilters,
  getDefaultTraceOrderBy,
} from './defaultQueryOptions';
import { isCollectionColumnType, isDateTimeColumn } from './views/columnNameHeuristics';

/**
 * Appends the datasource's configured extra log columns so they surface as first-class
 * fields. Two modes (both default off, so existing datasources are unaffected):
 *   - includeAllColumns: every detected top-level scalar column (skips the attribute maps,
 *     `__`-prefixed materialized/plumbing columns, DateTime columns, and anything already
 *     selected). Needs the table schema, so `allColumns` must be populated.
 *   - additionalColumns: an explicit list; needs no schema, so it is always a single query.
 * Mutates `columns` / `includedColumns` in place. Reuses the same shape as the
 * Show-context column append, but is independent of that feature.
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

export const isDefaultOrMismatchedCompactQuery = (
  builderOptions: QueryBuilderOptions,
  signalType: SignalType
): boolean => {
  const expectedQueryType = getCompactQueryType(signalType);
  const isDefaultState =
    builderOptions.queryType === QueryType.Table &&
    !builderOptions.database &&
    !builderOptions.table &&
    (!builderOptions.columns || builderOptions.columns.length === 0) &&
    (!builderOptions.filters || builderOptions.filters.length === 0) &&
    (!builderOptions.aggregates || builderOptions.aggregates.length === 0);

  return isDefaultState || builderOptions.queryType !== expectedQueryType;
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

const getLogsDefaultColumns = (datasource: Datasource, allColumns: readonly TableColumn[]): SelectedColumn[] => {
  const nextColumns = getDefaultColumns(datasource.getDefaultLogsColumns());
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
