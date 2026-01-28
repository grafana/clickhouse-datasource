---
description: This document describes the ClickHouse query editor
labels:
products:
  - Grafana Cloud
keywords:
  - data source
menuTitle: ClickHouse query editor
title: ClickHouse query editor
weight: 30
version: 0.1
---

## Building queries

Queries can be built using the raw SQL editor or the query builder.
Queries can contain macros which simplify syntax and allow for
dynamic SQL generation.

### Time series

Time series visualization options are selectable after adding a `datetime`
field type to your query. This field will be used as the timestamp. You can
select time series visualizations using the visualization options. Grafana
interprets timestamp rows without explicit time zone as UTC. Any column except
`time` is treated as a value column.

#### Multi-line time series

To create multi-line time series, the query must return at least 3 fields in
the following order:

- field 1: `datetime` field with an alias of `time`
- field 2: value to group by
- field 3+: the metric values

For example:

```sql
SELECT log_time AS time, machine_group, avg(disk_free) AS avg_disk_free
FROM mgbench.logs1
GROUP BY machine_group, log_time
ORDER BY log_time
```

### Tables

Table visualizations will always be available for any valid ClickHouse query.

### Visualizing logs with the Logs Panel

To use the Logs panel your query must return a timestamp and string values. To default to the logs visualization in Explore mode, set the timestamp alias to _log_time_.

For example:

```sql
SELECT log_time AS log_time, machine_group, toString(avg(disk_free)) AS avg_disk_free
FROM logs1
GROUP BY machine_group, log_time
ORDER BY log_time
```

To force rendering as logs, in absence of a `log_time` column, set the Format to `Logs` (available from 2.2.0).

### Visualizing traces with the Traces Panel

Ensure your data meets the [requirements of the traces panel](https://grafana.com/docs/grafana/latest/explore/trace-integration/#data-api). This applies if using the visualization or Explore view.

Set the Format to `Trace` when constructing the query (available from 2.2.0).

If using the [Open Telemetry Collector and ClickHouse exporter](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/clickhouseexporter), the following query produces the required column names (these are case sensitive):

```sql
SELECT
  TraceId AS traceID,
  SpanId AS spanID,
  SpanName AS operationName,
  ParentSpanId AS parentSpanID,
  ServiceName AS serviceName,
  Duration / 1000000 AS duration,
  Timestamp AS startTime,
  arrayMap(key -> map('key', key, 'value', SpanAttributes[key]), mapKeys(SpanAttributes)) AS tags,
  arrayMap(key -> map('key', key, 'value', ResourceAttributes[key]), mapKeys(ResourceAttributes)) AS serviceTags,
  if(StatusCode IN ('Error', 'STATUS_CODE_ERROR'), 2, 0) AS statusCode
FROM otel.otel_traces
WHERE TraceId = '61d489320c01243966700e172ab37081'
ORDER BY startTime ASC
```

### Macros

To simplify syntax and to allow for dynamic parts, like date range filters, the query can contain macros.

Here is an example of a query with a macro that will use Grafana's time filter:

```sql
SELECT date_time, data_stuff
FROM test_data
WHERE $__timeFilter(date_time)
```

| Macro                                          | Description                                                                                                                                                                         | Output example                                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| _$\_\_dateFilter(columnName)_                  | Replaced by a conditional that filters the data (using the provided column) based on the date range of the panel                                                                    | `date >= toDate('2022-10-21') AND date <= toDate('2022-10-23')`                                       |
| _$\_\_timeFilter(columnName)_                  | Replaced by a conditional that filters the data (using the provided column) based on the time range of the panel in seconds                                                         | `time >= toDateTime(1415792726) AND time <= toDateTime(1447328726)`                                   |
| _$\_\_timeFilter_ms(columnName)_               | Replaced by a conditional that filters the data (using the provided column) based on the time range of the panel in milliseconds                                                    | `time >= fromUnixTimestamp64Milli(1415792726123) AND time <= fromUnixTimestamp64Milli(1447328726456)` |
| _$\_\_dateTimeFilter(dateColumn, timeColumn)_  | Shorthand that combines $**dateFilter() AND $**timeFilter() using separate Date and DateTime columns.                                                                               | `$__dateFilter(dateColumn) AND $__timeFilter(timeColumn)`                                             |
| _$\_\_fromTime_                                | Replaced by the starting time of the range of the panel casted to `DateTime`                                                                                                        | `toDateTime(1415792726)`                                                                              |
| _$\_\_toTime_                                  | Replaced by the ending time of the range of the panel casted to `DateTime`                                                                                                          | `toDateTime(1447328726)`                                                                              |
| _$\_\_fromTime_ms_                             | Replaced by the starting time of the range of the panel casted to `DateTime64(3)`                                                                                                   | `fromUnixTimestamp64Milli(1415792726123)`                                                             |
| _$\_\_toTime_ms_                               | Replaced by the ending time of the range of the panel casted to `DateTime64(3)`                                                                                                     | `fromUnixTimestamp64Milli(1447328726456)`                                                             |
| _$\_\_interval_s_                              | Replaced by the interval in seconds                                                                                                                                                 | `20`                                                                                                  |
| _$\_\_timeInterval(columnName)_                | Replaced by a function calculating the interval based on window size in seconds, useful when grouping                                                                               | `toStartOfInterval(toDateTime(column), INTERVAL 20 second)`                                           |
| _$\_\_timeInterval_ms(columnName)_             | Replaced by a function calculating the interval based on window size in milliseconds, useful when grouping                                                                          | `toStartOfInterval(toDateTime64(column, 3), INTERVAL 20 millisecond)`                                 |
| _$\_\_conditionalAll(condition, $templateVar)_ | Replaced by the first parameter when the template variable in the second parameter does not select every value. Replaced by the 1=1 when the template variable selects every value. | `condition` or `1=1`                                                                                  |

The plugin also supports notation using braces {}. Use this notation when queries are needed inside parameters.
