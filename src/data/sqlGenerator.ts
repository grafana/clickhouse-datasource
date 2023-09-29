import { getSqlFromQueryBuilderOptions, getFilters, getOrderBy } from 'components/queryBuilder/utils';
import { ColumnHint, QueryBuilderOptions, QueryType, SelectedColumn, TimeUnit } from 'types/queryBuilder';


export const generateSql = (options: QueryBuilderOptions): string => {
  // const { database, table } = options;
  // const limit = getLimit(options.limit);

  if (options.queryType === QueryType.Traces) {
    return generateTraceQuery(options);
  } else if (options.queryType === QueryType.Logs) {
    return generateLogsQuery(options);
  }

  // const queryParts = [];
  // return queryParts.join(' ').trim();
  return getSqlFromQueryBuilderOptions(options);
}

/**
 * Generates trace query with columns that fit Grafana's Trace panel
 * Column aliases follow this structure:
 * https://grafana.com/docs/grafana/latest/explore/trace-integration/#data-frame-structure
 */
const generateTraceQuery = (options: QueryBuilderOptions): string => {
  const { database, table } = options;
  const limit = getLimit(options.limit);
  
  const queryParts: string[] = [];

  // TODO: these columns could be a map or some other convenience function
  const selectParts: string[] = [];
  const traceId = getColumnByHint(options, ColumnHint.TraceId);
  if (traceId !== undefined) {
    selectParts.push(`${escapeIdentifier(traceId.name)} as traceID`);
  }
  
  const traceSpanId = getColumnByHint(options, ColumnHint.TraceSpanId);
  if (traceSpanId !== undefined) {
    selectParts.push(`${escapeIdentifier(traceSpanId.name)} as spanID`);
  }
  
  const traceParentSpanId = getColumnByHint(options, ColumnHint.TraceParentSpanId);
  if (traceParentSpanId !== undefined) {
    selectParts.push(`${escapeIdentifier(traceParentSpanId.name)} as parentSpanID`);
  }
  
  const traceServiceName = getColumnByHint(options, ColumnHint.TraceServiceName);
  if (traceServiceName !== undefined) {
    selectParts.push(`${escapeIdentifier(traceServiceName.name)} as serviceName`);
  }
  
  const traceOperationName = getColumnByHint(options, ColumnHint.TraceOperationName);
  if (traceOperationName !== undefined) {
    selectParts.push(`${escapeIdentifier(traceOperationName.name)} as operationName`);
  }
  
  const traceStartTime = getColumnByHint(options, ColumnHint.TraceStartTime);
  if (traceStartTime !== undefined) {
    selectParts.push(`toInt64(${escapeIdentifier(traceStartTime.name)}) as startTime`);
  }
  
  const traceDurationTime = getColumnByHint(options, ColumnHint.TraceDurationTime);
  if (traceDurationTime !== undefined) {
    const timeUnit = options.meta?.traceDurationUnit;
    selectParts.push(getTraceDurationSelectSql(escapeIdentifier(traceDurationTime.name), timeUnit));
  }
  
  const traceTags = getColumnByHint(options, ColumnHint.TraceTags);
  if (traceTags !== undefined) {
    selectParts.push(`arrayMap(key -> map('key', key, 'value',${escapeIdentifier(traceTags.name)}[key]), mapKeys(${escapeIdentifier(traceTags.name)})) as tags`);
  }
  
  const traceServiceTags = getColumnByHint(options, ColumnHint.TraceServiceTags);
  if (traceServiceTags !== undefined) {
    selectParts.push(`arrayMap(key -> map('key', key, 'value',${escapeIdentifier(traceServiceTags.name)}[key]), mapKeys(${escapeIdentifier(traceServiceTags.name)})) as serviceTags`);
  }
  const selectPartsSql = selectParts.join(', ');

  queryParts.push('SELECT');
  queryParts.push(selectPartsSql);
  queryParts.push('FROM');
  queryParts.push(getTableIdentifier(database, table));

  const hasTraceIdFilter = !options.meta?.isTraceSearchMode && options.meta?.traceId
  const hasFilters = (options.filters?.length || 0) > 0;

  if (hasTraceIdFilter || hasFilters) {
    queryParts.push('WHERE');
  }

  if (hasTraceIdFilter) {
    const traceId = options.meta!.traceId;
    queryParts.push(`traceID = '${traceId}'`);
  }

  if (hasFilters) {
    queryParts.push(getFilters(options.filters!));
  }

  if (traceStartTime !== undefined) {
    queryParts.push('ORDER BY startTime ASC');
  }

  if (limit !== '') {
    queryParts.push(limit);
  }

  return queryParts.join(' ');
}

/**
 * Generates logs query with columns that fit Grafana's Logs panel
 * Column aliases follow this structure:
 * https://grafana.com/developers/plugin-tools/tutorials/build-a-logs-data-source-plugin#logs-data-frame-format
 * 
 * note: column order seems to matter as well as alias name
 */
const generateLogsQuery = (options: QueryBuilderOptions): string => {
  const { database, table } = options;
  const limit = getLimit(options.limit);
  
  const queryParts: string[] = [];

  // TODO: these columns could be a map or some other convenience function
  const selectParts: string[] = [];
  const logTime = getColumnByHint(options, ColumnHint.Time);
  if (logTime !== undefined) {
    // Must be first column in list.
    logTime.alias = 'timestamp';
    selectParts.push(getColumnIdentifier(logTime));
  }

  const logMessage = getColumnByHint(options, ColumnHint.LogMessage);
  if (logMessage !== undefined) {
    // Must be second column in list.
    logMessage.alias = 'body';
    selectParts.push(getColumnIdentifier(logMessage));
  }

  const logLevel = getColumnByHint(options, ColumnHint.LogLevel);
  if (logLevel !== undefined) {
    // TODO: "severity" should be a number, but "level" can be a string? Perhaps we can check the column type here?
    logLevel.alias = 'level';
    selectParts.push(getColumnIdentifier(logLevel));
  }

  const selectPartsSql = selectParts.join(', ');

  queryParts.push('SELECT');
  queryParts.push(selectPartsSql);
  queryParts.push('FROM');
  queryParts.push(getTableIdentifier(database, table));

  if ((options.filters?.length || 0) > 0) {
    queryParts.push('WHERE');
    queryParts.push(getFilters(options.filters!));
  }

  if ((options.orderBy?.length || 0) > 0) {
    queryParts.push('ORDER BY');
    queryParts.push(getOrderBy(options.orderBy, false));
  }

  if (limit !== '') {
    queryParts.push(limit);
  }

  return queryParts.join(' ');
}

export const getColumnByHint = (options: QueryBuilderOptions, hint: ColumnHint): SelectedColumn | undefined => options.columns?.find(c => c.hint === hint);
export const getColumnIndexByHint = (options: QueryBuilderOptions, hint: ColumnHint): number => options.columns?.findIndex(c => c.hint === hint) || -1;
export const getColumnsByHints = (options: QueryBuilderOptions, hints: readonly ColumnHint[]): readonly SelectedColumn[] => {
  const columns = [];

  for (let hint of hints) {
    const col = getColumnByHint(options, hint);
    if (col !== undefined) {
      columns.push(col);
    }
  }

  return columns;
}

const getColumnIdentifier = (col: SelectedColumn): string => {
  let colName = escapeIdentifier(col.name);

  // allow for functions like count()
  if (colName.includes('(') || colName.includes(')')) {
    colName = col.name
  }

  if (col.alias) {
    return `${colName} as ${col.alias}`
  }

  return colName;
}

const getTableIdentifier = (database: string, table: string): string => {
  const sep = (database === '' || table === '') ? '' : '.';
  return `${escapeIdentifier(database)}${sep}${escapeIdentifier(table)}`;
}

const escapeIdentifier = (id: string): string => {
  return id === '' ? '' : `"${id}"`;
}

/**
 * Returns the a SELECT column for trace duration.
 * Time unit is used to convert the value to milliseconds, as is required by Grafana's Trace panel.
 */
const getTraceDurationSelectSql = (columnIdentifier: string, timeUnit?: TimeUnit): string => {
  const alias = 'duration';
  switch (timeUnit) {
    case TimeUnit.Seconds:
      return `multiply(${columnIdentifier}, 1000) as ${alias}`;
    case TimeUnit.Milliseconds:
      return `${columnIdentifier} as ${alias}`;
    case TimeUnit.Microseconds:
      return `intDivOrZero(${columnIdentifier}, 1000) as ${alias}`;
    case TimeUnit.Nanoseconds:
      return `intDivOrZero(${columnIdentifier}, 1000000) as ${alias}`;
    default:
      return `${columnIdentifier} as ${alias}`;
  }
}

const getLimit = (limit?: number | undefined): string => {
  if (limit === undefined) {
    return '';
  }

  return 'LIMIT ' + Math.max(0, limit || 1000);
};
