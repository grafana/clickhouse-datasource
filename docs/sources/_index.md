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
- [ClickHouse query editor](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/editor/)
- [ClickHouse templates and variables](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/templates-and-variables/)

## Additional features

After configuring the data source, you can:

- Use [Explore](https://grafana.com/docs/grafana/latest/explore/) to query data without building a dashboard
- Add [Transformations](https://grafana.com/docs/grafana/latest/panels/transformations/) to manipulate query results
- Set up [Alerting](https://grafana.com/docs/grafana/latest/alerting/) rules

## Pre-built dashboards

The plugin includes pre-built dashboards for cluster, data, and query analysis. After adding the data source, open **Connections** > **Data sources** > **ClickHouse** and select the **Dashboards** tab to import them.

## Plugin updates

Always ensure that your plugin version is up-to-date so you have access to all current features and improvements. Navigate to **Plugins and data** > **Plugins** to check for updates. Grafana recommends upgrading to the latest Grafana version, and this applies to plugins as well.

{{< admonition type="note" >}}
Plugins are automatically updated in Grafana Cloud.
{{< /admonition >}}

## Related resources

- [ClickHouse documentation](https://clickhouse.com/docs)
- [Grafana community forum](https://community.grafana.com/)
