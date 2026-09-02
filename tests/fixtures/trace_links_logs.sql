-- Fixture for the trace→logs "View logs" data link tests (tests/e2e/traceLogsLink.spec.ts).
--
-- An otel_logs-shaped table (clickhouseexporter v0.151.0 layout, no TimestampTime)
-- with log rows correlated to the trace_spans fixture's trace ids:
--
--   e2e-trace-a  3 rows INSIDE the fixture window (2 × ServiceName 'api', 1 × 'worker')
--   e2e-trace-a  1 row  OUTSIDE the window (2024-03-16) — excluded only when the
--                generated logs query carries the time-range bound (#2106)
--   e2e-trace-b  1 row  inside the window — excluded only by the TraceId filter
--
-- The distinct row counts let the spec distinguish failure modes:
--   3 rows = correct (time bound + TraceId filter, origin filters dropped)
--   4 rows = time bound missing (#2106 regression)
--   2 rows = origin's non-time filters incorrectly carried over

CREATE DATABASE IF NOT EXISTS e2e_test;

DROP TABLE IF EXISTS e2e_test.trace_links_logs;

CREATE TABLE e2e_test.trace_links_logs
(
    Timestamp           DateTime64(9),
    TraceId             String,
    SpanId              String,
    TraceFlags          UInt8,
    SeverityText        LowCardinality(String),
    SeverityNumber      UInt8,
    ServiceName         LowCardinality(String),
    Body                String,
    ResourceSchemaUrl   LowCardinality(String),
    ResourceAttributes  Map(LowCardinality(String), String),
    ScopeSchemaUrl      LowCardinality(String),
    ScopeName           String,
    ScopeVersion        LowCardinality(String),
    ScopeAttributes     Map(LowCardinality(String), String),
    LogAttributes       Map(LowCardinality(String), String),
    EventName           LowCardinality(String)
)
ENGINE = MergeTree
PARTITION BY toDate(Timestamp)
ORDER BY (toStartOfFiveMinutes(Timestamp), ServiceName, Timestamp);

INSERT INTO e2e_test.trace_links_logs
    (Timestamp, TraceId, SpanId, TraceFlags, SeverityText, SeverityNumber, ServiceName, Body, ResourceSchemaUrl, ResourceAttributes, ScopeSchemaUrl, ScopeName, ScopeVersion, ScopeAttributes, LogAttributes, EventName) VALUES
    ('2024-03-15 10:00:01.000', 'e2e-trace-a', 'span-log-1', 1, 'INFO',  9,  'api',    'request received',       '', map(), '', '', '', map(), map(), ''),
    ('2024-03-15 10:00:05.000', 'e2e-trace-a', 'span-log-2', 1, 'ERROR', 17, 'worker', 'downstream timeout',     '', map(), '', '', '', map(), map(), ''),
    ('2024-03-15 10:00:08.000', 'e2e-trace-a', 'span-log-3', 1, 'INFO',  9,  'api',    'request complete',       '', map(), '', '', '', map(), map(), ''),
    ('2024-03-16 10:00:00.000', 'e2e-trace-a', 'span-log-4', 1, 'INFO',  9,  'api',    'out-of-window row',      '', map(), '', '', '', map(), map(), ''),
    ('2024-03-15 10:00:03.000', 'e2e-trace-b', 'span-log-5', 1, 'INFO',  9,  'api',    'unrelated trace noise',  '', map(), '', '', '', map(), map(), '');
