-- Fixture for #2103: an otel_logs table that keeps TimestampTime but partitions and sorts on Timestamp,
-- plus a Distributed table over it. tests/e2e/otelLogsTimestampKeys.spec.ts reads both.

CREATE DATABASE IF NOT EXISTS e2e_test;

CREATE TABLE IF NOT EXISTS e2e_test.otel_logs_2103_local
(
    Timestamp           DateTime64(9),
    TimestampTime       DateTime DEFAULT toDateTime(Timestamp),
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
    LogAttributes       Map(LowCardinality(String), String)
)
ENGINE = MergeTree
PARTITION BY toDate(Timestamp)
ORDER BY (toStartOfFiveMinutes(Timestamp), ServiceName, Timestamp);

CREATE TABLE IF NOT EXISTS e2e_test.otel_logs_2103 AS e2e_test.otel_logs_2103_local
ENGINE = Distributed('default', 'e2e_test', 'otel_logs_2103_local', rand());

INSERT INTO e2e_test.otel_logs_2103_local
    (Timestamp, TraceId, SpanId, TraceFlags, SeverityText, SeverityNumber, ServiceName, Body, ResourceSchemaUrl, ResourceAttributes, ScopeSchemaUrl, ScopeName, ScopeVersion, ScopeAttributes, LogAttributes) VALUES
    ('2024-03-15 10:00:00.000', 'e2e-2103-trace-1', 'span-1', 1, 'INFO',  9,  'api',    'request received',     '', map(), '', '', '', map(), map()),
    ('2024-03-15 10:00:01.000', 'e2e-2103-trace-1', 'span-2', 1, 'WARN',  13, 'api',    'slow downstream call', '', map(), '', '', '', map(), map()),
    ('2024-03-15 10:00:02.000', 'e2e-2103-trace-1', 'span-3', 1, 'ERROR', 17, 'api',    'downstream timeout',   '', map(), '', '', '', map(), map()),
    ('2024-03-15 10:01:00.000', 'e2e-2103-trace-2', 'span-4', 1, 'INFO',  9,  'worker', 'job started',          '', map(), '', '', '', map(), map()),
    ('2024-03-15 10:01:30.000', 'e2e-2103-trace-2', 'span-5', 1, 'INFO',  9,  'worker', 'job complete',         '', map(), '', '', '', map(), map());
