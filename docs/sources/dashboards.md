---
description: OpenTelemetry dashboards bundled with the ClickHouse data source for logs, traces, and per-service deep dives
labels:
products:
  - Grafana Cloud
  - Grafana OSS
  - Grafana Enterprise
keywords:
  - data source
  - dashboards
  - opentelemetry
  - otel
  - logs
  - traces
menuTitle: OpenTelemetry dashboards
title: ClickHouse OpenTelemetry dashboards
weight: 60
version: 0.1
last_reviewed: 2026-05-07
---

# ClickHouse OpenTelemetry dashboards

The plugin ships three pre-built dashboards for OpenTelemetry data stored in ClickHouse. Together they cover top-down log exploration, service topology and trace search, and a single-service deep dive that ties RED metrics, errors, logs, and trace detail into one view.

The three dashboards link to each other via dashboard data links: clicking a service or operation in one dashboard preserves the time range and datasource and lands you on the matching view in another.

## Required schema

The dashboards expect the standard table layout produced by the [ClickHouse exporter for the OpenTelemetry Collector](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/clickhouseexporter):

- A logs table named `otel_logs` in the data source's default database.
- A traces table named `otel_traces` in the data source's default database.

Both tables are referenced by their bare names in raw SQL, so the data source's **Default database** setting needs to point at the database that holds them. If you renamed the OTel exporter tables, the dashboards do not pick the new names up automatically; either restore the standard names or duplicate the dashboards and edit the SQL.

The dashboards rely on the columns the exporter ships with: `Timestamp`, `Body`, `SeverityText`, `ServiceName`, `TraceId`, `SpanId`, `ResourceAttributes` for logs; `TraceId`, `ServiceName`, `SpanName`, `Timestamp`, `Duration`, `StatusCode`, `SpanKind`, `ParentSpanId`, `SpanAttributes`, `ResourceAttributes` for traces.

`StatusCode` is matched against `'Error'` and `'STATUS_CODE_ERROR'` so both the current Go-exporter schema and the older string-based schema render correctly.

## OTel Logs Explorer

![OTel Logs Explorer (light theme)](https://raw.githubusercontent.com/alex-fedotyev/clickhouse-datasource/alex/ootb-dashboards-screenshots/screenshots/otel-logs-explorer-light.png)

A multi-service log overview. Top row: stacked log volume by SeverityText, top services bar gauge with click-to-filter, severity donut, and a Top Error Messages table that strips common id-style tokens (userId, traceId, etc.) before grouping so similar messages cluster.

Below the overview, a per-service row repeats once per service in the **Service** variable, showing log volume by SeverityText alongside recent log samples for that service.

Filter variables: **Service** (multi, defaults to top 10 by volume), **Level** (multi), **Search** (textbox; passes through to `hasToken(Body, ...)`).

Annotations: deployment markers derived from `service.version` changes in `otel_traces` over 30-second buckets.

## OTel Traces Explorer

![OTel Traces Explorer (light theme)](https://raw.githubusercontent.com/alex-fedotyev/clickhouse-datasource/alex/ootb-dashboards-screenshots/screenshots/otel-traces-explorer-light.png)

System topology + trace search. Top row: service map node graph computed from `parent.SpanId = child.ParentSpanId` joins on `otel_traces`, limited to the top 30 services and top 50 inter-service edges. Node arcs show success/error fractions; edge labels show call counts.

Trace Search Results lists recent traces matching the variable filters (Service, Operation, Status, Min Duration). Click a TraceId to open the OTel Service Dashboard for that trace; click a Service or Operation to filter this view.

Below trace search, a per-service row repeats once per service: a 1-in-500 sampled duration heatmap, four sparkline stats (Spans, Errors, P99, Avg Duration), and a Top Operations table with error counts colour-coded by error percent.

Filter variables: **Service** (multi), **Operation** (multi), **Status** (multi), **Min Duration (ms)** (textbox; leave blank for no minimum, passes through `$__conditionalAll`).

## OTel Service Dashboard

![OTel Service Dashboard with a TraceId set (light theme)](https://raw.githubusercontent.com/alex-fedotyev/clickhouse-datasource/alex/ootb-dashboards-screenshots/screenshots/otel-service-dashboard-light.png)

Single-service deep dive. Top to bottom:

1. **RED Metrics**: Request Rate (spans per second), Error Rate (with green/yellow/red thresholds at 1% and 5%), and Duration Percentiles (P50 and P90 solid, P99 dashed orange).
2. **Errors & Slow Operations**: Top Errors and Slowest Operations tables. Click an operation to open the matching trace search in OTel Traces Explorer.
3. **Related Logs**: recent logs for the selected service.
4. **Trace** (driven by the `Trace ID` textbox): a Trace Summary table, a builder-mode trace waterfall, and Correlated Logs filtered to the same TraceId. Empty until a Trace ID is set; paste one from the **Trace Search Results** table on OTel Traces Explorer.

Filter variables: **Service** (single-select), **Operation** (multi), **Trace ID** (textbox).

The trace waterfall uses the plugin's builder mode and currently hardcodes the database name to `otel_v2` (the standard OTel Collector ClickHouse exporter database). If your traces live in a different database, open the Trace Waterfall panel, switch to **Edit**, and change the **Database** field, then save the panel under a new copy of the dashboard.

## Cross-dashboard navigation

Each dashboard has an **OTEL Dashboards** link in the top-right that drops down to the other two, preserving variables and time range.

Data links between panels carry the same context:

- **OTel Traces Explorer** → **OTel Service Dashboard**: clicking a TraceId in Trace Search Results opens the Service Dashboard with both `var-traceId` and `var-service` set; the trace block populates immediately.
- **OTel Service Dashboard** → **OTel Traces Explorer**: clicking an operation in Top Errors or Slowest Operations opens trace search filtered to that service and operation.
- **OTel Logs Explorer**: clicking a service in the bar gauge self-filters the dashboard to that service.

## Performance considerations

- The service map in OTel Traces Explorer self-joins `otel_traces` on `ParentSpanId`. On large traces tables this can be slow. If you exceed the demo data scale, consider sampling on the join side or backing the dashboard with a materialised view that pre-computes parent-child edges.
- The duration heatmap on OTel Traces Explorer is sampled at 1-in-500 spans (`cityHash64(SpanId) % 500 = 0`) to keep heatmap cardinality low. Adjust the sampling fraction in the panel SQL if you have lower trace volume and want denser heatmaps.
- All dashboards default to a 30-second auto-refresh and a 1-hour time range. Widen the time range gradually; the trace queries scan `otel_traces` over the full range each refresh.

## Customising

The dashboards are JSON files in the plugin source under `src/dashboards/`. Import a copy via **Dashboards** > **New** > **Import**, edit it, and save under a new UID. The plugin-shipped versions get refreshed on every plugin update; your copy is stable.

Common customisations:

- **Different table names**: replace the literal `otel_logs` / `otel_traces` references in the panel SQL.
- **Per-environment defaults**: add an environment variable and an extra `WHERE` clause via `$__conditionalAll`.
- **Extra filters**: the `$__conditionalAll(EXPR, $var)` macro suppresses the clause when `$var` is empty, so you can add optional filters without breaking the empty-state.

## Related resources

- [Configure the ClickHouse data source](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/configure/)
- [ClickHouse exporter for the OpenTelemetry Collector](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/clickhouseexporter)
- [ClickHouse query editor](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/query-editor/)
- [ClickHouse template variables](/docs/plugins/grafana-clickhouse-datasource/<CLICKHOUSE_PLUGIN_VERSION>/template-variables/)
