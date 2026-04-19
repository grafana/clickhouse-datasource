-- E2E test fixture data for grafana-clickhouse-datasource.
-- Fully self-contained: no external URLs, no network dependencies.
-- Time range covered: 2024-03-15 10:00:00 – 2024-03-15 10:09:00 UTC.
-- Tests that query this data should use a window of at least
--   from: '2024-03-15T09:45:00.000Z'
--   to:   '2024-03-15T10:15:00.000Z'

CREATE DATABASE IF NOT EXISTS e2e_test;

CREATE TABLE IF NOT EXISTS e2e_test.events
(
    timestamp DateTime,
    level     LowCardinality(String),
    message   String,
    value     Float64,
    service   LowCardinality(String)
)
ENGINE = MergeTree
ORDER BY timestamp;

INSERT INTO e2e_test.events (timestamp, level, message, value, service) VALUES
    ('2024-03-15 10:00:00', 'info',  'Service started',           1.0,  'api'),
    ('2024-03-15 10:01:00', 'debug', 'Request received',          2.5,  'api'),
    ('2024-03-15 10:02:00', 'info',  'Request processed',         1.2,  'api'),
    ('2024-03-15 10:03:00', 'warn',  'High memory usage',        85.3,  'worker'),
    ('2024-03-15 10:04:00', 'error', 'Connection timeout',        0.0,  'worker'),
    ('2024-03-15 10:05:00', 'info',  'Recovery complete',         1.0,  'worker'),
    ('2024-03-15 10:06:00', 'debug', 'Cache hit',                 0.5,  'cache'),
    ('2024-03-15 10:07:00', 'info',  'Scheduled task started',    1.0,  'scheduler'),
    ('2024-03-15 10:08:00', 'info',  'Scheduled task completed',  1.0,  'scheduler'),
    ('2024-03-15 10:09:00', 'error', 'Database connection failed', 0.0, 'db');

-- Map-typed columns fixture for the adhoc-filter Map regression guards
-- (#1434). Mirrors the OTel-logs shape: a Map(String,String) attribute
-- column plus a wall-clock timestamp. The adhoc filter path must be able to
-- (a) discover the distinct map keys, (b) fetch distinct values per map
-- key without stringifying the Map, and (c) generate SQL that ClickHouse
-- accepts via `additional_table_filters`.
CREATE TABLE IF NOT EXISTS e2e_test.map_events
(
    timestamp   DateTime,
    service     LowCardinality(String),
    labels      Map(String, String)
)
ENGINE = MergeTree
ORDER BY timestamp;

INSERT INTO e2e_test.map_events (timestamp, service, labels) VALUES
    ('2024-03-15 10:00:00', 'api',       {'http.method': 'GET',  'http.status': '200', 'region': 'eu'}),
    ('2024-03-15 10:01:00', 'api',       {'http.method': 'POST', 'http.status': '201', 'region': 'eu'}),
    ('2024-03-15 10:02:00', 'api',       {'http.method': 'GET',  'http.status': '500', 'region': 'us'}),
    ('2024-03-15 10:03:00', 'worker',    {'job.name': 'indexer', 'job.status': 'ok',   'region': 'eu'}),
    ('2024-03-15 10:04:00', 'worker',    {'job.name': 'indexer', 'job.status': 'fail', 'region': 'us'}),
    ('2024-03-15 10:05:00', 'worker',    {'job.name': 'cleanup', 'job.status': 'ok',   'region': 'eu'});
