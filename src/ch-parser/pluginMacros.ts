export interface PluginMacro {
  name: string;
  isFunction: boolean;
  columnType?: string;
  documentation: string;
  example?: string;
}

// Taken from README/docs
export const pluginMacros: PluginMacro[] = [
  {
    name: '$__dateFilter',
    isFunction: true,
    documentation: 'Filters the data based on the date range of the panel',
    example: "date >= toDate('2022-10-21') AND date <= toDate('2022-10-23')",
  },
  {
    name: '$__timeFilter',
    isFunction: true,
    documentation: 'Filters the data based on the time range of the panel in seconds',
    example: 'time >= toDateTime(1415792726) AND time <= toDateTime(1447328726)',
  },
  {
    name: '$__timeFilter_ms',
    isFunction: true,
    documentation: 'Filters the data based on the time range of the panel in milliseconds',
    example: 'time >= fromUnixTimestamp64Milli(1415792726123) AND time <= fromUnixTimestamp64Milli(1447328726456)',
  },
  {
    name: '$__dateTimeFilter',
    isFunction: true,
    documentation:
      'Shorthand that combines $__dateFilter() AND $__timeFilter() using separate Date and DateTime columns',
    example: '$__dateFilter(dateColumn) AND $__timeFilter(timeColumn)',
  },
  {
    name: '$__fromTime',
    isFunction: false,
    columnType: 'DateTime',
    documentation: 'Replaced by the starting time of the range of the panel casted to DateTime',
    example: 'toDateTime(1415792726)',
  },
  {
    name: '$__toTime',
    isFunction: false,
    columnType: 'DateTime',
    documentation: 'Replaced by the ending time of the range of the panel casted to DateTime',
    example: 'toDateTime(1447328726)',
  },
  {
    name: '$__fromTime_ms',
    isFunction: false,
    columnType: 'DateTime64(3)',
    documentation: 'Replaced by the starting time of the range of the panel casted to DateTime64(3)',
    example: 'fromUnixTimestamp64Milli(1415792726123)',
  },
  {
    name: '$__toTime_ms',
    isFunction: false,
    columnType: 'Datetime64(3)',
    documentation: 'Replaced by the ending time of the range of the panel casted to DateTime64(3)',
    example: 'fromUnixTimestamp64Milli(1447328726456)',
  },
  {
    name: '$__interval_s',
    isFunction: false,
    columnType: 'INTERVAL',
    documentation: 'Replaced by the interval in seconds',
    example: '20',
  },
  {
    name: '$__fromGrafanaInterval',
    isFunction: true,
    columnType: 'INTERVAL',
    documentation: 'Converts a Grafana dashboard interval variable to ClickHouse interval syntax',
    example: '$__fromGrafanaInterval(5m) → 5 minute',
  },
  {
    name: '$__timeInterval',
    isFunction: true,
    columnType: 'DateTime',
    documentation:
      'Replaced by a function calculating the interval based on window size in seconds, useful when grouping',
    example: 'toStartOfInterval(toDateTime(column), INTERVAL 20 second)',
  },
  {
    name: '$__timeInterval_ms',
    isFunction: true,
    columnType: 'DateTime64(3)',
    documentation:
      'Replaced by a function calculating the interval based on window size in milliseconds, useful when grouping',
    example: 'toStartOfInterval(toDateTime64(column, 3), INTERVAL 20 millisecond)',
  },
  {
    name: '$__conditionalAll',
    isFunction: true,
    columnType: 'Condition',
    documentation:
      'Replaced by the first parameter when the template variable in the second parameter does not select every value. Replaced by 1=1 when the template variable selects every value',
    example: 'condition or 1=1',
  },
  {
    name: '$__columns',
    isFunction: true,
    documentation:
      'Statement macro producing one series per key value. Replaces the query from the macro to the end: buckets the time column with $__timeInterval, applies the panel time filter, and groups by bucket and key. Write it in place of SELECT, followed by the FROM clause',
    example: "$__columns(EventTime, ServiceName, count() AS c) FROM requests WHERE ServiceName != ''",
  },
  {
    name: '$__rateColumns',
    isFunction: true,
    documentation:
      'Statement macro like $__columns, but divides the aggregated value by the seconds since the previous bucket of the same series, for per-second smoothing of gauges',
    example: '$__rateColumns(EventTime, ServiceName, sum(Requests)) FROM requests',
  },
  {
    name: '$__perSecondColumns',
    isFunction: true,
    documentation:
      'Statement macro for monotonic counters: per-second rate of max(value) per series, like the Prometheus rate() function. Counter resets and first points are emitted as nan',
    example: '$__perSecondColumns(EventTime, ServiceName, RequestsTotal) FROM requests',
  },
  {
    name: '$__increaseColumns',
    isFunction: true,
    documentation:
      'Statement macro for monotonic counters: raw delta of max(value) per bucket and series, like the Prometheus increase() function. Counter resets and first points are emitted as nan',
    example: '$__increaseColumns(EventTime, ServiceName, RequestsTotal) FROM requests',
  },
  {
    name: '$__lttb',
    isFunction: true,
    documentation:
      "Statement macro that downsamples dense series with ClickHouse's lttb() aggregate (Largest-Triangle-Three-Buckets). Takes a bucket count or 'auto' to derive one from the panel time range and interval",
    example: '$__lttb(auto, EventTime, Latency) FROM requests',
  },
  {
    name: '$__adHocFilters',
    isFunction: true,
    documentation:
      'Manually applies ad-hoc filters to specific table(s). Useful for complex queries where automatic filter detection fails. Supports multiple tables by passing comma-separated table names. Use in SETTINGS clause to specify the target table(s) for ad-hoc filters',
    example:
      "additional_table_filters={'table1': 'column = \\'value\\'', 'table2': 'column = \\'value\\''} (for multiple tables)",
  },
];
