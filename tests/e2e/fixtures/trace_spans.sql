-- Trace-spans fixture for the #1541 trace-viewer LIMIT regression guard.
--
-- Self-contained so ordering with seed.sql does not matter. The
-- docker-compose e2e-data-loader service iterates every *.sql file under
-- /data in lexicographic order.
--
-- The bug: when the user searches traces with a LIMIT (e.g. 3), the plugin
-- reuses the same LIMIT for the single-trace span query, truncating the
-- waterfall. Fix drops LIMIT from `generateTraceIdQuery`. The fixture seeds
-- 5 spans for trace 'e2e-trace-a' so an E2E test can assert the "no LIMIT"
-- SQL pattern returns all 5 spans.

CREATE DATABASE IF NOT EXISTS e2e_test;

CREATE TABLE IF NOT EXISTS e2e_test.trace_spans
(
    Timestamp    DateTime64(9),
    TraceId      String,
    SpanId       String,
    ParentSpanId String,
    ServiceName  LowCardinality(String),
    SpanName     LowCardinality(String),
    Duration     Int64
)
ENGINE = MergeTree
ORDER BY (TraceId, Timestamp);

-- Five spans for 'e2e-trace-a' cover the regression case for #1541 (must
-- not be truncated at LIMIT 3). The 'e2e-trace-b' row is unrelated noise
-- so the WHERE TraceId = '…' filter is exercised.
INSERT INTO e2e_test.trace_spans
    (Timestamp, TraceId, SpanId, ParentSpanId, ServiceName, SpanName, Duration) VALUES
    ('2024-03-15 10:00:00', 'e2e-trace-a', 'span-1', '',        'api',    'HTTP GET /',        10000000),
    ('2024-03-15 10:00:01', 'e2e-trace-a', 'span-2', 'span-1',  'api',    'db.query users',     5000000),
    ('2024-03-15 10:00:02', 'e2e-trace-a', 'span-3', 'span-1',  'api',    'cache.get profile',  2000000),
    ('2024-03-15 10:00:03', 'e2e-trace-a', 'span-4', 'span-2',  'db',     'SELECT users',       4000000),
    ('2024-03-15 10:00:04', 'e2e-trace-a', 'span-5', 'span-3',  'cache',  'GET profile:42',     1000000),
    ('2024-03-15 10:00:10', 'e2e-trace-b', 'span-9', '',        'worker', 'job.run',            8000000);
