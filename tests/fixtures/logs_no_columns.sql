-- Fixture for the no-log-columns notice (e2e spec tests/e2e/editor/compactMode.spec.ts).
-- No column name matches a logs role (time, message, level), so a logs builder query
-- built on this table resolves no columns.

CREATE DATABASE IF NOT EXISTS e2e_test;

DROP TABLE IF EXISTS e2e_test.logs_no_columns;
CREATE TABLE e2e_test.logs_no_columns
(
    remote_addr String,
    status      UInt16
)
ENGINE = MergeTree
ORDER BY status;

INSERT INTO e2e_test.logs_no_columns (remote_addr, status) VALUES
    ('10.0.0.1', 200),
    ('10.0.0.2', 404);
