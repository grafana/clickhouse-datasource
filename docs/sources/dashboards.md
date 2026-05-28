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

`StatusCode` is matched against the OTel spec value `'Error'`, which is what the current ClickHouse exporter writes.

## OTel Logs Explorer

![OTel Logs Explorer (light theme)](https://raw.githubusercontent.com/alex-fedotyev/clickhouse-datasource/alex/ootb-dashboards-screenshots/screenshots/otel-logs-explorer-light.png)

A multi-service log overview. Top row: stacked log volume by SeverityText, top services bar gauge with click-to-filter, severity donut, and a Top Error Messages table that strips common id-style tokens (userId, traceId, etc.) before grouping so similar messages cluster.

Below the overview, a per-service row repeats once per service in the **Service** variable, showing log volume by SeverityText alongside recent log samples for that service.

The per-service Log Volume panel has an **Open in Explore** link in the panel header that pre-fills a matching query in Explore, where you can refine filters or change visualisation.

Filter variables: **Service** (multi, defaults to top 10 by volume), **Level** (multi), **Search** (textbox; passes through to `hasToken(Body, ...)`).

Annotations: deployment markers derived from `service.version` changes in `otel_traces` over 30-second buckets.

## OTel Traces Explorer

![OTel Traces Explorer (light theme)](https://raw.githubusercontent.com/alex-fedotyev/clickhouse-datasource/alex/ootb-dashboards-screenshots/screenshots/otel-traces-explorer-light.png)

System topology + trace search. Top row: service map node graph computed from `parent.SpanId = child.ParentSpanId` joins on `otel_traces`, limited to the top 30 services and top 50 inter-service edges. Node arcs show success/error fractions; edge labels show call counts.

Trace Search Results lists recent traces matching the variable filters (Service, Operation, Status, Min Duration). Click a TraceId to open Grafana's trace view for that trace; click a Service to open the OTel Service Dashboard for that service; click an Operation to filter this view.

Below trace search, a per-service row repeats once per service: a 1-in-500 sampled duration heatmap, four sparkline stats (Spans, Errors, P99, Avg Duration), and a Top Operations table with error counts colour-coded by error percent.

Each per-service panel has an **Open in Explore** link in its panel header that pre-fills a matching query in Explore.

Filter variables: **Service** (multi), **Operation** (multi), **Status** (multi), **Min Duration (ms)** (textbox; leave blank for no minimum, passes through `$__conditionalAll`).

## OTel Service Dashboard

![OTel Service Dashboard (light theme)](https://raw.githubusercontent.com/alex-fedotyev/clickhouse-datasource/alex/ootb-dashboards-screenshots/screenshots/otel-service-dashboard-light.png)

Single-service deep dive, broken out by SpanKind. Top to bottom:

1. **Server spans** (expanded): RED metrics (Request Rate, Error Rate with green/yellow/red thresholds at 1% and 5%, Duration Percentiles with P50 and P90 solid and P99 dashed orange) and Slowest Server Operations table. Server spans are incoming requests this service handles.
2. **Client spans** (expanded): same RED layout filtered to outgoing requests, plus Slowest Client Operations. Use these to spot slow dependencies.
3. **Errors & recent logs** (expanded): Top Errors table (with a SpanKind column so you can tell which side produced each error) and recent logs for the service, side by side.
4. **Internal spans** (collapsed by default): RED metrics and Slowest Internal Operations for in-process work (function-level instrumentation). Click the row header to expand.
5. **Async spans (Producer + Consumer)** (collapsed by default): RED metrics and Slowest Async Operations for message production and consumption against queues or event buses. The Slowest Async Operations table includes a SpanKind column so you can tell Producer from Consumer at a glance.

Click any operation in any Slowest Operations or Top Errors table to open the matching trace search in OTel Traces Explorer.

Filter variables: **Service** (single-select), **Operation** (multi).

To see a specific trace, open OTel Traces Explorer and click a TraceId in Trace Search Results. That opens Grafana's trace view in a side pane.

## Cross-dashboard navigation

Each dashboard has an **OTEL Dashboards** link in the top-right that drops down to the other two, preserving variables and time range.

Data links between panels carry the same context:

- **OTel Traces Explorer** → trace view: clicking a TraceId in Trace Search Results opens Grafana's trace view for that trace.
- **OTel Traces Explorer** → **OTel Service Dashboard**: clicking a Service in Trace Search Results opens the Service Dashboard filtered to that service.
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
