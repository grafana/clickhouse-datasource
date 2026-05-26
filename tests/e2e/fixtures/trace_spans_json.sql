-- JSON-attribute trace fixture for the tagsColumnIsJSON feature.
--
-- Schema mirrors the ClickHouse OTel exporter output for ClickHouse 26+:
-- all attribute columns (SpanAttributes, ResourceAttributes, Events.Attributes,
-- Links.Attributes) use the native JSON type, matching the real otel_traces DDL
-- produced by the ClickHouse OTel collector when enable_json_type = 1.
--
-- Three spans for trace 'e2e-json-trace-a' let the E2E tests assert that:
--   1. Selecting SpanAttributes / ResourceAttributes directly (no mapKeys)
--      succeeds without "Function mapKeys requires Map type" error.
--   2. The response frames carry the correct row count.
--   3. The tags / serviceTags values in the response are non-null JSON objects.
--
-- Loaded by the docker-compose e2e-data-loader service in lexicographic order
-- after seed.sql and trace_spans.sql; the 't' prefix ensures correct ordering.

CREATE DATABASE IF NOT EXISTS e2e_test;

SET enable_json_type = 1;

DROP TABLE IF EXISTS e2e_test.trace_spans_json;

CREATE TABLE e2e_test.trace_spans_json
(
    Timestamp           DateTime64(9),
    TraceId             String,
    SpanId              String,
    ParentSpanId        String,
    TraceState          String,
    SpanName            LowCardinality(String),
    SpanKind            LowCardinality(String),
    ServiceName         LowCardinality(String),
    ResourceAttributes  JSON,
    ScopeName           String,
    ScopeVersion        String,
    SpanAttributes      JSON,
    Duration            Int64,
    StatusCode          LowCardinality(String),
    StatusMessage       String,
    Events Nested
    (
        Timestamp   DateTime64(9),
        Name        LowCardinality(String),
        Attributes  JSON
    ),
    Links Nested
    (
        TraceId     String,
        SpanId      String,
        TraceState  String,
        Attributes  JSON
    )
)
ENGINE = MergeTree
ORDER BY (TraceId, Timestamp);

-- jspan-1: root span with one log event
INSERT INTO e2e_test.trace_spans_json
    (Timestamp, TraceId, SpanId, ParentSpanId, TraceState,
     SpanName, SpanKind, ServiceName,
     ResourceAttributes, ScopeName, ScopeVersion,
     SpanAttributes, Duration, StatusCode, StatusMessage,
     `Events.Timestamp`, `Events.Name`, `Events.Attributes`)
VALUES
    ('2024-03-15 10:00:00', 'e2e-json-trace-a', 'jspan-1', '', '',
     'HTTP GET /users', 'SPAN_KIND_SERVER', 'api',
     '{"service.name":"api","deployment.environment":"test"}',
     'io.opentelemetry.api', '1.0.0',
     '{"http.method":"GET","http.url":"/users","http.status_code":"200"}',
     1000000, 'STATUS_CODE_OK', '',
     ['2024-03-15 10:00:00.500000000'],
     ['log'],
     ['{"level":"info","message":"handling request"}']);

-- jspan-2: child db span with an exception event
INSERT INTO e2e_test.trace_spans_json
    (Timestamp, TraceId, SpanId, ParentSpanId, TraceState,
     SpanName, SpanKind, ServiceName,
     ResourceAttributes, ScopeName, ScopeVersion,
     SpanAttributes, Duration, StatusCode, StatusMessage,
     `Events.Timestamp`, `Events.Name`, `Events.Attributes`)
VALUES
    ('2024-03-15 10:00:01', 'e2e-json-trace-a', 'jspan-2', 'jspan-1', '',
     'db.query', 'SPAN_KIND_CLIENT', 'db',
     '{"service.name":"db","deployment.environment":"test"}',
     'io.opentelemetry.api', '1.0.0',
     '{"db.system":"clickhouse","db.statement":"SELECT * FROM users"}',
     500000, 'STATUS_CODE_OK', '',
     ['2024-03-15 10:00:01.250000000', '2024-03-15 10:00:01.490000000'],
     ['db.query.start', 'db.query.end'],
     ['{"db.rows_examined":"42"}', '{"db.rows_returned":"10"}']);

-- jspan-3: child cache span with no events
INSERT INTO e2e_test.trace_spans_json
    (Timestamp, TraceId, SpanId, ParentSpanId, TraceState,
     SpanName, SpanKind, ServiceName,
     ResourceAttributes, ScopeName, ScopeVersion,
     SpanAttributes, Duration, StatusCode, StatusMessage)
VALUES
    ('2024-03-15 10:00:02', 'e2e-json-trace-a', 'jspan-3', 'jspan-1', '',
     'cache.get', 'SPAN_KIND_CLIENT', 'cache',
     '{"service.name":"cache"}',
     'io.opentelemetry.api', '1.0.0',
     '{"cache.key":"profile:42"}',
     300000, 'STATUS_CODE_OK', '');

-- Companion timestamp-index table for the OTel trace-ID query optimisation.
-- When OTel mode is enabled, hasTraceTimestampTable is true and the plugin
-- generates a WITH clause that queries <table>_trace_id_ts for min/max timestamps.
DROP TABLE IF EXISTS e2e_test.trace_spans_json_trace_id_ts;

CREATE TABLE e2e_test.trace_spans_json_trace_id_ts
(
    TraceId String,
    Start   DateTime64(9),
    End     DateTime64(9)
)
ENGINE = MergeTree
ORDER BY (TraceId, toUnixTimestamp(Start));

INSERT INTO e2e_test.trace_spans_json_trace_id_ts
    SELECT TraceId, min(Timestamp) AS Start, max(Timestamp) AS End
    FROM e2e_test.trace_spans_json
    GROUP BY TraceId;
