import { Datasource } from 'data/CHDatasource';
import {
  BuilderMode,
  ColumnHint,
  DateFilterWithoutValue,
  Filter,
  FilterOperator,
  NumberFilter,
  OrderBy,
  OrderByDirection,
  QueryBuilderOptions,
  QueryType,
  SelectedColumn,
  StringFilter,
} from 'types/queryBuilder';
import { SignalType } from 'types/config';

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
    filters: getLogsDefaultFilters(),
    orderBy: getLogsDefaultOrderBy(),
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
    filters: getTracesDefaultFilters(),
    orderBy: getTracesDefaultOrderBy(),
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

const getLogsDefaultFilters = (): Filter[] => [
  {
    type: 'datetime',
    operator: FilterOperator.WithInGrafanaTimeRange,
    filterType: 'custom',
    key: '',
    hint: ColumnHint.FilterTime,
    condition: 'AND',
  } as DateFilterWithoutValue,
  {
    type: 'string',
    operator: FilterOperator.IsAnything,
    filterType: 'custom',
    key: '',
    hint: ColumnHint.LogLevel,
    condition: 'AND',
    value: '',
  } as StringFilter,
];

const getLogsDefaultOrderBy = (): OrderBy[] => [
  { name: '', hint: ColumnHint.FilterTime, dir: OrderByDirection.DESC, default: true },
  { name: '', hint: ColumnHint.Time, dir: OrderByDirection.DESC, default: true },
];

const getTracesDefaultFilters = (): Filter[] => [
  {
    type: 'datetime',
    operator: FilterOperator.WithInGrafanaTimeRange,
    filterType: 'custom',
    key: '',
    hint: ColumnHint.Time,
    condition: 'AND',
  } as DateFilterWithoutValue,
  {
    type: 'string',
    operator: FilterOperator.IsEmpty,
    filterType: 'custom',
    key: '',
    hint: ColumnHint.TraceParentSpanId,
    condition: 'AND',
    value: '',
  } as StringFilter,
  {
    type: 'UInt64',
    operator: FilterOperator.GreaterThan,
    filterType: 'custom',
    key: '',
    hint: ColumnHint.TraceDurationTime,
    condition: 'AND',
    value: 0,
  } as NumberFilter,
  {
    type: 'string',
    operator: FilterOperator.IsAnything,
    filterType: 'custom',
    key: '',
    hint: ColumnHint.TraceServiceName,
    condition: 'AND',
    value: '',
  } as StringFilter,
];

const getTracesDefaultOrderBy = (): OrderBy[] => [
  { name: '', hint: ColumnHint.Time, dir: OrderByDirection.DESC, default: true },
  { name: '', hint: ColumnHint.TraceDurationTime, dir: OrderByDirection.DESC, default: true },
];
