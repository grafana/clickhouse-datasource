---
description: Create alert rules from ClickHouse queries
labels:
products:
  - Grafana Cloud
  - Grafana OSS
  - Grafana Enterprise
keywords:
  - data source
  - alerting
menuTitle: ClickHouse alerting
title: ClickHouse alerting
weight: 55
version: 0.1
last_reviewed: 2026-02-11
---

# ClickHouse alerting

The ClickHouse data source supports [Grafana Alerting](https://grafana.com/docs/grafana/latest/alerting/) and [Grafana-managed recording rules](https://grafana.com/docs/grafana/latest/alerting/configure-alert-rules/create-recording-rules/). You can create alert rules that run ClickHouse SQL queries and fire when the result meets a condition (for example, a value is above a threshold or no data is returned).

Alert rules run as background processes. Grafana executes your ClickHouse query on a schedule, then evaluates the result using expressions such as **Reduce** and **Threshold**. Your query must return numeric data that Grafana can evaluate.

For an overview of alerting in Grafana, see [Alert rules](https://grafana.com/docs/grafana/latest/alerting/configure-alert-rules/) and [Create a Grafana-managed alert rule](https://grafana.com/docs/grafana/latest/alerting/configure-alert-rules/create-grafana-managed-rule/).

## Before you begin

- [Configure the ClickHouse data source](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/configure/).
- Ensure your ClickHouse user has read access to the tables used in your alert query.
- Familiarize yourself with [Grafana Alerting concepts](https://grafana.com/docs/grafana/latest/alerting/).

## Query requirements for alerting

Alert rules need numeric values to evaluate. Your ClickHouse query should return data that Grafana can use in a **Reduce** expression and then compare in a **Threshold** expression.

| Query result | Use case |
|--------------|----------|
| **Time series** (time column + numeric column) | Threshold alerts on a metric (e.g. average CPU, error count per interval). Use **Reduce** (Last, Max, Mean, etc.) to get a single value from the series. |
| **Single row, numeric value** | Threshold alerts on an aggregate (e.g. `SELECT count() FROM errors WHERE ...`). Use **Reduce** > **Last** to use the value. |

Queries that return only text or non-numeric data cannot be used directly for threshold evaluation. Use `count()`, `avg()`, `sum()`, or similar in your SQL so the result is numeric.

Use the **$__timeFilter(column)** macro in your WHERE clause so the query respects the alert rule’s evaluation interval and time range. See the [ClickHouse query editor](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/query-editor/) Macros section.

## Create an alert rule

To create an alert rule using ClickHouse data:

1. Go to **Alerting** > **Alert rules**.
2. Click **New alert rule**.
3. Enter a **Name** for the rule.
4. In **Define query and alert condition**:
   - Select your **ClickHouse** data source.
   - In the **Query** tab, write a ClickHouse SQL query that returns a time column and a numeric column (or a single numeric value). Use **Format** > **Time series** if your query returns time + value; use **Table** if it returns a single row.
   - Add a **Reduce** expression to aggregate the query result (e.g. **Last** to use the latest value, **Max** for the highest, **Mean** for the average).
   - Add a **Threshold** expression to define when the alert fires (e.g. **Is above** 80, **Is below** 3).
5. Configure **Set evaluation behavior**: choose a folder and evaluation group, set the evaluation interval, and set the pending period.
6. Add **Labels** and **Annotations** for notifications.
7. Click **Save rule**.

For detailed steps, see [Create a Grafana-managed alert rule](https://grafana.com/docs/grafana/latest/alerting/configure-alert-rules/create-grafana-managed-rule/).

## Example: Metric threshold alert

This example fires when the average value of a metric exceeds 80. Replace the table and column names with your own.

**Query (Time series format):**

```sql
SELECT
  $__timeInterval(timestamp) AS time,
  avg(value) AS value
FROM my_app.metrics
WHERE $__timeFilter(timestamp)
  AND metric_name = 'cpu_usage'
GROUP BY time
ORDER BY time
```

In the alert rule, add **Reduce** > **Last** (or **Max**) and **Threshold** > **Is above** 80.

## Example: Error count alert

This example fires when the number of error rows in the last 5 minutes exceeds 10.

**Query (Table format; single row):**

```sql
SELECT count() AS value
FROM my_app.events
WHERE $__timeFilter(timestamp)
  AND level = 'error'
```

In the alert rule, set the query **Format** to **Table**, add **Reduce** > **Last**, and **Threshold** > **Is above** 10.

## Example: No data alert

You can alert when a query returns no rows (for example, a health check that should always return at least one row). Write a query that returns a row when things are healthy, then in the alert rule configure **Configure no data and error handling** to **Alerting** when there is no data.

## Best practices

1. **Use an appropriate evaluation interval** — Set the alert evaluation interval to match how often your data is written. Avoid intervals shorter than your data resolution to prevent flapping or missed data.
2. **Reduce multiple series** — If your query returns multiple time series (e.g. one per host), use **Reduce** to aggregate: **Last**, **Max**, **Mean**, or **Sum** so Grafana can evaluate a single value.
3. **Restrict the time range** — Use **$__timeFilter(column)** in your WHERE clause so the query only reads data in the evaluation window. Avoid full table scans.
4. **Handle no data** — In **Configure no data and error handling**, choose whether no data should keep the alert as-is, fire the alert, or resolve it. Use **Alerting** when no data indicates a problem (e.g. a heartbeat query).
5. **Test the query first** — Run the query in **Explore** with the ClickHouse data source and confirm it returns the expected numeric data before saving the alert rule.

## Next steps

- [ClickHouse query editor](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/query-editor/) — Macros such as `$__timeFilter` and `$__timeInterval`.
- [Grafana Alerting](https://grafana.com/docs/grafana/latest/alerting/) — Alert rules, contact points, and notification policies.
- [Troubleshoot ClickHouse data source issues](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/troubleshooting/) — Common errors and solutions.
