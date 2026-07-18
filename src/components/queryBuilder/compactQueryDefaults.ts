import { Datasource } from 'data/CHDatasource';
import { BuilderMode, ColumnHint, QueryBuilderOptions, QueryType, SelectedColumn } from 'types/queryBuilder';
import { SignalType } from 'types/config';
import { isBuilderOptionsRunnable } from 'data/utils';
import {
  getDefaultLogsFilters,
  getDefaultLogsOrderBy,
  getDefaultTraceFilters,
  getDefaultTraceOrderBy,
} from './defaultQueryOptions';

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
  fallbackTable = ''
): QueryBuilderOptions {
  return signalType === 'logs'
    ? buildCompactLogsDefaults(datasource, fallbackTable)
    : buildCompactTracesDefaults(datasource, fallbackTable);
}

const buildCompactLogsDefaults = (datasource: Datasource, fallbackTable: string): QueryBuilderOptions => {
  const defaultDb = datasource.getDefaultLogsDatabase() || datasource.getDefaultDatabase();
  const defaultTable = datasource.getDefaultLogsTable() || datasource.getDefaultTable() || fallbackTable;
  const otelVersion = datasource.getLogsOtelVersion();
  const columns = getLogsDefaultColumns(datasource);

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

const getLogsDefaultColumns = (datasource: Datasource): SelectedColumn[] => {
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

  return nextColumns;
};

const getDefaultColumns = (columns: Map<ColumnHint, string>): SelectedColumn[] => {
  const nextColumns: SelectedColumn[] = [];
  for (let [hint, name] of columns) {
    nextColumns.push({ name, hint });
  }
  return nextColumns;
};
