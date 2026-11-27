-- OTel metrics fixture for the single-table metrics data source.
--
-- The docker-compose e2e-data-loader service iterates every *.sql file under
-- /data in lexicographic order.
--
-- Schema mirrors the OTel ClickHouse exporter metrics DDL: one table per point
-- type, identity columns shared by all of them, attributes as Map(String,
-- String) like the logs and traces fixtures. The reader sorts on
-- (ServiceName, MetricName, toStartOfHour(TimeUnix), TimeUnix) instead of
-- hashing the attribute map, which changes nothing about the queries.
--
-- Every row sits at 2024-03-15 10:00-10:09 UTC, the window
-- tests/e2e/helpers/env.ts pins. One metric per value layout, and their values
-- are chosen so the e2e assertions can be exact:
--   * system.cpu.utilization, a gauge with two series (0.5 and 0.25), so a
--     query without group by averages to 0.375.
--   * container.cpu.time, a cumulative monotonic sum of 60s per minute, so a
--     rate is 1 per second.
--   * http.server.duration, a cumulative histogram whose buckets grow by
--     [30, 15, 4, 1] per minute, so its p95 is 250 + 250 * (47.5 - 45) / 4.
--   * rpc.server.duration, a cumulative summary reporting p50, p90 and p99.
-- The exponential histogram table exists but stays empty: the editor must
-- still find it and offer the other metrics.

CREATE DATABASE IF NOT EXISTS e2e_test;

DROP TABLE IF EXISTS e2e_test.otel_metrics_gauge;
DROP TABLE IF EXISTS e2e_test.otel_metrics_sum;
DROP TABLE IF EXISTS e2e_test.otel_metrics_histogram;
DROP TABLE IF EXISTS e2e_test.otel_metrics_exp_histogram;
DROP TABLE IF EXISTS e2e_test.otel_metrics_summary;

CREATE TABLE e2e_test.otel_metrics_gauge
(
    ResourceAttributes  Map(String, String),
    ScopeName           String,
    ScopeAttributes     Map(String, String),
    ServiceName         LowCardinality(String),
    MetricName          LowCardinality(String),
    MetricDescription   String,
    MetricUnit          String,
    Attributes          Map(String, String),
    StartTimeUnix       DateTime64(9),
    TimeUnix            DateTime64(9),
    Value               Float64
)
ENGINE = MergeTree
PARTITION BY toDate(TimeUnix)
ORDER BY (ServiceName, MetricName, toStartOfHour(TimeUnix), TimeUnix);

CREATE TABLE e2e_test.otel_metrics_sum
(
    ResourceAttributes      Map(String, String),
    ScopeName               String,
    ScopeAttributes         Map(String, String),
    ServiceName             LowCardinality(String),
    MetricName              LowCardinality(String),
    MetricDescription       String,
    MetricUnit              String,
    Attributes              Map(String, String),
    StartTimeUnix           DateTime64(9),
    TimeUnix                DateTime64(9),
    AggregationTemporality  Int32,
    IsMonotonic             Bool,
    Value                   Float64
)
ENGINE = MergeTree
PARTITION BY toDate(TimeUnix)
ORDER BY (ServiceName, MetricName, toStartOfHour(TimeUnix), TimeUnix);

CREATE TABLE e2e_test.otel_metrics_histogram
(
    ResourceAttributes      Map(String, String),
    ScopeName               String,
    ScopeAttributes         Map(String, String),
    ServiceName             LowCardinality(String),
    MetricName              LowCardinality(String),
    MetricDescription       String,
    MetricUnit              String,
    Attributes              Map(String, String),
    StartTimeUnix           DateTime64(9),
    TimeUnix                DateTime64(9),
    AggregationTemporality  Int32,
    Count                   UInt64,
    Sum                     Float64,
    BucketCounts            Array(Float64),
    ExplicitBounds          Array(Float64),
    Min                     Float64,
    Max                     Float64
)
ENGINE = MergeTree
PARTITION BY toDate(TimeUnix)
ORDER BY (ServiceName, MetricName, toStartOfHour(TimeUnix), TimeUnix);

CREATE TABLE e2e_test.otel_metrics_exp_histogram
(
    ResourceAttributes      Map(String, String),
    ScopeName               String,
    ScopeAttributes         Map(String, String),
    ServiceName             LowCardinality(String),
    MetricName              LowCardinality(String),
    MetricDescription       String,
    MetricUnit              String,
    Attributes              Map(String, String),
    StartTimeUnix           DateTime64(9),
    TimeUnix                DateTime64(9),
    AggregationTemporality  Int32,
    Count                   UInt64,
    Sum                     Float64,
    Scale                   Int32,
    ZeroCount               UInt64,
    PositiveOffset          Int32,
    PositiveBucketCounts    Array(UInt64),
    NegativeOffset          Int32,
    NegativeBucketCounts    Array(UInt64),
    Flags                   UInt32,
    Min                     Float64,
    Max                     Float64
)
ENGINE = MergeTree
PARTITION BY toDate(TimeUnix)
ORDER BY (ServiceName, MetricName, toStartOfHour(TimeUnix), TimeUnix);

CREATE TABLE e2e_test.otel_metrics_summary
(
    ResourceAttributes      Map(String, String),
    ScopeName               String,
    ScopeAttributes         Map(String, String),
    ServiceName             LowCardinality(String),
    MetricName              LowCardinality(String),
    MetricDescription       String,
    MetricUnit              String,
    Attributes              Map(String, String),
    StartTimeUnix           DateTime64(9),
    TimeUnix                DateTime64(9),
    Count                   UInt64,
    Sum                     Float64,
    ValueAtQuantiles Nested
    (
        Quantile            Float64,
        Value               Float64
    )
)
ENGINE = MergeTree
PARTITION BY toDate(TimeUnix)
ORDER BY (ServiceName, MetricName, toStartOfHour(TimeUnix), TimeUnix);

-- system.cpu.utilization, one point per minute and series.
INSERT INTO e2e_test.otel_metrics_gauge
SELECT
    map('service.name', 'api', 'service.instance.id', 'api-1') AS ResourceAttributes,
    'go.opentelemetry.io/contrib/instrumentation/runtime' AS ScopeName,
    CAST(map(), 'Map(String, String)') AS ScopeAttributes,
    'api' AS ServiceName,
    'system.cpu.utilization' AS MetricName,
    'Fraction of CPU time used by the process.' AS MetricDescription,
    '1' AS MetricUnit,
    map('cpu', '0') AS Attributes,
    toDateTime64('2024-03-15 10:00:00', 9) + toIntervalSecond(60 * number) AS StartTimeUnix,
    toDateTime64('2024-03-15 10:00:00', 9) + toIntervalSecond(60 * number) AS TimeUnix,
    toFloat64(0.5) AS Value
FROM numbers(10);

INSERT INTO e2e_test.otel_metrics_gauge
SELECT
    map('service.name', 'worker', 'service.instance.id', 'worker-1') AS ResourceAttributes,
    'go.opentelemetry.io/contrib/instrumentation/runtime' AS ScopeName,
    CAST(map(), 'Map(String, String)') AS ScopeAttributes,
    'worker' AS ServiceName,
    'system.cpu.utilization' AS MetricName,
    'Fraction of CPU time used by the process.' AS MetricDescription,
    '1' AS MetricUnit,
    map('cpu', '0') AS Attributes,
    toDateTime64('2024-03-15 10:00:00', 9) + toIntervalSecond(60 * number) AS StartTimeUnix,
    toDateTime64('2024-03-15 10:00:00', 9) + toIntervalSecond(60 * number) AS TimeUnix,
    toFloat64(0.25) AS Value
FROM numbers(10);

-- container.cpu.time: cumulative and monotonic, 60 seconds of CPU time per minute.
INSERT INTO e2e_test.otel_metrics_sum
SELECT
    map('service.name', 'api', 'service.instance.id', 'api-1') AS ResourceAttributes,
    'go.opentelemetry.io/otel/sdk/metric' AS ScopeName,
    CAST(map(), 'Map(String, String)') AS ScopeAttributes,
    'api' AS ServiceName,
    'container.cpu.time' AS MetricName,
    'Total CPU time consumed.' AS MetricDescription,
    's' AS MetricUnit,
    map('container', 'api') AS Attributes,
    toDateTime64('2024-03-15 09:00:00', 9) AS StartTimeUnix,
    toDateTime64('2024-03-15 10:00:00', 9) + toIntervalSecond(60 * number) AS TimeUnix,
    2 AS AggregationTemporality,
    true AS IsMonotonic,
    toFloat64(60 * number) AS Value
FROM numbers(10);

-- http.server.duration: a cumulative histogram with bounds 100, 250 and 500ms. Each minute adds
-- 30, 15, 4 and 1 observations to the four buckets, 50 in total, so BucketCounts holds one count
-- per bucket and its sum is Count.
INSERT INTO e2e_test.otel_metrics_histogram
SELECT
    map('service.name', 'api', 'service.instance.id', 'api-1') AS ResourceAttributes,
    'go.opentelemetry.io/otel/sdk/metric' AS ScopeName,
    CAST(map(), 'Map(String, String)') AS ScopeAttributes,
    'api' AS ServiceName,
    'http.server.duration' AS MetricName,
    'Duration of HTTP server requests.' AS MetricDescription,
    'ms' AS MetricUnit,
    map('http.request.method', 'GET') AS Attributes,
    toDateTime64('2024-03-15 09:00:00', 9) AS StartTimeUnix,
    toDateTime64('2024-03-15 10:00:00', 9) + toIntervalSecond(60 * number) AS TimeUnix,
    2 AS AggregationTemporality,
    toUInt64(50 * (number + 1)) AS Count,
    toFloat64(900 * (number + 1) + 10 * number) AS Sum,
    arrayMap(x -> x * (number + 1), [30., 15., 4., 1.]) AS BucketCounts,
    [100., 250., 500.] AS ExplicitBounds,
    toFloat64(5) AS Min,
    toFloat64(900) AS Max
FROM numbers(10);

-- rpc.server.duration: a summary reporting p50, p90 and p99.
INSERT INTO e2e_test.otel_metrics_summary
SELECT
    map('service.name', 'api', 'service.instance.id', 'api-1') AS ResourceAttributes,
    'go.opentelemetry.io/otel/sdk/metric' AS ScopeName,
    CAST(map(), 'Map(String, String)') AS ScopeAttributes,
    'api' AS ServiceName,
    'rpc.server.duration' AS MetricName,
    'Duration of RPC server requests.' AS MetricDescription,
    'ms' AS MetricUnit,
    map('rpc.method', 'GetUser') AS Attributes,
    toDateTime64('2024-03-15 09:00:00', 9) AS StartTimeUnix,
    toDateTime64('2024-03-15 10:00:00', 9) + toIntervalSecond(60 * number) AS TimeUnix,
    toUInt64(20 * (number + 1)) AS Count,
    toFloat64(2000 * (number + 1)) AS Sum,
    [0.5, 0.9, 0.99] AS `ValueAtQuantiles.Quantile`,
    [toFloat64(100 + 10 * number), toFloat64(200 + 10 * number), toFloat64(300 + 10 * number)] AS `ValueAtQuantiles.Value`
FROM numbers(10);
