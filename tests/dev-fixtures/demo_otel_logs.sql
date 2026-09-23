-- Demo data for manual testing of the logs experience, in its own `demo` database.
--
-- Deliberately NOT under tests/e2e/fixtures/: the compose loader globs that directory, so this
-- would insert a quarter of a million rows on every e2e run with no spec referencing it. Load it
-- by hand when you want a dense histogram to look at:
--
--   docker exec -i clickhouse-server clickhouse-client --multiquery < tests/dev-fixtures/demo_otel_logs.sql
--
-- The schema matches the opentelemetry-collector-contrib clickhouseexporter v0.151.0 layout,
-- which is what the plugin's `latest` OTel version expects (src/otel.ts). Turning on the OTel
-- toggle in the data source's Logs settings therefore configures every column automatically.
--
-- Rows are generated relative to load time, so the data always covers the last 24 hours, at
-- roughly 170 lines per minute — dense enough that minute-wide histogram buckets read as real
-- traffic rather than ones and twos. A burst of errors around four hours ago gives the
-- histogram a recognizable shape.

CREATE DATABASE IF NOT EXISTS demo;

DROP TABLE IF EXISTS demo.otel_logs;

CREATE TABLE demo.otel_logs
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
ORDER BY (ServiceName, Timestamp);

-- Baseline traffic: 240k lines scattered over the last 24 hours.
--
-- `VERBOSE` is deliberate. It matches none of the plugin's known levels, so it lands in the
-- `unknown` band — which is what keeps the stacked total equal to the number of log lines.
INSERT INTO demo.otel_logs
SELECT
    now() - toIntervalSecond(secs) - toIntervalMillisecond(ms)                AS Timestamp,
    lower(hex(MD5(toString(intDiv(number, 4)))))                             AS TraceId,
    lower(hex(substring(MD5(toString(number)), 1, 8)))                       AS SpanId,
    1                                                                        AS TraceFlags,
    multiIf(sev < 60, 'INFO', sev < 75, 'DEBUG', sev < 87, 'WARN', sev < 95, 'ERROR', sev < 98, 'TRACE', 'VERBOSE') AS SeverityText,
    multiIf(sev < 60, 9, sev < 75, 5, sev < 87, 13, sev < 95, 17, sev < 98, 1, 10)                                 AS SeverityNumber,
    ['checkout', 'payments', 'inventory'][(number % 3) + 1]                   AS ServiceName,
    concat(
        ['GET /cart', 'POST /checkout', 'GET /inventory', 'POST /refund'][route + 1],
        ' completed in ', toString(12 + (number % 380)), 'ms'
    )                                                                        AS Body,
    'https://opentelemetry.io/schemas/1.30.0'                                 AS ResourceSchemaUrl,
    map(
        'service.name', ['checkout', 'payments', 'inventory'][(number % 3) + 1],
        'deployment.environment', 'demo',
        'host.name', concat('node-', toString((number % 4) + 1))
    )                                                                        AS ResourceAttributes,
    ''                                                                       AS ScopeSchemaUrl,
    'demo.instrumentation'                                                   AS ScopeName,
    '1.0.0'                                                                  AS ScopeVersion,
    map()                                                                    AS ScopeAttributes,
    map(
        'http.request.method', ['GET', 'POST', 'GET', 'POST'][route + 1],
        'http.response.status_code', multiIf(sev < 87, '200', sev < 95, '500', '404'),
        'url.path', ['/cart', '/checkout', '/inventory', '/refund'][route + 1]
    )                                                                        AS LogAttributes,
    ''                                                                       AS EventName
FROM
(
    SELECT
        number,
        rand(number) % 86400        AS secs,
        rand(number + 1) % 1000     AS ms,
        rand(number + 2) % 100      AS sev,
        rand(number + 3) % 4        AS route
    FROM numbers(240000)
);

-- An error burst four hours ago, over a twenty minute window, so the histogram has a spike
-- worth looking at and the error band is visibly not flat.
INSERT INTO demo.otel_logs
SELECT
    now() - toIntervalMinute(240) + toIntervalSecond(secs)                    AS Timestamp,
    lower(hex(MD5(toString(number))))                                        AS TraceId,
    lower(hex(substring(MD5(toString(number + 7)), 1, 8)))                    AS SpanId,
    1                                                                        AS TraceFlags,
    multiIf(sev < 80, 'ERROR', sev < 95, 'WARN', 'INFO')                      AS SeverityText,
    multiIf(sev < 80, 17, sev < 95, 13, 9)                                    AS SeverityNumber,
    'payments'                                                               AS ServiceName,
    concat('POST /checkout failed: upstream timeout after ', toString(1000 + (number % 4000)), 'ms') AS Body,
    'https://opentelemetry.io/schemas/1.30.0'                                 AS ResourceSchemaUrl,
    map('service.name', 'payments', 'deployment.environment', 'demo', 'host.name', 'node-2') AS ResourceAttributes,
    ''                                                                       AS ScopeSchemaUrl,
    'demo.instrumentation'                                                   AS ScopeName,
    '1.0.0'                                                                  AS ScopeVersion,
    map()                                                                    AS ScopeAttributes,
    map('http.request.method', 'POST', 'http.response.status_code', '504', 'url.path', '/checkout') AS LogAttributes,
    ''                                                                       AS EventName
FROM
(
    SELECT number, rand(number) % 1200 AS secs, rand(number + 5) % 100 AS sev
    FROM numbers(12000)
);
