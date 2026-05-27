-- Trace-timestamp-table fixture for the hasTraceTimestampTable e2e tests.
--
-- Two tables are created:
--   e2e_test.trace_ts_spans        — the main trace spans table
--   e2e_test.trace_ts_spans_trace_id_ts — the companion lookup table
--     (same column layout as the OTel _trace_id_ts MV: TraceId, Start, End)
--
-- Two traces are seeded:
--   'e2e-ts-trace-a'  5 spans, companion entry present  → optimised SQL works
--   'e2e-ts-trace-b'  1 span,  NO companion entry       → optimised SQL returns
--                                                          0 rows; only the
--                                                          fallback path returns
--                                                          the span (#1842)

CREATE DATABASE IF NOT EXISTS e2e_test;

CREATE TABLE IF NOT EXISTS e2e_test.trace_ts_spans
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

CREATE TABLE IF NOT EXISTS e2e_test.trace_ts_spans_trace_id_ts
(
    TraceId String,
    Start   DateTime64(9),
    End     DateTime64(9)
)
ENGINE = MergeTree
ORDER BY (TraceId, Start);

INSERT INTO e2e_test.trace_ts_spans
    (Timestamp, TraceId, SpanId, ParentSpanId, ServiceName, SpanName, Duration) VALUES
    ('2024-03-15 10:00:00', 'e2e-ts-trace-a', 'ts-span-1', '',           'api',    'HTTP GET /',        10000000),
    ('2024-03-15 10:00:01', 'e2e-ts-trace-a', 'ts-span-2', 'ts-span-1',  'api',    'db.query users',     5000000),
    ('2024-03-15 10:00:02', 'e2e-ts-trace-a', 'ts-span-3', 'ts-span-1',  'api',    'cache.get profile',  2000000),
    ('2024-03-15 10:00:03', 'e2e-ts-trace-a', 'ts-span-4', 'ts-span-2',  'db',     'SELECT users',       4000000),
    ('2024-03-15 10:00:04', 'e2e-ts-trace-a', 'ts-span-5', 'ts-span-3',  'cache',  'GET profile:42',     1000000),
    ('2024-03-15 10:01:00', 'e2e-ts-trace-b', 'ts-span-9', '',           'worker', 'job.run',            8000000);

-- Companion entry only for trace-a. trace-b is intentionally absent to
-- reproduce the #1842 scenario: new or unindexed traces have no companion row,
-- so the optimised SQL's min(Start)/max(End) subqueries return NULL, the
-- Timestamp bounds become NULL, and the WHERE trims every row.
INSERT INTO e2e_test.trace_ts_spans_trace_id_ts
    (TraceId, Start, End) VALUES
    ('e2e-ts-trace-a', '2024-03-15 10:00:00', '2024-03-15 10:00:04.999999999');
