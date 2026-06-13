-- Trace-spans fixture using the standard OTel schema (Map-typed attributes).
--
-- The docker-compose e2e-data-loader service iterates every *.sql file under
-- /data in lexicographic order.
--
-- Schema mirrors the OTel ClickHouse exporter DDL for ClickHouse < 26 (or
-- when enable_json_type = 0): attribute columns are Map(String, String) and
-- Events/Links are Nested columns, matching the otel_traces table structure
-- produced by the ClickHouse OTel collector.
--
-- Five spans for 'e2e-trace-a' cover the regression case for #1541 (must
-- not be truncated at LIMIT 3). The 'e2e-trace-b' row is unrelated noise
-- so the WHERE TraceId = '…' filter is exercised.

CREATE DATABASE IF NOT EXISTS e2e_test;

DROP TABLE IF EXISTS e2e_test.trace_spans;

CREATE TABLE e2e_test.trace_spans
(
    Timestamp           DateTime64(9),
    TraceId             String,
    SpanId              String,
    ParentSpanId        String,
    TraceState          String,
    SpanName            LowCardinality(String),
    SpanKind            LowCardinality(String),
    ServiceName         LowCardinality(String),
    ResourceAttributes  Map(String, String),
    ScopeName           String,
    ScopeVersion        String,
    SpanAttributes      Map(String, String),
    Duration            Int64,
    StatusCode          LowCardinality(String),
    StatusMessage       String,
    Events Nested
    (
        Timestamp   DateTime64(9),
        Name        LowCardinality(String),
        Attributes  Map(String, String)
    ),
    Links Nested
    (
        TraceId     String,
        SpanId      String,
        TraceState  String,
        Attributes  Map(String, String)
    )
)
ENGINE = MergeTree
ORDER BY (TraceId, Timestamp);

INSERT INTO e2e_test.trace_spans
    (Timestamp, TraceId, SpanId, ParentSpanId, TraceState,
     SpanName, SpanKind, ServiceName,
     ResourceAttributes, ScopeName, ScopeVersion,
     SpanAttributes, Duration, StatusCode, StatusMessage)
VALUES
    ('2024-03-15 10:00:00', 'e2e-trace-a', 'span-1', '', '',
     'HTTP GET /', 'SPAN_KIND_SERVER', 'api',
     {'service.name': 'api', 'deployment.environment': 'test'}, 'io.opentelemetry.api', '1.0.0',
     {'http.method': 'GET', 'http.url': '/', 'http.status_code': '200'}, 10000000, 'STATUS_CODE_OK', ''),
    ('2024-03-15 10:00:01', 'e2e-trace-a', 'span-2', 'span-1', '',
     'db.query users', 'SPAN_KIND_CLIENT', 'api',
     {'service.name': 'api', 'deployment.environment': 'test'}, 'io.opentelemetry.api', '1.0.0',
     {'db.system': 'clickhouse', 'db.statement': 'SELECT * FROM users'}, 5000000, 'STATUS_CODE_OK', ''),
    ('2024-03-15 10:00:02', 'e2e-trace-a', 'span-3', 'span-1', '',
     'cache.get profile', 'SPAN_KIND_CLIENT', 'api',
     {'service.name': 'api', 'deployment.environment': 'test'}, 'io.opentelemetry.api', '1.0.0',
     {'cache.key': 'profile:42'}, 2000000, 'STATUS_CODE_OK', ''),
    ('2024-03-15 10:00:03', 'e2e-trace-a', 'span-4', 'span-2', '',
     'SELECT users', 'SPAN_KIND_SERVER', 'db',
     {'service.name': 'db', 'deployment.environment': 'test'}, 'io.opentelemetry.api', '1.0.0',
     {'db.system': 'clickhouse'}, 4000000, 'STATUS_CODE_OK', ''),
    ('2024-03-15 10:00:04', 'e2e-trace-a', 'span-5', 'span-3', '',
     'GET profile:42', 'SPAN_KIND_SERVER', 'cache',
     {'service.name': 'cache', 'deployment.environment': 'test'}, 'io.opentelemetry.api', '1.0.0',
     {'cache.key': 'profile:42'}, 1000000, 'STATUS_CODE_OK', ''),
    ('2024-03-15 10:00:10', 'e2e-trace-b', 'span-9', '', '',
     'job.run', 'SPAN_KIND_INTERNAL', 'worker',
     {'service.name': 'worker'}, 'io.opentelemetry.api', '1.0.0',
     {}, 8000000, 'STATUS_CODE_OK', '');

-- Companion timestamp-index table for the OTel trace-ID query optimisation.
DROP TABLE IF EXISTS e2e_test.trace_spans_trace_id_ts;

CREATE TABLE e2e_test.trace_spans_trace_id_ts
(
    TraceId String,
    Start   DateTime64(9),
    End     DateTime64(9)
)
ENGINE = MergeTree
ORDER BY (TraceId, toUnixTimestamp(Start));

INSERT INTO e2e_test.trace_spans_trace_id_ts
    SELECT TraceId, min(Timestamp) AS Start, max(Timestamp) AS End
    FROM e2e_test.trace_spans
    GROUP BY TraceId;
