-- Map-typed columns fixture for the adhoc-filter Map regression guards
-- (#1434). Mirrors the OTel-logs shape: a Map(String,String) attribute
-- column plus a wall-clock timestamp. The adhoc filter path must be able to
-- (a) discover the distinct map keys, (b) fetch distinct values per map
-- key without stringifying the Map, and (c) generate SQL that ClickHouse
-- accepts via `additional_table_filters`.
--
-- Self-contained (re-declares the database) so ordering with seed.sql does
-- not matter. The docker-compose e2e-data-loader service iterates every
-- *.sql file in lexicographic order.

CREATE DATABASE IF NOT EXISTS e2e_test;

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
