-- Fixture for simpleAggregateFunction.spec.ts
-- Exercises SimpleAggregateFunction columns across all supported inner types:
-- String, Nullable(String), Float64, UInt64, Bool, DateTime64, Nullable(Float64).
-- Time range: 2024-03-15 10:00:00 – 2024-03-15 10:04:00 UTC.

CREATE DATABASE IF NOT EXISTS e2e_test;

CREATE TABLE IF NOT EXISTS e2e_test.simple_aggregate_events
(
    timestamp       DateTime,
    name            SimpleAggregateFunction(any, String),
    label           SimpleAggregateFunction(any, Nullable(String)),
    value           SimpleAggregateFunction(any, Float64),
    nullable_value  SimpleAggregateFunction(any, Nullable(Float64)),
    count           SimpleAggregateFunction(sum, UInt64),
    is_active       SimpleAggregateFunction(any, Bool),
    last_seen       SimpleAggregateFunction(max, DateTime64(3))
)
ENGINE = AggregatingMergeTree
ORDER BY timestamp;

INSERT INTO e2e_test.simple_aggregate_events (timestamp, name, label, value, nullable_value, count, is_active, last_seen) VALUES
    ('2024-03-15 10:00:00', 'alpha',   'first',  1.5,  1.5,  10, true,  '2024-03-15 10:00:00.000'),
    ('2024-03-15 10:01:00', 'beta',    NULL,     2.0,  NULL, 20, false, '2024-03-15 10:01:00.000'),
    ('2024-03-15 10:02:00', 'gamma',   'third',  3.5,  3.5,  30, true,  '2024-03-15 10:02:00.000'),
    ('2024-03-15 10:03:00', 'delta',   'fourth', 4.0,  NULL, 40, true,  '2024-03-15 10:03:00.000'),
    ('2024-03-15 10:04:00', 'epsilon', NULL,     5.5,  5.5,  50, false, '2024-03-15 10:04:00.000');
