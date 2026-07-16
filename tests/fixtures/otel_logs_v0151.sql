-- Regression fixture for #1882: opentelemetry-collector-contrib clickhouseexporter
-- v0.151.0 rewrote the otel_logs schema and removed the `TimestampTime` column
-- (see https://github.com/open-telemetry/opentelemetry-collector-contrib/pull/47720).
-- This fixture creates a small otel_logs-shaped table matching the v0.151.0 schema
-- so the e2e test (tests/e2e/otelLogsV151.spec.ts) can confirm the plugin emits
-- SQL that runs against it (no `TimestampTime` reference) and returns rows.

CREATE DATABASE IF NOT EXISTS e2e_test;

CREATE TABLE IF NOT EXISTS e2e_test.otel_logs_v151
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

INSERT INTO e2e_test.otel_logs_v151
    (Timestamp, TraceId, SpanId, TraceFlags, SeverityText, SeverityNumber, ServiceName, Body, ResourceSchemaUrl, ResourceAttributes, ScopeSchemaUrl, ScopeName, ScopeVersion, ScopeAttributes, LogAttributes, EventName) VALUES
    ('2024-03-15 10:00:00.000', 'e2e-v151-trace-1', 'span-1', 1, 'INFO',  9,  'api',    'request received',         '', map(), '', '', '', map(), map(), ''),
    ('2024-03-15 10:00:01.000', 'e2e-v151-trace-1', 'span-2', 1, 'WARN',  13, 'api',    'slow downstream call',     '', map(), '', '', '', map(), map(), ''),
    ('2024-03-15 10:00:02.000', 'e2e-v151-trace-1', 'span-3', 1, 'ERROR', 17, 'api',    'downstream timeout',       '', map(), '', '', '', map(), map(), ''),
    ('2024-03-15 10:01:00.000', 'e2e-v151-trace-2', 'span-4', 1, 'INFO',  9,  'worker', 'job started',              '', map(), '', '', '', map(), map(), ''),
    ('2024-03-15 10:01:30.000', 'e2e-v151-trace-2', 'span-5', 1, 'INFO',  9,  'worker', 'job complete',             '', map(), '', '', '', map(), map(), '');
