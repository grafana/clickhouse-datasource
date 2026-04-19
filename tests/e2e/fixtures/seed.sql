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

-- JSON-column fixture — used by jsonFilter.spec.ts to exercise the shape of SQL
-- our query builder generates for JSON sub-column filters (backtick-escaped
-- dot-notation paths, string coercion for IN / NOT IN / IS NULL operators).
-- The JSON type is stable from ClickHouse 25.3 onwards; `latest-alpine` is
-- expected. If the CI image predates that, flip the setting below to the
-- older experimental flag (`allow_experimental_json_type = 1`) or pin
-- CLICKHOUSE_VERSION in docker-compose.yaml.
SET enable_json_type = 1;

CREATE TABLE IF NOT EXISTS e2e_test.json_events
(
    timestamp  DateTime,
    message    String,
    attributes JSON
)
ENGINE = MergeTree
ORDER BY timestamp;

INSERT INTO e2e_test.json_events (timestamp, message, attributes) VALUES
    ('2024-03-15 10:00:00', 'login succeeded',   '{"user_id":"u-1","level":"info","http":{"status_code":"200"}}'),
    ('2024-03-15 10:01:00', 'request timed out', '{"user_id":"u-2","level":"error","http":{"status_code":"504"}}'),
    ('2024-03-15 10:02:00', 'bad request',       '{"user_id":"u-3","level":"warn","http":{"status_code":"400"}}'),
    ('2024-03-15 10:03:00', 'login succeeded',   '{"user_id":"u-4","level":"info","http":{"status_code":"200"}}');
