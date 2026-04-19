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
