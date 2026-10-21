import { Datasource } from 'data/CHDatasource';
import { isBuilderOptionsRunnable } from 'data/utils';
import {
  BuilderMode,
  ColumnHint,
  Filter,
  FilterOperator,
  QueryBuilderOptions,
  QueryType,
  SelectedColumn,
} from 'types/queryBuilder';
import {
  getDefaultLogsFilters,
  getDefaultLogsOrderBy,
  getDefaultTraceFilters,
  getDefaultTraceOrderBy,
} from './defaultQueryOptions';
import { getDefaultTimeSeriesFilters, getDefaultTimeSeriesOrderBy } from './views/timeSeriesQueryBuilderHooks';
import { buildDefaultLogsColumns } from './views/logsQueryBuilderHooks';
import { addRoleColumn, hasRole } from './roleColumns';

/**
 * Where a logs or traces query switched from another type should point. A query on one of the data
 * source's default tables (where the editor lands by itself) moves to the target type's default
 * table; any other table was picked, so it stays.
 */
const resolveSignalSource = (
  datasource: Datasource,
  options: QueryBuilderOptions,
  queryType: QueryType.Logs | QueryType.Traces
) => {
  const isLogs = queryType === QueryType.Logs;
  const defaultTable = (isLogs ? datasource.getDefaultLogsTable() : datasource.getDefaultTraceTable()) || '';
  const defaultDb =
    (isLogs ? datasource.getDefaultLogsDatabase() : datasource.getDefaultTraceDatabase()) ||
    datasource.getDefaultDatabase();
  const defaults: Array<[string | undefined, string | undefined]> = [
    [datasource.getDefaultDatabase(), datasource.getDefaultTable()],
    [datasource.getDefaultLogsDatabase() || datasource.getDefaultDatabase(), datasource.getDefaultLogsTable()],
    [datasource.getDefaultTraceDatabase() || datasource.getDefaultDatabase(), datasource.getDefaultTraceTable()],
  ];
  const onDefault = defaults.some(([db, table]) => table && db === options.database && table === options.table);
  const onTarget = options.database === defaultDb && options.table === defaultTable;
  const kept = !defaultTable || onTarget || !onDefault;
  const database = kept ? options.database : defaultDb;
  const table = kept ? options.table : defaultTable;
  // The configured columns and OTel setting describe the configured table.
  const usesConfiguredColumns = !defaultTable || (table === defaultTable && database === defaultDb);
  return { database, table, kept, usesConfiguredColumns };
};

// Table's Aggregate mode and Time series' Trend mode are the modes that apply aggregates and grouping.
// Trend counts whatever the current type: Logs and Traces keep it unseen, so a Time series query
// passing through them still has its aggregates on the way back.
const isAggregating = (options: QueryBuilderOptions): boolean =>
  options.mode === BuilderMode.Trend ||
  (options.queryType !== QueryType.TimeSeries &&
    options.mode === BuilderMode.Aggregate &&
    Boolean(options.aggregates?.length || options.groupBy?.length));

const isTimeRangeFilter = (f: Filter) => f.operator === FilterOperator.WithInGrafanaTimeRange;

/**
 * Adds the type's time-range filter when the query has none. Only for filters joined with AND:
 * filters render without outer parentheses, so `time AND a OR b` would still read `b` across all time.
 */
const withTimeRangeFilter = (filters: Filter[], defaults: Filter[]): Filter[] => {
  if (!filters.length) {
    return defaults;
  }
  const timeFilter = defaults.find(isTimeRangeFilter);
  if (!timeFilter || filters.some(isTimeRangeFilter) || filters.slice(1).some((f) => f.condition === 'OR')) {
    return filters;
  }
  // The first filter's condition is ignored until another filter precedes it.
  return [timeFilter, { ...filters[0], condition: 'AND' }, ...filters.slice(1)];
};

/**
 * What a query switched to `queryType` needs to run as that type, without replacing anything it
 * already has:
 * - for logs and traces, the type's default database and table unless the user picked them, and the
 *   configured role columns and OTel setting only when the query is on that configured table;
 * - a time-range filter when it has none, and default filters and ordering when it has none at all;
 * - the builder mode matching whether it aggregates, so aggregates are never applied unseen;
 * - unset trace settings.
 *
 * A query moved to the type's default table keeps only its limit: its columns, filters and ordering
 * belong to the old table, so it is cleared and the type's builder applies its full new-query
 * defaults, as it does for a query with nothing configured yet (which gets nothing here).
 *
 * Roles still missing are left to `guessMissingRoles`, which needs the table's columns.
 */
export const getQueryTypeChangeDefaults = (
  datasource: Datasource,
  options: QueryBuilderOptions,
  queryType: QueryType
): Partial<QueryBuilderOptions> => {
  if (!isBuilderOptionsRunnable(options)) {
    return {};
  }

  const meta = options.meta || {};
  const next: Partial<QueryBuilderOptions> = {};
  const nextMeta: NonNullable<QueryBuilderOptions['meta']> = {};
  let columns: SelectedColumn[] = [...(options.columns || [])];
  let filters = options.filters || [];
  let orderBy = options.orderBy || [];

  if (queryType === QueryType.Logs || queryType === QueryType.Traces) {
    const isLogs = queryType === QueryType.Logs;
    const source = resolveSignalSource(datasource, options, queryType);
    if (!source.kept) {
      return {
        database: source.database,
        table: source.table,
        columns: [],
        filters: [],
        orderBy: [],
        aggregates: [],
        groupBy: [],
      };
    }

    if (source.usesConfiguredColumns) {
      // On the configured table, add what a new query there starts with: the configured roles and,
      // for logs, the context and extra default columns ("Show context" needs the former).
      const defaults: SelectedColumn[] = isLogs
        ? buildDefaultLogsColumns(datasource)
        : Array.from(datasource.getDefaultTraceColumns(), ([hint, name]) => ({ name, hint }));
      for (const column of defaults) {
        if (column.hint !== undefined) {
          if (!hasRole(columns, column.hint)) {
            columns = addRoleColumn(columns, column);
          }
        } else if (!columns.some((c) => c.name === column.name)) {
          columns.push(column);
        }
      }
    }

    // The OTel setting describes the configured table; another table keeps only one already set.
    const otelVersion = source.usesConfiguredColumns
      ? isLogs
        ? datasource.getLogsOtelVersion()
        : datasource.getTraceOtelVersion()
      : undefined;
    const switchingSignal = options.queryType === (isLogs ? QueryType.Traces : QueryType.Logs);
    nextMeta.otelEnabled = switchingSignal ? Boolean(otelVersion) : (meta.otelEnabled ?? Boolean(otelVersion));
    nextMeta.otelVersion = switchingSignal ? otelVersion : (meta.otelVersion ?? otelVersion);
  }

  if (queryType === QueryType.Logs) {
    filters = withTimeRangeFilter(filters, getDefaultLogsFilters());
    orderBy = orderBy.length ? orderBy : getDefaultLogsOrderBy();
  } else if (queryType === QueryType.Traces) {
    if (!meta.isTraceIdMode) {
      filters = withTimeRangeFilter(filters, getDefaultTraceFilters());
      orderBy = orderBy.length ? orderBy : getDefaultTraceOrderBy();
    }
    nextMeta.traceDurationUnit = meta.traceDurationUnit ?? datasource.getDefaultTraceDurationUnit();
    nextMeta.flattenNested = meta.flattenNested ?? datasource.getDefaultTraceFlattenNested();
    nextMeta.traceEventsColumnPrefix = meta.traceEventsColumnPrefix ?? datasource.getDefaultTraceEventsColumnPrefix();
    nextMeta.traceLinksColumnPrefix = meta.traceLinksColumnPrefix ?? datasource.getDefaultTraceLinksColumnPrefix();
    nextMeta.traceTimestampTableSuffix = meta.traceTimestampTableSuffix ?? datasource.getTraceTimestampTableSuffix();
  } else if (queryType === QueryType.TimeSeries) {
    filters = withTimeRangeFilter(filters, getDefaultTimeSeriesFilters());
    orderBy = orderBy.length ? orderBy : getDefaultTimeSeriesOrderBy();
    Object.assign(
      next,
      isAggregating(options)
        ? { mode: BuilderMode.Trend }
        : // Time series' simple mode would still apply aggregates and grouping it doesn't show.
          { mode: BuilderMode.Aggregate, aggregates: [], groupBy: [] }
    );
  } else if (queryType === QueryType.Table) {
    const aggregating = isAggregating(options);
    next.mode = aggregating ? BuilderMode.Aggregate : BuilderMode.List;
    if (aggregating && options.queryType === QueryType.TimeSeries) {
      // Table has no time bucket: select the grouped columns instead of the time column.
      columns = columns.filter((c) => c.hint !== ColumnHint.Time);
      for (const name of options.groupBy || []) {
        if (!columns.some((c) => c.name === name)) {
          columns.push({ name });
        }
      }
    }
  }

  return { ...next, columns, filters, orderBy, meta: nextMeta };
};
