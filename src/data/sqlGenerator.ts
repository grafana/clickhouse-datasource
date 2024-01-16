import { getSqlFromQueryBuilderOptions, getOrderBy } from 'components/queryBuilder/utils';
import { BooleanFilter, BuilderMode, ColumnHint, DateFilterWithValue, FilterOperator, MultiFilter, NumberFilter, QueryBuilderOptions, QueryType, SelectedColumn, StringFilter, TimeUnit } from 'types/queryBuilder';

export const generateSql = (options: QueryBuilderOptions): string => {
  if (options.queryType === QueryType.Traces) {
    return generateTraceQuery(options);
  } else if (options.queryType === QueryType.Logs) {
    return generateLogsQuery(options);
  } else if (options.queryType === QueryType.TimeSeries && options.mode !== BuilderMode.Trend) {
    return generateSimpleTimeSeriesQuery(options);
  } else if (options.queryType === QueryType.TimeSeries && options.mode === BuilderMode.Trend) {
    return generateAggregateTimeSeriesQuery(options);
  }

  // QueryType.Table
  return getSqlFromQueryBuilderOptions(options);
}

/**
 * Generates trace query, either search or trace ID.
 */
const generateTraceQuery = (options: QueryBuilderOptions): string => {
  const hasTraceIdFilter = options.meta?.isTraceIdMode && options.meta?.traceId
  if (hasTraceIdFilter) {
    return generateTraceIdQuery(options);
  }

  return generateTraceSearchQuery(options);
}

/**
 * Generates trace search query.
 */
const generateTraceSearchQuery = (options: QueryBuilderOptions): string => {
  const { database, table } = options;
  
  const queryParts: string[] = [];

  // TODO: these columns could be a map or some other convenience function
  const selectParts: string[] = [];
  const traceId = getColumnByHint(options, ColumnHint.TraceId);
  if (traceId !== undefined) {
    selectParts.push(`${escapeIdentifier(traceId.name)} as traceID`);
  }
  
  const traceServiceName = getColumnByHint(options, ColumnHint.TraceServiceName);
  if (traceServiceName !== undefined) {
    selectParts.push(`${escapeIdentifier(traceServiceName.name)} as serviceName`);
  }
  
  const traceOperationName = getColumnByHint(options, ColumnHint.TraceOperationName);
  if (traceOperationName !== undefined) {
    selectParts.push(`${escapeIdentifier(traceOperationName.name)} as operationName`);
  }
  
  const traceStartTime = getColumnByHint(options, ColumnHint.Time);
  if (traceStartTime !== undefined) {
    selectParts.push(`${escapeIdentifier(traceStartTime.name)} as startTime`);
  }
  
  const traceDurationTime = getColumnByHint(options, ColumnHint.TraceDurationTime);
  if (traceDurationTime !== undefined) {
    const timeUnit = options.meta?.traceDurationUnit;
    selectParts.push(getTraceDurationSelectSql(escapeIdentifier(traceDurationTime.name), timeUnit));
  }
  
  const selectPartsSql = selectParts.join(', ');

  queryParts.push('SELECT');
  queryParts.push(selectPartsSql);
  queryParts.push('FROM');
  queryParts.push(getTableIdentifier(database, table));

  const hasFilters = (options.filters?.length || 0) > 0;
  if (hasFilters) {
    queryParts.push('WHERE');
    queryParts.push(getFilters(options));
  }

  if (traceStartTime !== undefined) {
    queryParts.push('ORDER BY startTime DESC');
  }

  const limit = getLimit(options.limit);
  if (limit !== '') {
    queryParts.push(limit);
  }

  return concatQueryParts(queryParts);
}

/**
 * Generates trace query with columns that fit Grafana's Trace panel
 * Column aliases follow this structure:
 * https://grafana.com/docs/grafana/latest/explore/trace-integration/#data-frame-structure
 */
const generateTraceIdQuery = (options: QueryBuilderOptions): string => {
  const { database, table } = options;
  
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
  
  const traceStartTime = getColumnByHint(options, ColumnHint.Time);
  if (traceStartTime !== undefined) {
    selectParts.push(`${escapeIdentifier(traceStartTime.name)} as startTime`);
  }
  
  const traceDurationTime = getColumnByHint(options, ColumnHint.TraceDurationTime);
  if (traceDurationTime !== undefined) {
    const timeUnit = options.meta?.traceDurationUnit;
    selectParts.push(getTraceDurationSelectSql(escapeIdentifier(traceDurationTime.name), timeUnit));
  }
  
  // TODO: for tags and serviceTags, consider the column type. They might not require mapping, they could already be JSON.
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

  const hasTraceIdFilter = options.meta?.isTraceIdMode && options.meta?.traceId
  const hasFilters = (options.filters?.length || 0) > 0;

  if (hasTraceIdFilter || hasFilters) {
    queryParts.push('WHERE');
  }

  if (hasTraceIdFilter) {
    const traceId = options.meta!.traceId;
    queryParts.push(`traceID = '${traceId}'`);
  }

  if (hasFilters) {
    queryParts.push(getFilters(options));
  }

  if (traceStartTime !== undefined) {
    queryParts.push('ORDER BY startTime DESC');
  }

  const limit = getLimit(options.limit);
  if (limit !== '') {
    queryParts.push(limit);
  }

  return concatQueryParts(queryParts);
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

  options.columns?.
    filter(c => c.hint === undefined). // remove specialized columns
    forEach(c => selectParts.push(getColumnIdentifier(c)));

  const selectPartsSql = selectParts.join(', ');

  queryParts.push('SELECT');
  queryParts.push(selectPartsSql);
  queryParts.push('FROM');
  queryParts.push(getTableIdentifier(database, table));

  if ((options.filters?.length || 0) > 0) {
    queryParts.push('WHERE');
    queryParts.push(getFilters(options));
  }

  if ((options.orderBy?.length || 0) > 0) {
    queryParts.push('ORDER BY');
    queryParts.push(getOrderBy(options.orderBy, false));
  }

  const limit = getLimit(options.limit);
  if (limit !== '') {
    queryParts.push(limit);
  }

  return concatQueryParts(queryParts);
}


/**
 * Generates a simple time series query. Includes user selected columns.
 */
const generateSimpleTimeSeriesQuery = (options: QueryBuilderOptions): string => {
  const { database, table } = options;
  
  const queryParts: string[] = [];

  const selectParts: string[] = [];
  const selectNames = new Set<string>();
  const timeColumn = getColumnByHint(options, ColumnHint.Time);
  const timeAlias = 'time';
  if (timeColumn !== undefined) {
    selectParts.push(`${timeColumn.name} as ${timeAlias}`);
    selectNames.add(timeAlias);
  }

  const columnsExcludingTimeColumn = options.columns?.filter(c => c.hint !== ColumnHint.Time);
  columnsExcludingTimeColumn?.forEach(c => {
    selectParts.push(getColumnIdentifier(c));
    selectNames.add(c.alias || c.name);
  });

  const aggregateSelectParts: string[] = [];
  options.aggregates?.forEach(agg => {
    const alias = agg.alias ? ` as ${agg.alias.replace(/ /g, '_')}` : '';
    const name = `${agg.aggregateType}(${agg.column})`;
    aggregateSelectParts.push(`${name}${alias}`);
    selectNames.add(alias ? alias.substring(4) : name);
  });

  options.groupBy?.forEach(g => {
    if (selectNames.has(g)) {
      // don't add if already selected
      return;
    }

    selectParts.push(g)
  });

  // aggregate selections go AFTER group by
  aggregateSelectParts.forEach(a => selectParts.push(a));
  
  const selectPartsSql = selectParts.join(', ');

  queryParts.push('SELECT');
  queryParts.push(selectPartsSql);
  queryParts.push('FROM');
  queryParts.push(getTableIdentifier(database, table));

  if ((options.filters?.length || 0) > 0) {    
    queryParts.push('WHERE');
    queryParts.push(getFilters(options));
  }

  
  if ((options.groupBy?.length || 0) > 0) {
    queryParts.push('GROUP BY');
    queryParts.push(`${options.groupBy!.join(', ')}, ${timeAlias}`);
  } else {
    // TODO: "simple" time series query doesn't have aggregates?
    // queryParts.push(timeAlias);
  }

  queryParts.push('ORDER BY');
  let orderBy = `${timeAlias} ASC`;
  if ((options.orderBy?.length || 0) > 0) {
    options.orderBy?.forEach(o => {
      orderBy += `, ${o.name} ${o.dir}`;
    });
  }
  queryParts.push(orderBy);

  const limit = getLimit(options.limit);
  if (limit !== '') {
    queryParts.push(limit);
  }

  return concatQueryParts(queryParts);
}

/**
 * Generates an aggregate time series query.
 */
const generateAggregateTimeSeriesQuery = (options: QueryBuilderOptions): string => {
  const { database, table } = options;
  
  const queryParts: string[] = [];

  const selectParts: string[] = [];
  const timeColumn = getColumnByHint(options, ColumnHint.Time);
  const timeAlias = 'time';
  if (timeColumn !== undefined) {
    selectParts.push(`$__timeInterval(${timeColumn.name}) as ${timeAlias}`);
  }

  options.groupBy?.forEach(g => selectParts.push(g));

  options.aggregates?.forEach(agg => {
    const alias = agg.alias ? ` as ${agg.alias.replace(/ /g, '_')}` : '';
    const name = `${agg.aggregateType}(${agg.column})`;
    selectParts.push(`${name}${alias}`);
  });
  
  const selectPartsSql = selectParts.join(', ');

  queryParts.push('SELECT');
  queryParts.push(selectPartsSql);
  queryParts.push('FROM');
  queryParts.push(getTableIdentifier(database, table));

  // A dashboard time filter is automatically added to time series queries, do we need this one?
  // queryParts.push(`$__timeFilter(${timeColumn?.name})`);

  const hasFilters = (options.filters?.length || 0) > 0;
  if (hasFilters) {
    queryParts.push('WHERE');
    queryParts.push(getFilters(options));
  }

  queryParts.push('GROUP BY');
  if ((options.groupBy?.length || 0) > 0) {
    queryParts.push(`${options.groupBy!.join(', ')}, ${timeAlias}`);
  } else {
    queryParts.push(timeAlias);
  }

  queryParts.push('ORDER BY');
  let orderBy = `${timeAlias} ASC`;
  if ((options.orderBy?.length || 0) > 0) {
    options.orderBy?.forEach(o => {
      orderBy += `, ${o.name} ${o.dir}`;
    });
  }
  queryParts.push(orderBy);

  const limit = getLimit(options.limit);
  if (limit !== '') {
    queryParts.push(limit);
  }

  return concatQueryParts(queryParts);
}

export const isAggregateQuery = (builder: QueryBuilderOptions): boolean => (builder.aggregates?.length || 0) > 0;
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
  let colName = col.name;
  
  if (colName.includes(' ')) {
    colName = escapeIdentifier(col.name);
  }

  // allow for functions like count()
  if (colName.includes('(') || colName.includes(')') || colName.includes('"') || colName.includes('"')) {
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

const escapeValue = (value: string): string => {
  if (value.includes('(') || value.includes(')') || value.includes('"') || value.includes('"')) {
    return value;
  }

  return `'${value}'`;
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

/**
 * Concatenates query parts with no empty spaces.
 */
const concatQueryParts = (parts: readonly string[]): string => {
  let query = '';
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p) {
      continue;
    }

    query += p;

    if (i !== parts.length - 1) {
      query += ' '
    }
  }

  return query;
}

const getLimit = (limit?: number | undefined): string => {
  limit = Math.max(0, limit || 0);
  if (limit > 0) {
    return 'LIMIT ' + limit;
  }

  return '';
};

const getFilters = (options: QueryBuilderOptions): string => {
  const filters = options.filters || [];
  const builtFilters: string[] = [];

  for (const filter of filters) {
    const filterParts: string[] = [];

    let column = filter.key;
    let type = filter.type;
    const hintedColumn = filter.hint && getColumnByHint(options, filter.hint);
    if (hintedColumn) {
      column = hintedColumn.name;
      type = hintedColumn.type || type;
    }

    if (!column) {
      continue;
    }

    if (filter.mapKey) {
      column += `['${filter.mapKey}']`;
    }

    filterParts.push(column);

    let operator: string = filter.operator;
    let negate = false;
    if (filter.operator === FilterOperator.NotLike) {
      operator = 'LIKE';
      negate = true;
    } else if (filter.operator === FilterOperator.OutsideGrafanaTimeRange) {
      operator = '';
      negate = true;
    } else if (filter.operator === FilterOperator.WithInGrafanaTimeRange){
        operator = '';
    }

    if (operator) {
      filterParts.push(operator);
    }
    
    if (isNullFilter(filter.operator)) {
      // empty
    } else if (isBooleanFilter(type)) {
      filterParts.push(String((filter as BooleanFilter).value));
    } else if (isNumberFilter(type)) {
      filterParts.push(String((filter as NumberFilter).value || '0'));
    } else if (isDateFilter(type)) {
      if (isDateFilterWithoutValue(type, filter.operator)) {
        if (isDateType(type)) {
          filterParts.push('>=', '\$__fromTime', 'AND', column, '<=', '\$__toTime');
        }
      } else {
        switch ((filter as DateFilterWithValue).value) {
          case 'GRAFANA_START_TIME':
            if (isDateType(type)) {
              filterParts.push('\$__fromTime');
            }
            break;
          case 'GRAFANA_END_TIME':
            if (isDateType(type)) {
              filterParts.push('\$__toTime');
            }
            break;
          default:
            filterParts.push(escapeValue(String((filter as DateFilterWithValue).value || 'TODAY')));
        }
      }
    } else if (isStringFilter(type, filter.operator)) {
      if (filter.operator === FilterOperator.Like || filter.operator === FilterOperator.NotLike) {
        filterParts.push(`'%${filter.value || ''}%'`);
      } else {
        filterParts.push(formatStringValue((filter as StringFilter).value || ''));
      }
    } else if (isMultiFilter(type, filter.operator)) {
      filterParts.push(`(${(filter as MultiFilter).value?.map(v => formatStringValue(v)).join(', ')})`);
    } else {
      filterParts.push(formatStringValue((filter as StringFilter).value || ''));
    }

    if (negate) {
      filterParts.unshift('NOT', '(');
      filterParts.push(')');
    }

    filterParts.unshift('(');
    if (builtFilters.length > 0) {
      filterParts.unshift(filter.condition);
    }
    filterParts.push(')');

    const builtFilter = concatQueryParts(filterParts);
    builtFilters.push(builtFilter);
  }

  return concatQueryParts(builtFilters);
};

const isBooleanType = (type: string): boolean => (type?.toLowerCase().startsWith('boolean'));
const numberTypes = ['int', 'float', 'decimal'];
const isNumberType = (type: string): boolean => numberTypes.some(t => type?.toLowerCase().includes(t));
const isDateType = (type: string): boolean => type?.toLowerCase().startsWith('date') || type?.toLowerCase().startsWith('nullable(date');
// const isDateTimeType = (type: string): boolean => type?.toLowerCase().startsWith('datetime') || type?.toLowerCase().startsWith('nullable(datetime');
const isStringType = (type: string): boolean => type === 'String' && !(isBooleanType(type) || isNumberType(type) || isDateType(type));
const isNullFilter = (operator: FilterOperator): boolean => operator === FilterOperator.IsNull || operator === FilterOperator.IsNotNull;
const isBooleanFilter = (type: string): boolean => isBooleanType(type);
const isNumberFilter = (type: string): boolean => isNumberType(type);
const isDateFilterWithoutValue = (type: string, operator: FilterOperator): boolean => isDateType(type) && (operator === FilterOperator.WithInGrafanaTimeRange || operator === FilterOperator.OutsideGrafanaTimeRange);
const isDateFilter = (type: string): boolean => isDateType(type);
const isStringFilter = (type: string, operator: FilterOperator): boolean => isStringType(type) && !(operator === FilterOperator.In || operator === FilterOperator.NotIn);
const isMultiFilter = (type: string, operator: FilterOperator): boolean => isStringType(type) && (operator === FilterOperator.In || operator === FilterOperator.NotIn);
const formatStringValue = (filter: string): string => filter.startsWith('$') ? (filter || '') : `'${filter || ''}'`;
