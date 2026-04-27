---
description: Use ClickHouse queries to create annotations on dashboards
labels:
products:
  - Grafana Cloud
  - Grafana OSS
  - Grafana Enterprise
keywords:
  - data source
  - annotations
menuTitle: Annotations
title: ClickHouse annotations
weight: 50
version: 0.1
last_reviewed: 2026-04-27
---

# ClickHouse annotations

Annotations overlay event markers on your dashboard panels. You can use ClickHouse SQL queries to create annotations that mark deployments, alerts, errors, or other events from your data.

The plugin uses Grafana’s default annotation support: you write a ClickHouse SQL query that returns a time column and a text column. Grafana positions each row as an annotation on the time axis and shows the text when you hover or click.

Annotation queries use Grafana’s built-in annotation query editor (a SQL text field with column mappings), not the full ClickHouse query builder available in panels.

For an overview of annotations in Grafana, see [Annotate visualizations](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/annotate-visualizations/).

## Before you begin

- [Configure the ClickHouse data source](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/configure/).
- Ensure your ClickHouse user has read access to the tables you use in your annotation query.

## Create an annotation query

To add a ClickHouse annotation to a dashboard:

1. Open the dashboard where you want to add annotations.
2. Click **Dashboard settings** (gear icon) in the top navigation.
3. Select **Annotations** in the left menu.
4. Click **Add annotation query**.
5. Enter a **Name** for the annotation (for example, "Deployments", "Errors").
6. In the **Data source** drop-down, select your ClickHouse data source.
7. In the **Query** field, enter a ClickHouse SQL query that returns the required columns (see [Query requirements](#query-requirements)).
8. Use the **Column mappings** section to map your query columns to **Time**, **Text**, and optionally **Tags** (if your column names differ from Grafana’s defaults).
9. Click **Apply** to save.

## Query requirements

Your SQL query must return at least a time column and a text column. Grafana uses these to place and label each annotation.

| Column | Required | Description |
|--------|----------|-------------|
| **Time** | Yes | The timestamp for the annotation. Grafana uses this to position the marker on the time axis. Use a DateTime or DateTime64 column, or an expression that Grafana can interpret as time. |
| **TimeEnd** | Optional | A second timestamp column. When present, Grafana draws a **region annotation** (a shaded range) from Time to TimeEnd instead of a single vertical line. |
| **Text** | Yes | The annotation text shown when you hover over or click the marker. |
| **Tags** | Optional | Additional columns become annotation tags. Use them to filter or group annotations. |

Always restrict the query to the dashboard time range so annotations load quickly. Use the **$__timeFilter(column)** macro in your WHERE clause. If your time column is `DateTime64` and you need sub-second precision, use **$__timeFilter_ms(column)** instead. See the [ClickHouse query editor](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/query-editor/) Macros section for the full list of available macros.

## Annotation query examples

The following examples show common patterns. Replace the table and column names with your own.

**Application events (e.g. deployments or status changes):**

```sql
SELECT
  event_time AS time,
  message AS text,
  environment AS tag
FROM my_app.events
WHERE $__timeFilter(event_time)
  AND event_type IN ('deployment', 'status_change')
ORDER BY event_time DESC
LIMIT 100
```

**Query log events (e.g. long-running or failed queries from ClickHouse system tables):**

```sql
SELECT
  event_time AS time,
  concat(type, ': ', substring(query, 1, 80)) AS text,
  initial_user AS tag
FROM system.query_log
WHERE $__timeFilter(event_time)
  AND type IN ('QueryFinish', 'ExceptionWhileProcessing')
ORDER BY event_time DESC
LIMIT 100
```

**Errors or alerts from a custom table:**

```sql
SELECT
  timestamp AS time,
  concat(severity, ' - ', message) AS text,
  service AS tag
FROM my_app.alerts
WHERE $__timeFilter(timestamp)
ORDER BY timestamp DESC
LIMIT 100
```

**Multiple tags (filter annotations by environment, service, or region):**

```sql
SELECT
  timestamp AS time,
  message AS text,
  environment AS tag1,
  service AS tag2,
  region AS tag3
FROM my_app.incidents
WHERE $__timeFilter(timestamp)
ORDER BY timestamp DESC
LIMIT 100
```

Map each tag column in the **Column mappings** section. In the dashboard, users can filter visible annotations by any combination of these tags.

**Region annotation (maintenance windows or time ranges):**

```sql
SELECT
  start_time AS time,
  end_time AS timeEnd,
  concat(window_type, ': ', description) AS text,
  team AS tag
FROM my_app.maintenance_windows
WHERE $__timeFilter(start_time)
ORDER BY start_time DESC
LIMIT 100
```

Map the `timeEnd` column in the **Column mappings** section. Grafana draws a shaded region between `time` and `timeEnd` instead of a single vertical line.

## Ad hoc filter interaction

If the dashboard has [ad hoc filters](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/template-variables/#ad-hoc-filters) enabled for the ClickHouse data source, those filters are also applied to annotation queries. This means annotation results change as users adjust ad hoc filter values.

If this is not the desired behavior and you want the annotation to always show all events regardless of ad hoc filters, place the `$__adHocFilters` macro in a `SETTINGS` clause that targets a different table, or use a separate ClickHouse data source instance without ad hoc filters configured for your annotation queries.

## Best practices

1. **Use a time filter** — Include `$__timeFilter(your_time_column)` in the WHERE clause so the query only returns data in the dashboard time range.
2. **Limit results** — Use `LIMIT` (for example, 100) so the query stays fast and the dashboard does not show too many markers.
3. **Meaningful text** — Use `concat()` or similar so the text column is clear (e.g. event type plus a short description).
4. **Use tags** — Return one or more tag columns (e.g. environment, service, user) so users can filter annotations in the dashboard.
5. **Descriptive names** — Give the annotation a clear name (e.g. "Production deployments", "Query errors") so dashboard users know what it represents.

## Next steps

- [ClickHouse query editor](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/query-editor/) — Macros such as `$__timeFilter` and building queries.
- [Annotate visualizations](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/annotate-visualizations/) — Grafana annotation options (colors, which panels show annotations, filters).
- [Troubleshoot ClickHouse data source issues](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/troubleshooting/) — Common errors and solutions.
