---
description: This document introduces the ClickHouse data source
labels:
products:
  - Grafana Cloud
  - Grafana OSS
  - Grafana Enterprise
keywords:
  - data source
menuTitle: ClickHouse data source
title: ClickHouse data source
weight: 10
version: 0.1
last_reviewed: 2026-04-27
---

# ClickHouse data source

The ClickHouse data source plugin allows you to query and visualize ClickHouse data in Grafana and create alerts based on your ClickHouse queries. Use the SQL editor or the visual query builder to build dashboards with time series, tables, logs, and traces.

## Supported features

| Feature | Supported |
|---------|-----------|
| Metrics | Yes |
| Logs | Yes |
| Traces | Yes |
| Alerting and recording rules | Yes |
| Annotations | Yes |
| Template variables | Yes |
| Ad hoc filters | Yes (ClickHouse 22.7+) |
| Private Data Connect (PDC) | Yes (Grafana Cloud) |

## Requirements

| Grafana version | Plugin version |
|-----------------|----------------|
| 11.6.0 and later | v4.15+ |
| 9.x – 11.5.x | v4.0 – v4.14 |

{{< admonition type="note" >}}
- Ad hoc filters require ClickHouse 22.7 or later (from plugin v2.0 onward).
- Log volume queries in the SQL editor require Grafana 12.4.0 or later.
{{< /admonition >}}

## Get started

Start by configuring a connection to your ClickHouse server, then use the query editor to build queries for dashboards and alerts.

1. [Configure the ClickHouse data source](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/configure/) — Set up the connection, authentication, TLS, and optional features like logs and traces.
2. [ClickHouse query editor](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/query-editor/) — Write SQL queries or use the visual query builder. Includes macros, query types, and examples.
3. [ClickHouse template variables](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/template-variables/) — Create dynamic dashboards with variables and ad hoc filters.
4. [ClickHouse annotations](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/annotations/) — Overlay event markers on dashboard panels from ClickHouse data.
5. [ClickHouse alerting](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/alerting/) — Create alert rules and recording rules from ClickHouse queries.
6. [Troubleshoot ClickHouse data source issues](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/troubleshooting/) — Solutions for common connection, query, and configuration errors.

## Additional features

After configuring the data source, you can:

- Use [Explore](https://grafana.com/docs/grafana/latest/explore/) to query data without building a dashboard
- Add [Transformations](https://grafana.com/docs/grafana/latest/panels/transformations/) to manipulate query results
- Set up [Alerting](https://grafana.com/docs/grafana/latest/alerting/) rules

## Pre-built dashboards

The plugin includes the following pre-built dashboards:

- **ClickHouse - Query Analysis** — Query performance, time distribution, top users, and memory usage.
- **ClickHouse - Data Analysis** — Disk usage, table and database summary, parts over time, and dictionaries.
- **ClickHouse - Cluster Analysis** — Cluster overview, merges, mutations, and replicated table delay.
- **Simple ClickHouse OTel Dashboard** — Traces, logs, and service performance for OpenTelemetry data in ClickHouse.
- **Advanced ClickHouse Monitoring Dashboard** — System metrics (CPU, queries/sec, IO, memory) similar to ClickHouse built-in monitoring.

To import a pre-built dashboard:

1. Go to **Connections** > **Data sources**.
2. Select your ClickHouse data source.
3. Click the **Dashboards** tab.
4. Click **Import** next to the dashboard you want to use.

## Plugin updates

Always ensure that your plugin version is up-to-date so you have access to all current features and improvements. Navigate to **Plugins and data** > **Plugins** to check for updates. Grafana recommends upgrading to the latest Grafana version, and this applies to plugins as well.

{{< admonition type="note" >}}
Plugins are automatically updated in Grafana Cloud.
{{< /admonition >}}

## Related resources

- [ClickHouse documentation](https://clickhouse.com/docs)
- [grafana-clickhouse-datasource on GitHub](https://github.com/grafana/clickhouse-datasource) — Source code, issues, and changelog.
- [Grafana community forum](https://community.grafana.com/)
