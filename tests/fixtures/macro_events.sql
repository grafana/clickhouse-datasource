-- Macro-execution fixture for tests/e2e/macros/macros.spec.ts.
--
-- The docker-compose e2e-data-loader service iterates every *.sql file under
-- /data in lexicographic order. Each file is self-contained and reseed-safe:
-- DROP TABLE IF EXISTS first, then CREATE, so a rerun always starts clean.
--
-- Twelve rows spaced 30 seconds apart, 2024-03-15 10:00:00 to 10:05:30 UTC,
-- all inside the shared fixture window (specs pin Explore to
-- 2024-03-15T09:45:00.000Z .. 2024-03-15T10:15:00.000Z). The values count up
-- 1..12 in timestamp order so specs can assert exactly which rows a macro's
-- time filter admitted. The narrowed-range test pins 10:00:00 .. 10:02:00
-- inclusive and expects the first five rows (values 1..5).
--
-- Row 7 (10:03:00, value 7.5) carries the label "O'Brien -- ops": a single
-- quote followed by a line-comment token inside one literal, the exact shape
-- from #1991 where the macro engine mis-read a C-style backslash-escaped
-- quote (\') as the closing quote, treated the text after -- as a comment,
-- and silently dropped any macro that followed. It is seeded here with the
-- doubled-quote escape ('O''Brien -- ops'); the spec queries it back using
-- the backslash escape ('O\'Brien -- ops').

CREATE DATABASE IF NOT EXISTS e2e_test;

DROP TABLE IF EXISTS e2e_test.macro_events;

CREATE TABLE e2e_test.macro_events
(
    timestamp  DateTime64(3),
    event_date Date,
    value      Float64,
    label      String
)
ENGINE = MergeTree
ORDER BY timestamp;

INSERT INTO e2e_test.macro_events (timestamp, event_date, value, label) VALUES
    ('2024-03-15 10:00:00', '2024-03-15', 1,   'alpha'),
    ('2024-03-15 10:00:30', '2024-03-15', 2,   'beta'),
    ('2024-03-15 10:01:00', '2024-03-15', 3,   'gamma'),
    ('2024-03-15 10:01:30', '2024-03-15', 4,   'alpha'),
    ('2024-03-15 10:02:00', '2024-03-15', 5,   'beta'),
    ('2024-03-15 10:02:30', '2024-03-15', 6,   'gamma'),
    ('2024-03-15 10:03:00', '2024-03-15', 7.5, 'O''Brien -- ops'),
    ('2024-03-15 10:03:30', '2024-03-15', 8,   'alpha'),
    ('2024-03-15 10:04:00', '2024-03-15', 9,   'beta'),
    ('2024-03-15 10:04:30', '2024-03-15', 10,  'gamma'),
    ('2024-03-15 10:05:00', '2024-03-15', 11,  'alpha'),
    ('2024-03-15 10:05:30', '2024-03-15', 12,  'beta');
