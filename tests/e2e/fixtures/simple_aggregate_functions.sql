-- Fixture for simpleAggregateFunction.spec.ts
-- Exercises SimpleAggregateFunction(any, String) and
-- SimpleAggregateFunction(any, Nullable(String)) columns to verify the
-- datasource renders them correctly without toString() wrapping.
-- Time range: 2024-03-15 10:00:00 – 2024-03-15 10:04:00 UTC.

CREATE DATABASE IF NOT EXISTS e2e_test;

CREATE TABLE IF NOT EXISTS e2e_test.simple_aggregate_events
(
    timestamp DateTime,
    name      SimpleAggregateFunction(any, String),
    label     SimpleAggregateFunction(any, Nullable(String))
)
ENGINE = AggregatingMergeTree
ORDER BY timestamp;

INSERT INTO e2e_test.simple_aggregate_events (timestamp, name, label) VALUES
    ('2024-03-15 10:00:00', 'alpha',   'first'),
    ('2024-03-15 10:01:00', 'beta',    NULL),
    ('2024-03-15 10:02:00', 'gamma',   'third'),
    ('2024-03-15 10:03:00', 'delta',   'fourth'),
    ('2024-03-15 10:04:00', 'epsilon', NULL);
