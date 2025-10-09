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
];
