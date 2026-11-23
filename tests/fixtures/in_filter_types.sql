-- Fixture for filters/inFilterTypes.spec.ts (#2225).
-- One column for each type the query builder offers IN and NOT IN on, other
-- than String: Enum8, Nullable(Enum8), Enum16, UUID, IPv4, IPv6 and Bool.

CREATE DATABASE IF NOT EXISTS e2e_test;

DROP TABLE IF EXISTS e2e_test.in_filter_types;
-- Dropped and recreated on every load so re-running the e2e-data-loader
-- (e.g. docker compose up against an existing stack) cannot duplicate rows.
CREATE TABLE e2e_test.in_filter_types
(
    id                    UInt32,
    enum8_value           Enum8('x' = 1, 'y' = 2, 'z' = 3),
    nullable_enum8_value  Nullable(Enum8('x' = 1, 'y' = 2, 'z' = 3)),
    enum16_value          Enum16('x' = 1, 'y' = 2, 'z' = 3),
    uuid_value            UUID,
    ipv4_value            IPv4,
    ipv6_value            IPv6,
    bool_value            Bool
)
ENGINE = MergeTree
ORDER BY id;

INSERT INTO e2e_test.in_filter_types (id, enum8_value, nullable_enum8_value, enum16_value, uuid_value, ipv4_value, ipv6_value, bool_value) VALUES
    (1, 'x', 'x', 'x', '00000000-0000-0000-0000-000000000001', '10.0.0.1', '2001:db8::1', true),
    (2, 'y', 'y', 'y', '00000000-0000-0000-0000-000000000002', '10.0.0.2', '2001:db8::2', false),
    (3, 'z', 'z', 'z', '00000000-0000-0000-0000-000000000003', '10.0.0.3', '2001:db8::3', true);
