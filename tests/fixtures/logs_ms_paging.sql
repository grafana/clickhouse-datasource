-- Fixture for the millisecond log-time bound (e2e spec tests/e2e/logs/logsMillisecondPaging.spec.ts).
-- Eight rows share one second, so a page of 3 cannot be bounded by the seconds-precision macros alone.

CREATE DATABASE IF NOT EXISTS e2e_test;

DROP TABLE IF EXISTS e2e_test.logs_ms_paging;
CREATE TABLE e2e_test.logs_ms_paging
(
    Timestamp     DateTime64(9),
    TimestampTime DateTime DEFAULT toDateTime(Timestamp),
    Body          String
)
ENGINE = MergeTree
PARTITION BY toDate(Timestamp)
ORDER BY (TimestampTime, Timestamp);

INSERT INTO e2e_test.logs_ms_paging (Timestamp, Body) VALUES
    ('2024-03-15 10:00:00.100', 'row-1'),
    ('2024-03-15 10:00:00.200', 'row-2'),
    ('2024-03-15 10:00:00.300', 'row-3'),
    ('2024-03-15 10:00:00.400', 'row-4'),
    ('2024-03-15 10:00:00.500', 'row-5'),
    ('2024-03-15 10:00:00.600', 'row-6'),
    ('2024-03-15 10:00:00.700', 'row-7'),
    ('2024-03-15 10:00:00.800', 'row-8');
