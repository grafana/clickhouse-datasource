# OTel metrics as a single source

Status: implemented on branch `claude/metrics-single-table-otel-piv0so`.

## Goal

Browse and chart OpenTelemetry metrics stored in ClickHouse as easily as in a Prometheus/Mimir data
source, so ClickHouse can replace Mimir as the metrics backend. The editor has to hide the storage
layout, pick sensible math per metric type, and make grouping and filtering by labels quick.

## The schema

The [opentelemetry-collector-contrib ClickHouse exporter](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/clickhouseexporter/internal/sqltemplates)
writes one table per data point type. Names come from the exporter option `metrics_tables`:

| Type                  | Default table                                                              | Value columns                                                                             |
| --------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Gauge                 | `otel_metrics_gauge`                                                       | `Value`                                                                                   |
| Sum                   | `otel_metrics_sum`                                                         | `Value`, `AggregationTemporality`, `IsMonotonic`                                          |
| Histogram             | `otel_metrics_histogram`                                                   | `Count`, `Sum`, `BucketCounts`, `ExplicitBounds`, `Min`, `Max`, `AggregationTemporality`  |
| Exponential histogram | `otel_metrics_exp_histogram` (older: `otel_metrics_exponential_histogram`) | `Count`, `Sum`, `Scale`, `ZeroCount`, positive/negative buckets, `AggregationTemporality` |
| Summary               | `otel_metrics_summary`                                                     | `Count`, `Sum`, `ValueAtQuantiles.Quantile`, `ValueAtQuantiles.Value`                     |

All of them share the identity columns: `MetricName`, `MetricUnit`, `MetricDescription`,
`ServiceName`, `ResourceAttributes`, `ScopeName`, `ScopeAttributes`, `Attributes` (Map, or JSON with
the exporter's `json: true`), and `TimeUnix`. The sorting key starts with
`(ServiceName, MetricName, toStartOfHour(TimeUnix), cityHash64(Attributes), TimeUnix)`.

## Decisions

### One logical source for five tables

"Single table" for metrics means one _set_ of tables. The user never picks a table:

- The config stores a database and the five table names (empty = exporter default), mirroring
  `metrics_tables`, so a custom exporter setup is configured by copying names.
- The data source lists the existing tables once (`SHOW TABLES`) and resolves each type. Missing
  types are skipped; the legacy exponential histogram name is found automatically.
- The editor's **metric picker** runs one `UNION ALL` over the existing tables, grouped by
  `MetricName` within the dashboard time range, returning name, type, unit, description and
  monotonicity. Picking a metric sets the table of its type. The query stores the metric type, so it
  keeps working when table names change: the editor re-points saved queries to the configured table.

### Math follows the metric type (two-level aggregation like PromQL)

Every query computes a value **per series per time bucket** first, then **aggregates across series**
per group. A series is `cityHash64(ResourceAttributes, ScopeName, ScopeAttributes, Attributes)`.
This avoids the classic pitfall of summing every raw gauge sample in a bucket.

| Type                     | Functions (default first)                                  | Cross-series default |
| ------------------------ | ---------------------------------------------------------- | -------------------- |
| Gauge                    | avg, min, max, last                                        | avg                  |
| Sum, monotonic (counter) | rate, increase                                             | sum                  |
| Sum, non-monotonic       | last, avg, min, max                                        | sum                  |
| Histogram                | quantile, rate, increase, sum rate, average value, heatmap | merged buckets       |
| Exponential histogram    | rate, increase, sum rate, average value                    | sum                  |
| Summary                  | quantile, rate, increase, sum rate, average value          | avg                  |

- **Counters** use `lagInFrame` over each series to turn cumulative values into increases. A drop of
  the value (or of `Count` for histograms and summaries) is a counter reset, after which the new
  value is the increase. Delta temporality points (`AggregationTemporality = 1`) are their own
  increase. Rows are read from `max(interval, 10m)` before the range so the first bucket has a
  previous point.
- **Histogram quantiles** compute per-series bucket increases, add the buckets of all series in a
  group by upper bound (`sumMap`), and interpolate inside the bucket holding the quantile, like
  `histogram_quantile`. Several quantiles produce one column each (`p50`, `p95`, `p99`). Matching
  by bound, not position, matters because one metric can come with different bounds: in the test
  data, `http.server.request.duration` from applications has 10 bounds and the Collector's own has 14. A bucket of the coarser series counts towards its own upper bound in the merged histogram.
- **Histogram heatmaps** return the same merged bucket increases with one row per time bucket
  and histogram bucket with the upper bound as the `le` label. The frontend turns the wide frame
  into a `heatmap-rows` frame (fields named by bound, ordered by bound), which the Heatmap panel
  draws as is. The group by doesn't apply, since a heatmap shows one histogram.
- **Summary quantiles** read the reported quantile values; the picker lists the quantiles the
  metric actually reports.
- **Average value** is `sum(Δ Sum) / sum(Δ Count)`, the correct mean across series.

### Labels: one list, three attribute maps

Group by and filter pickers show a single label list, grouped by origin:
columns (`ServiceName`, `ScopeName`), resource attributes, data point attributes, scope attributes.
Keys are discovered for the selected metric only, with one `groupUniqArrayArray` query per metric,
honouring the existing "Map keys discovery" switch. Label values are suggested per metric and label.
Result columns are named by the label key (Grafana shows them in legends); clashes get a source
prefix. JSON attribute columns are detected from the table schema and read with typed sub-paths.

### Filters reuse the builder filter model

Label filters are ordinary builder `Filter`s on `Attributes['key']` style map keys, so the SQL
generator, filter chips and "Open in SQL editor" behave as for logs and traces. Operators: `=`,
`!=`, `in`, `not in`, contains, does not contain.

### Fits the existing single-table flow

- `signalType: 'metrics'` next to `logs` and `traces`, in both config editors and `dsconfig.json`.
- The query is a time series builder query with a `metric` section; new and empty queries open in
  the metrics editor, classic queries authored before the switch stay in the classic builder.
- Queries without a picked metric generate no SQL and are not run.
- "Open in SQL editor" turns the generated SQL into a starting point for hand-written queries.

### Verification of every function

Every metric type x function x cross-series aggregation the editor offers (222 combinations, on
real host and Prometheus data plus generated data with restarts, delta temporality, up-down
counters and varying gauges) was compared with an independent Python reference that reads the
raw points and applies the definitions, at 1 s, 60 s and 300 s intervals: all match. The check
found one bug, fixed since: summary quantiles reported as NaN (no observations) now count as
missing instead of turning averages into NaN. A later run added the heatmaps and a quantile
across series with different bucket bounds, which found that buckets were merged by position;
they now merge by bound.

### Many instances

Verified with a simulated fleet sent through the Collector (30 instances with known rates, a
restarting instance, two replicas without `service.instance.id`):

- Series are separated by resource, scope and data point attributes, so per-instance math is right
  and cross-series aggregation (sum, avg, count) matches the ground truth exactly; restarts are
  handled as counter resets.
- Rates divide each increase by the time it covers (time since the previous point, or start to end
  for delta points), not by the bucket width, so they are right at any dashboard interval.
- The editor detects each metric's export interval and never buckets finer than twice that
  (`greatest($__interval_s, <seconds>)`), so every instance has a point in each bucket.
- Writers sharing one identity cannot be separated reliably (Mimir rejects such samples as
  duplicates or out of order). The editor detects them (repeated timestamps, or cumulative start
  times changing every minute) and warns, pointing to `service.instance.id`.

### Performance on large tables

Benchmarked on 51.8M rows in the exporter's schema (2,000 series of one counter plus noise metrics
over 24 hours):

- `MetricName` and time filters prune well through the sorting key (`ServiceName, MetricName,
toStartOfHour(TimeUnix), ...`) and daily partitions: a metric reads only its own granules, and a
  `ServiceName` filter cuts reads by another 20x.
- Counters and histograms aggregate per series, run (`StartTimeUnix`) and time bucket while
  reading, with exact increases inside a run (`deltaSumTimestamp`) and value-based reset handling
  between runs. Only these groups go through the window function, so memory grows with series x
  buckets, not raw points (24h at 15 minute resolution: 630 MB -> 100 MB). Results are identical to
  the earlier point-by-point window, except that the first bucket is no longer cut off.
- Identifying series by hashing the attribute maps is most of the remaining cost (24h by service:
  2.6 s at 1 minute, 1.6 s at 15 minutes). A materialized series id column would cut it 2-5x, but
  needs a schema change, which is out of scope: the plugin works on the exporter's tables as they
  are.
- Editor lookups read at most 6 hours (metric list, label keys and values) or the last 15 minutes
  (export interval and shared series check).

### Dashboard variables

- Variable types `Label values` (like `label_values()`, optionally for one metric and with label
  filters) and `Metric names` generate editable SQL over the metric tables, reading at most the
  last 6 hours of the range.
- A label filter whose value is a variable becomes `IN (${var:singlequote})`, which works for one,
  several or all values, wrapped in `$__conditionalAll` so `All` drops the filter. Filters may chain
  variables (`ServiceName = $service` in a `pod` variable).
- Verified in Grafana 13.3 with a chained `$service` / `$pod` dashboard: All, one service, two
  services and one pod return the expected options and series.

## Follow-ups

- Verify the generated SQL against a live ClickHouse with exporter data in CI (integration test).
- Exponential histogram quantiles (needs scale alignment across series).
- Heatmaps for exponential histograms (same scale alignment as their quantiles).
- Exemplars: link from points to traces via `Exemplars.TraceId`.
- Ad hoc filters for metrics dashboards (map `key` to the three attribute maps).
- Pre-aggregated rollup tables (for example per-minute materialized views) for ranges of weeks or
  months on large deployments, picked automatically by range.
