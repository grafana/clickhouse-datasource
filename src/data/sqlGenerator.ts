import { BooleanFilter, BuilderMode, ColumnHint, DateFilterWithValue, FilterOperator, MultiFilter, NumberFilter, QueryBuilderOptions, QueryType, SelectedColumn, StringFilter, TimeUnit } from 'types/queryBuilder';
import otel from 'otel';

/**
 * Generates a SQL string for the given QueryBuilderOptions
 */
export const generateSql = (options: QueryBuilderOptions): string => {
  const hasTraceIdFilter = options.meta?.isTraceIdMode && options.meta?.traceId
  if (options.queryType === QueryType.Traces && hasTraceIdFilter) {
    return generateTraceIdQuery(options);
  } else if (options.queryType === QueryType.Traces) {
    return generateTraceSearchQuery(options);
  } else if (options.queryType === QueryType.Logs) {
    return generateLogsQuery(options);
  } else if (options.queryType === QueryType.TimeSeries && options.mode !== BuilderMode.Trend) {
    return generateSimpleTimeSeriesQuery(options);
  } else if (options.queryType === QueryType.TimeSeries && options.mode === BuilderMode.Trend) {
    return generateAggregateTimeSeriesQuery(options);
  } else if (options.queryType === QueryType.Table) {
    return generateTableQuery(options);
  }

  return '';
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

  const filterParts = getFilters(options);
  if (filterParts) {
    queryParts.push('WHERE');
    queryParts.push(filterParts);
  }

  const orderBy = getOrderBy(options);
  if (orderBy) {
    queryParts.push('ORDER BY');
    queryParts.push(orderBy);
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

  // Optimize trace ID filtering for OTel enabled trace lookups
  const hasTraceIdFilter = options.meta?.isTraceIdMode && options.meta?.traceId;
  const otelVersion = otel.getVersion(options.meta?.otelVersion);
  const applyTraceIdOptimization = hasTraceIdFilter && options.meta?.otelEnabled && otelVersion;
  if (applyTraceIdOptimization) {
    const traceId = options.meta!.traceId;
    const timestampTable = getTableIdentifier(database, table + otel.traceTimestampTableSuffix);
    queryParts.push('WITH');
    queryParts.push(`'${traceId}' as trace_id,`);
    queryParts.push(`(SELECT min(Start) FROM ${timestampTable} WHERE TraceId = trace_id) as trace_start,`);
    queryParts.push(`(SELECT max(End) + 1 FROM ${timestampTable} WHERE TraceId = trace_id) as trace_end`);
  }

  queryParts.push('SELECT');
  queryParts.push(selectPartsSql);
  queryParts.push('FROM');
  queryParts.push(getTableIdentifier(database, table));

  const filterParts = getFilters(options);

  if (hasTraceIdFilter || filterParts) {
    queryParts.push('WHERE');
  }

  if (applyTraceIdOptimization) {
    queryParts.push('traceID = trace_id');
    queryParts.push('AND');
    queryParts.push(`startTime >= trace_start`);
    queryParts.push('AND');
    queryParts.push(`startTime <= trace_end`);
  } else if (hasTraceIdFilter) {
    const traceId = options.meta!.traceId;
    queryParts.push(`traceID = '${traceId}'`);
  }

  if (filterParts) {
    if (hasTraceIdFilter) {
      queryParts.push('AND');
    }

    queryParts.push(filterParts);
  }

  const orderBy = getOrderBy(options);
  if (orderBy) {
    queryParts.push('ORDER BY');
    queryParts.push(orderBy);
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
const generateLogsQuery = (_options: QueryBuilderOptions): string => {
  // Copy columns so column aliases can be safely mutated
  const options = { ..._options, columns: _options.columns?.map(c => ({ ...c })) };
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

  const traceId = getColumnByHint(options, ColumnHint.TraceId);
  if (traceId !== undefined) {
    traceId.alias = 'traceID';
    selectParts.push(getColumnIdentifier(traceId));
  }

  options.columns?.
    filter(c => c.hint === undefined). // remove specialized columns
    forEach(c => selectParts.push(getColumnIdentifier(c)));

  const selectPartsSql = selectParts.join(', ');

  queryParts.push('SELECT');
  queryParts.push(selectPartsSql);
  queryParts.push('FROM');
  queryParts.push(getTableIdentifier(database, table));

  
  const filterParts = getFilters(options);
  const hasLogMessageFilter = logMessage && options.meta?.logMessageLike;

  if (filterParts || hasLogMessageFilter) {
    queryParts.push('WHERE');
  }

  if (filterParts) {
    queryParts.push(filterParts);
  }

  if (hasLogMessageFilter) {
    if (filterParts) {
      queryParts.push('AND');
    }

    queryParts.push(`(${logMessage.alias || logMessage.name} LIKE '%${options.meta!.logMessageLike}%')`);
  }

  const orderBy = getOrderBy(options);
  if (orderBy) {
    queryParts.push('ORDER BY');
    queryParts.push(orderBy);
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
const generateSimpleTimeSeriesQuery = (_options: QueryBuilderOptions): string => {
  // Copy columns so column aliases can be safely mutated
  const options = { ..._options, columns: _options.columns?.map(c => ({ ...c })) };
  const { database, table } = options;
  
  const queryParts: string[] = [];

  const selectParts: string[] = [];
  const selectNames = new Set<string>();
  const timeColumn = getColumnByHint(options, ColumnHint.Time);
  if (timeColumn !== undefined) {
    timeColumn.alias = 'time';
    selectParts.push(getColumnIdentifier(timeColumn));
    selectNames.add(timeColumn.alias);
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

  // (v3) aggregate selections go AFTER group by
  aggregateSelectParts.forEach(a => selectParts.push(a));
  
  const selectPartsSql = selectParts.join(', ');

  queryParts.push('SELECT');
  queryParts.push(selectPartsSql);
  queryParts.push('FROM');
  queryParts.push(getTableIdentifier(database, table));

  const filterParts = getFilters(options);
  if (filterParts) {
    queryParts.push('WHERE');
    queryParts.push(filterParts);
  }
  
  const hasAggregates = (options.aggregates?.length || 0 > 0);
  const hasGroupBy = (options.groupBy?.length || 0 > 0);
  if (hasAggregates || hasGroupBy) {
    queryParts.push('GROUP BY');
  }

  if ((options.groupBy?.length || 0) > 0) {
    const groupByTime = timeColumn !== undefined ? `, ${timeColumn.alias}` : '';
    queryParts.push(`${options.groupBy!.join(', ')}${groupByTime}`);
  } else if (hasAggregates && timeColumn) {
    queryParts.push(timeColumn.alias!);
  }

  const orderBy = getOrderBy(options);
  if (orderBy) {
    queryParts.push('ORDER BY');
    queryParts.push(orderBy);
  }

  const limit = getLimit(options.limit);
  if (limit !== '') {
    queryParts.push(limit);
  }

  return concatQueryParts(queryParts);
}

/**
 * Generates an aggregate time series query.
 */
const generateAggregateTimeSeriesQuery = (_options: QueryBuilderOptions): string => {
  // Copy columns so column aliases can be safely mutated
  const options = { ..._options, columns: _options.columns?.map(c => ({ ...c })) };
  const { database, table } = options;
  
  const queryParts: string[] = [];
  const selectParts: string[] = [];

  const timeColumn = getColumnByHint(options, ColumnHint.Time);
  if (timeColumn !== undefined) {
    timeColumn.name = `$__timeInterval(${timeColumn.name})`;
    timeColumn.alias = 'time';
    selectParts.push(getColumnIdentifier(timeColumn));
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

  const filterParts = getFilters(options);
  if (filterParts) {
    queryParts.push('WHERE');
    queryParts.push(filterParts);
  }

  queryParts.push('GROUP BY');
  if ((options.groupBy?.length || 0) > 0) {
    const groupByTime = timeColumn !== undefined ? `, ${timeColumn.alias}` : '';
    queryParts.push(`${options.groupBy!.join(', ')}${groupByTime}`);
  } else if (timeColumn) {
    queryParts.push(timeColumn.alias!);
  }

  const orderBy = getOrderBy(options);
  if (orderBy) {
    queryParts.push('ORDER BY');
    queryParts.push(orderBy);
  }

  const limit = getLimit(options.limit);
  if (limit !== '') {
    queryParts.push(limit);
  }

  return concatQueryParts(queryParts);
}

/**
 * Generates a table query.
 */
const generateTableQuery = (options: QueryBuilderOptions): string => {
  const { database, table } = options;
  const isAggregateMode = options.mode === BuilderMode.Aggregate;

  const queryParts: string[] = [];
  const selectParts: string[] = [];
  const selectNames = new Set<string>();

  options.columns?.forEach(c => {
    selectParts.push(getColumnIdentifier(c));
    selectNames.add(c.alias || c.name);
  });

  if (isAggregateMode) {
    options.aggregates?.forEach(agg => {
      const alias = agg.alias ? ` as ${agg.alias.replace(/ /g, '_')}` : '';
      const name = `${agg.aggregateType}(${agg.column})`;
      selectParts.push(`${name}${alias}`);
      selectNames.add(alias ? alias.substring(4) : name);
    });

    options.groupBy?.forEach(g => {
      if (selectNames.has(g)) {
        // don't add if already selected
        return;
      }

      // user must manually select groupBys, for flexibility
      // selectParts.push(g)
    });
  }
  
  const selectPartsSql = selectParts.join(', ');

  queryParts.push('SELECT');
  queryParts.push(selectPartsSql);
  queryParts.push('FROM');
  queryParts.push(getTableIdentifier(database, table));

  const filterParts = getFilters(options);
  if (filterParts) {
    queryParts.push('WHERE');
    queryParts.push(filterParts);
  }

  if (isAggregateMode && (options.groupBy?.length || 0) > 0) {
    queryParts.push('GROUP BY');
    queryParts.push(options.groupBy!.join(', '));
  }

  const orderBy = getOrderBy(options);
  if (orderBy) {
    queryParts.push('ORDER BY');
    queryParts.push(orderBy);
  }

  const limit = getLimit(options.limit);
  if (limit !== '') {
    queryParts.push(limit);
  }

  return concatQueryParts(queryParts);
}

export const isAggregateQuery = (builder: QueryBuilderOptions): boolean => (builder.aggregates?.length || 0) > 0;
export const getColumnByHint = (options: QueryBuilderOptions, hint: ColumnHint): SelectedColumn | undefined => options.columns?.find(c => c.hint === hint);
export const getColumnIndexByHint = (options: QueryBuilderOptions, hint: ColumnHint): number => (options.columns || []).findIndex(c => c.hint === hint);
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
  
  // allow for functions like count()
  if (colName.includes('(') || colName.includes(')') || colName.includes('"') || colName.includes('"') || colName.includes(' as ')) {
    colName = col.name
  } else if (colName.includes(' ')) {
    colName = escapeIdentifier(col.name);
  }

  if (col.alias && (col.alias !== col.name && escapeIdentifier(col.alias) !== colName)) {
    return `${colName} as "${col.alias}"`
  }

  return colName;
}

const getTableIdentifier = (database: string, table: string): string => {
  const sep = (!database || !table) ? '' : '.';
  return `${escapeIdentifier(database)}${sep}${escapeIdentifier(table)}`;
}

const escapeIdentifier = (id: string): string => {
  return id ? `"${id}"` : '';
}

const escapeValue = (value: string): string => {
  if (value.includes('$') || value.includes('(') || value.includes(')') || value.includes('\'') || value.includes('"')) {
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
      return `multiply(${columnIdentifier}, 0.001) as ${alias}`;
    case TimeUnit.Nanoseconds:
      return `multiply(${columnIdentifier}, 0.000001) as ${alias}`;
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

/**
 * Returns the order by list, excluding the "ORDER BY" keyword.
 */
const getOrderBy = (options: QueryBuilderOptions): string => {
  const orderByParts: string[] = [];
  if ((options.orderBy?.length || 0) > 0) {
    options.orderBy?.forEach(o => {
      let colName = o.name;
      const hintedColumn = o.hint && getColumnByHint(options, o.hint);
      if (hintedColumn) {
        colName = hintedColumn.alias || hintedColumn.name;
      }

      if (!colName) {
        return;
      }

      orderByParts.push(`${colName} ${o.dir}`);
    });
  }

  return orderByParts.join(', ');
};

/**
 * Returns the limit clause including the "LIMIT" keyword
 */
const getLimit = (limit?: number | undefined): string => {
  limit = Math.max(0, limit || 0);
  if (limit > 0) {
    return 'LIMIT ' + limit;
  }

  return '';
};

/**
 * Returns the filters in the WHERE clause, excluding the "WHERE" keyword
 */
const getFilters = (options: QueryBuilderOptions): string => {
  const filters = options.filters || [];
  const builtFilters: string[] = [];

  for (const filter of filters) {
    if (filter.operator === FilterOperator.IsAnything) {
      continue;
    }

    const filterParts: string[] = [];

    let column = filter.key;
    let type = filter.type;
    const hintedColumn = filter.hint && getColumnByHint(options, filter.hint);
    if (hintedColumn) {
      column = hintedColumn.alias || hintedColumn.name;
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
    if (filter.operator === FilterOperator.IsEmpty || filter.operator === FilterOperator.IsNotEmpty) {
      operator = '';
    } else if (filter.operator === FilterOperator.NotLike) {
      operator = 'LIKE';
      negate = true;
    } else if (filter.operator === FilterOperator.OutsideGrafanaTimeRange) {
      operator = '';
      negate = true;
    } else if (filter.operator === FilterOperator.WithInGrafanaTimeRange) {
        operator = '';
    }

    if (operator) {
      filterParts.push(operator);
    }
    
    if (isNullFilter(filter.operator)) {
      // empty
    } else if (filter.operator === FilterOperator.IsEmpty) {
      filterParts.push(`= ''`);
    } else if (filter.operator === FilterOperator.IsNotEmpty) {
      filterParts.push(`!= ''`);
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
        filterParts.push(escapeValue((filter as StringFilter).value || ''));
      }
    } else if (isMultiFilter(type, filter.operator)) {
      filterParts.push(`(${(filter as MultiFilter).value?.map(v => escapeValue(v.trim())).join(', ')})`);
    } else {
      filterParts.push(escapeValue((filter as StringFilter).value || ''));
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

const stripTypeModifiers = (type: string): string => {
    return type.toLowerCase().
      replace(/\(/g, '').
      replace(/\)/g, '').
      replace(/nullable/g, '').
      replace(/lowcardinality/g, '');

}
const isBooleanType = (type: string): boolean => (type?.toLowerCase().startsWith('boolean'));
const numberTypes = ['int', 'float', 'decimal'];
const isNumberType = (type: string): boolean => numberTypes.some(t => type?.toLowerCase().includes(t));
const isDateType = (type: string): boolean => type?.toLowerCase().startsWith('date') || type?.toLowerCase().startsWith('nullable(date');
// const isDateTimeType = (type: string): boolean => type?.toLowerCase().startsWith('datetime') || type?.toLowerCase().startsWith('nullable(datetime');
const isStringType = (type: string): boolean => {
  type = stripTypeModifiers(type.toLowerCase());
  return (type === 'string' || type.startsWith('fixedstring'))
  && !(isBooleanType(type) || isNumberType(type) || isDateType(type));
}
const isNullFilter = (operator: FilterOperator): boolean => operator === FilterOperator.IsNull || operator === FilterOperator.IsNotNull;
const isBooleanFilter = (type: string): boolean => isBooleanType(type);
const isNumberFilter = (type: string): boolean => isNumberType(type);
const isDateFilterWithoutValue = (type: string, operator: FilterOperator): boolean => isDateType(type) && (operator === FilterOperator.WithInGrafanaTimeRange || operator === FilterOperator.OutsideGrafanaTimeRange);
const isDateFilter = (type: string): boolean => isDateType(type);
const isStringFilter = (type: string, operator: FilterOperator): boolean => isStringType(type) && !(operator === FilterOperator.In || operator === FilterOperator.NotIn);
const isMultiFilter = (type: string, operator: FilterOperator): boolean => isStringType(type) && (operator === FilterOperator.In || operator === FilterOperator.NotIn);

/**
 * When filtering in the logs panel in explore view, we need a way to
 * map from the SQL generator's aliases back to the original column hints
 * so that filters can be added properly.
 */
export const logAliasToColumnHints: Map<string, ColumnHint> = new Map([
  ['timestamp', ColumnHint.Time],
  ['body', ColumnHint.LogMessage],
  ['level', ColumnHint.LogLevel],
  ['traceID', ColumnHint.TraceId],
]);


export const _testExports = {
  getColumnIdentifier,
  getTableIdentifier,
  escapeIdentifier,
  escapeValue,
  concatQueryParts,
  getOrderBy,
  getLimit,
  getFilters,
  isStringType,
};
