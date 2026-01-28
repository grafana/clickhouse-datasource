---
description: This document introduces the ClickHouse data source
labels:
products:
  - Grafana Cloud
keywords:
  - data source
menuTitle: ClickHouse data source
title: ClickHouse data source
weight: 10
version: 0.1
---

# Official ClickHouse data source for Grafana

The ClickHouse data source plugin allows you to query and visualize ClickHouse data in Grafana.

- [Configure the ClickHouse data source](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/configure/)
- [ClickHouse query editor](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/editor/)
- [ClickHouse templates and variables](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/templates-and-variables/)

## Version compatibility

Users on Grafana `v9.x` and higher of Grafana can use `v4`.
Users on Grafana `v8.x` are encouraged to continue using `v2.2.0` of the plugin.

\* _As of 2.0 this plugin will only support ad hoc filters when using ClickHouse 22.7+_

## Get the most out of the ClickHouse data source

After installing and configuring ClickHouse you can:

- Add [Annotations](https://grafana.com/docs/grafana/latest/dashboards/annotations/).
- Add [Transformations](https://grafana.com/docs/grafana/latest/panels/transformations/)
- Set up [Alerting](https://grafana.com/docs/grafana/latest/alerting/)
