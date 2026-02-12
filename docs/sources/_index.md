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
last_reviewed: 2026-02-11
---

# ClickHouse data source

The ClickHouse data source allows you to query and visualize ClickHouse data in Grafana. Use the raw SQL editor or query builder to create dashboards, time series, tables, logs, and traces.

## Supported features

| Feature | Supported |
|---------|-----------|
| Metrics | Yes |
| Logs | Yes |
| Traces | Yes |
| Alerting | Yes |
| Annotations | Yes |

## Requirements

| Grafana version | Plugin version |
|-----------------|----------------|
| 9.x and later | v4 |
| 8.x | v2.2.0 |

{{< admonition type="note" >}}
Ad hoc filters require ClickHouse 22.7 or later (from plugin v2.0 onward).
{{< /admonition >}}

## Get started

The following documents help you get started:

- [Configure the ClickHouse data source](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/configure/)
- [ClickHouse query editor](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/query-editor/)
- [ClickHouse template variables](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/template-variables/)
- [ClickHouse annotations](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/annotations/)
- [ClickHouse alerting](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/alerting/)
- [Troubleshoot ClickHouse data source issues](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/troubleshooting/)

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
- [Grafana community forum](https://community.grafana.com/)
