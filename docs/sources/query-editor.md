---
description: This document describes the ClickHouse query editor
labels:
products:
  - Grafana Cloud
  - Grafana OSS
  - Grafana Enterprise
keywords:
  - data source
menuTitle: Query editor
title: ClickHouse query editor
weight: 30
version: 0.1
last_reviewed: 2026-02-11
---

# ClickHouse query editor

This document explains how to use the ClickHouse query editor to build and run queries. You can access the query editor from [Explore](https://grafana.com/docs/grafana/latest/visualizations/explore/) to run ad hoc queries, or when you add or edit a panel and select the ClickHouse data source.

## Before you begin

- [Configure the ClickHouse data source](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/configure/).
- Ensure your ClickHouse user has read access to the databases and tables you want to query.

## Query editor elements

The query editor appears in [Explore](https://grafana.com/docs/grafana/latest/visualizations/explore/) when you select the ClickHouse data source, or when you add or edit a panel and select ClickHouse. It includes the following elements.

| Element         | Description                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Editor type** | Switch between **SQL** (write raw SQL) and **Query builder** (build queries with drop-downs and filters).                                                                                  |
| **Run Query**   | Runs the current query and refreshes the panel. In the SQL editor you can also use **Ctrl+Enter** (Windows/Linux) or **Cmd+Enter** (macOS).                                                |
| **Query type**  | Choose the result format: **Table**, **Logs**, **Time series**, or **Traces**. This sets how Grafana interprets and visualizes the results. Available in both SQL and Query builder modes. |

**In SQL mode:**

- **SQL editor** — A code editor where you write ClickHouse SQL. It provides schema suggestions (databases, tables, columns) as you type. If SQL validation is enabled in the data source settings, the editor marks invalid syntax.
- **Format code** — Use the editor toolbar to format your SQL.
- **Query type** — Select **Table**, **Logs**, **Time series**, or **Traces** so the panel uses the correct visualization.

**In Query builder mode:**

- **Database** and **Table** — Select the database and table to query from the drop-downs.
- **Query type** — Select **Table**, **Logs**, **Time series**, or **Traces**. The builder shows options that match the type (for example, time column and value columns for time series; columns, filters, group by, and order by for tables).
- **Type-specific options** — Configure columns, filters, grouping, sorting, limit (max rows), and (for traces) trace ID. The builder generates the SQL for you.
- **SQL preview** — At the bottom of the builder, you can see the generated SQL. You can switch to SQL mode to edit it manually.

## Build queries

You can build queries using the **SQL editor** (raw SQL) or the **Query builder**. Queries can include macros for dynamic parts such as time range filters.

## Time series

For time series visualizations, your query must include a `datetime` column. Use an alias of `time` for the timestamp column. Grafana treats timestamp rows without an explicit time zone as UTC. Any column other than `time` is treated as a value column.

## Multi-line time series

To create multi-line time series, the query must return at least 3 columns in this order:

1. A `datetime` column with an alias of `time`
1. A column to group by (for example, category or label)
1. One or more metric columns

Example (replace `mgbench.logs1` with your database and table):

```sql
SELECT log_time AS time, machine_group, avg(disk_free) AS avg_disk_free
FROM mgbench.logs1
GROUP BY machine_group, log_time
ORDER BY log_time
```

## Tables

Table visualizations are available for any valid ClickHouse query. Select **Table** in the panel visualization options to view results in tabular form.

## Visualize logs with the Logs panel

To use the Logs panel, your query must return a timestamp and string values. To default to the logs visualization in Explore, set the timestamp column alias to `log_time`.

Example (replace `logs1` with your database and table, for example `mydb.logs`):

```sql
SELECT log_time AS log_time, machine_group, toString(avg(disk_free)) AS avg_disk_free
FROM logs1
GROUP BY machine_group, log_time
ORDER BY log_time
```

When you don't have a `log_time` column, set **Format** to **Logs** to force logs rendering (available from plugin version 2.2.0).

## Visualize traces with the Traces panel

To use the Traces panel, your data must meet the [requirements of the traces panel](https://grafana.com/docs/grafana/latest/explore/trace-integration/#data-api). Set **Format** to **Trace** when building the query (available from plugin version 2.2.0).

If you use the [OpenTelemetry Collector and ClickHouse exporter](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/clickhouseexporter), the following query returns the required column names (case sensitive). Replace the trace ID in the WHERE clause with your trace ID or a template variable (for example `$traceId`):

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

## Macros

Macros simplify query syntax and add dynamic parts such as dashboard time range filters. The plugin replaces macros with the corresponding SQL before the query is sent to ClickHouse.

Example query using a time filter macro (replace `test_data` and `date_time` with your table and timestamp column):

```sql
SELECT date_time, data_stuff
FROM test_data
WHERE $__timeFilter(date_time)
```

| Macro                                        | Description                                                                                      | Output example                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `$__dateFilter(columnName)`                  | Filters by the panel date range using the given column.                                          | `date >= toDate('2022-10-21') AND date <= toDate('2022-10-23')`                                       |
| `$__timeFilter(columnName)`                  | Filters by the panel time range (seconds).                                                       | `time >= toDateTime(1415792726) AND time <= toDateTime(1447328726)`                                   |
| `$__timeFilter_ms(columnName)`               | Filters by the panel time range (milliseconds).                                                  | `time >= fromUnixTimestamp64Milli(1415792726123) AND time <= fromUnixTimestamp64Milli(1447328726456)` |
| `$__dateTimeFilter(dateColumn, timeColumn)`  | Combines date and time filters for separate Date and DateTime columns.                           | `$__dateFilter(dateColumn) AND $__timeFilter(timeColumn)`                                             |
| `$__fromTime_`                               | Start of the panel time range as `DateTime`.                                                     | `toDateTime(1415792726)`                                                                              |
| `$__toTime_`                                 | End of the panel time range as `DateTime`.                                                       | `toDateTime(1447328726)`                                                                              |
| `$__fromTime_ms_`                            | Start of the panel time range as `DateTime64(3)`.                                                | `fromUnixTimestamp64Milli(1415792726123)`                                                             |
| `$__toTime_ms_`                              | End of the panel time range as `DateTime64(3)`.                                                  | `fromUnixTimestamp64Milli(1447328726456)`                                                             |
| `$__interval_s_`                             | Panel interval in seconds.                                                                       | `20`                                                                                                  |
| `$__timeInterval(columnName)`                | Interval from panel time range (seconds), for grouping.                                          | `toStartOfInterval(toDateTime(column), INTERVAL 20 second)`                                           |
| `$__timeInterval_ms(columnName)`             | Interval from panel time range (milliseconds), for grouping.                                     | `toStartOfInterval(toDateTime64(column, 3), INTERVAL 20 millisecond)`                                 |
| `$__conditionalAll(condition, $templateVar)` | Uses the first parameter when the template variable does not select all values; otherwise `1=1`. | `condition` or `1=1`                                                                                  |

You can also use brace notation `{}` when the macro parameter must contain a query or other expression.

## Next steps

- [ClickHouse template variables](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/template-variables/) — Use variables in dashboards and queries.
- [Configure the ClickHouse data source](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/configure/) — Connection and authentication options.
