import { getSqlFromQueryBuilderOptions } from 'components/queryBuilder/utils';
import { ColumnHint, QueryBuilderOptions, QueryType, SelectedColumn, TimeUnit } from 'types/queryBuilder';


export const generateSql = (options: QueryBuilderOptions): string => {
  // const { database, table } = options;
  // const limit = getLimit(options.limit);

  if (options.queryType === QueryType.Traces) {
    return generateTraceQuery(options);
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

  if (!options.meta?.isTraceSearchMode && options.meta?.traceId) {
    const traceId = options.meta.traceId;
    queryParts.push('WHERE');
    queryParts.push(`traceID = '${traceId}'`);
  }

  if (traceStartTime !== undefined) {
    queryParts.push('ORDER BY startTime ASC');
  }

  if (limit !== '') {
    queryParts.push(limit);
  }

  return queryParts.join(' ');
}

export const getColumnByHint = (options: QueryBuilderOptions, hint: ColumnHint): SelectedColumn | undefined => options.columns?.find(c => c.hint === hint);
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

// const getColumnIdentifier = (col: SelectedColumn): string => {
//   if (col.alias) {
//     return `${col.name} as ${col.alias}`
//   }

//   return col.name;
// }

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
      return `intMul(${columnIdentifier}, 1000) as ${alias}`;
    case TimeUnit.Milliseconds:
      return `${columnIdentifier} as ${alias}`;
    case TimeUnit.Microseconds:
      return `intDiv(${columnIdentifier}, 1000) as ${alias}`;
    case TimeUnit.Nanoseconds:
      return `intDiv(${columnIdentifier}, 1000000) as ${alias}`;
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
