import { expect, test } from '@grafana/plugin-e2e';

import { FIXTURE_FROM_ISO, FIXTURE_TO_ISO, skipFixtureTestsOnCloud } from '../helpers/env';
import { exploreUrl } from '../helpers/explore';
import { frameValues, rowCount } from '../helpers/queryResponse';
import { runSqlAndGetBody } from '../helpers/sqlEditor';

// Backend macro execution against a live ClickHouse (e2e_test.macro_events).
//
// Unit tests in pkg/macros/macros_test.go assert the SQL strings the macro
// engine emits (moved to grafana/macropro in #1802, escape handling fixed in
// #1991). They cannot prove that Grafana wires the real Explore time range
// and calculated interval into the query context, nor that ClickHouse parses
// and executes the expanded SQL. Each test here runs a macro through the full
// Explore round trip and asserts exact row counts and values against the
// seeded fixture (tests/e2e/fixtures/macro_events.sql: 12 rows spaced 30
// seconds apart from 2024-03-15 10:00:00 UTC, values counting up 1..12).

// Epoch milliseconds for the pinned fixture window bounds. $__fromTime and
// $__toTime expand to epoch-based DateTime scalars, which the data frame
// JSON encodes as millisecond epoch numbers.
const FIXTURE_FROM_MS = Date.parse(FIXTURE_FROM_ISO); // 1710495900000
const FIXTURE_TO_MS = Date.parse(FIXTURE_TO_ISO); // 1710497700000

// Narrowed range used to prove $__timeFilter expands the real Explore
// from/to rather than any fixed window: 10:00:00 .. 10:02:00 inclusive
// covers exactly the first five fixture rows (values 1..5).
const NARROW_FROM_ISO = '2024-03-15T10:00:00.000Z';
const NARROW_TO_ISO = '2024-03-15T10:02:00.000Z';

test.describe('Backend SQL macros', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => {
    skipFixtureTestsOnCloud('macro_events.sql');
  });

  test('$__timeFilter expands the real Explore from/to range', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    // The full fixture window covers all 12 seeded rows (10:00:00 to
    // 10:05:30, 30 seconds apart).
    const fullBody = await runSqlAndGetBody(
      page,
      explorePage,
      'SELECT timestamp, value FROM e2e_test.macro_events WHERE $__timeFilter(timestamp) ORDER BY timestamp'
    );
    expect(rowCount(fullBody)).toBe(12);

    // Re-run the same SQL with a narrowed Explore range. The macro is the
    // only time constraint in the query, so the drop from 12 rows to the 5
    // seeded at 10:00:00 .. 10:02:00 (inclusive bounds, values 1..5) proves
    // the real from/to reached the expansion.
    await page.goto(exploreUrl({ from: NARROW_FROM_ISO, to: NARROW_TO_ISO }));
    const narrowBody = await runSqlAndGetBody(
      page,
      explorePage,
      'SELECT timestamp, value FROM e2e_test.macro_events WHERE $__timeFilter(timestamp) ORDER BY timestamp'
    );
    expect(rowCount(narrowBody)).toBe(5);
    expect(frameValues(narrowBody)[1]).toEqual([1, 2, 3, 4, 5]);
  });

  test('$__timeFilter_ms millisecond variant matches the seconds variant', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    // Same 12 seeded rows as $__timeFilter: the millisecond-precision bounds
    // (fromUnixTimestamp64Milli) must not shift the inclusive window.
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      'SELECT timestamp, value FROM e2e_test.macro_events WHERE $__timeFilter_ms(timestamp) ORDER BY timestamp'
    );
    expect(rowCount(body)).toBe(12);
    expect(frameValues(body)[1]).toEqual([1, 2, 3, 4, 5, 6, 7.5, 8, 9, 10, 11, 12]);
  });

  test('$__dateFilter combined with $__timeFilter executes', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    // This WHERE clause is the shape $__dateTimeFilter(event_date, timestamp)
    // expands to: a coarse Date-column filter (for partition pruning) plus
    // the precise DateTime filter. All 12 rows sit on 2024-03-15 and the
    // pinned window stays within that date, so nothing may be excluded.
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      'SELECT timestamp, value FROM e2e_test.macro_events WHERE $__dateFilter(event_date) AND $__timeFilter(timestamp) ORDER BY timestamp'
    );
    expect(rowCount(body)).toBe(12);
  });

  test('$__fromTime and $__toTime return the pinned range bounds as scalars', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    // Seconds precision: toDateTime(<unix>) scalars must round-trip to the
    // exact pinned window bounds (both bounds are whole seconds).
    const secondsBody = await runSqlAndGetBody(
      page,
      explorePage,
      'SELECT $__fromTime AS from_time, $__toTime AS to_time'
    );
    expect(rowCount(secondsBody)).toBe(1);
    const secondsValues = frameValues(secondsBody);
    expect(secondsValues[0]).toEqual([FIXTURE_FROM_MS]);
    expect(secondsValues[1]).toEqual([FIXTURE_TO_MS]);

    // Millisecond variants expand to fromUnixTimestamp64Milli and must carry
    // the same instants.
    const msBody = await runSqlAndGetBody(
      page,
      explorePage,
      'SELECT $__fromTime_ms AS from_time, $__toTime_ms AS to_time'
    );
    expect(rowCount(msBody)).toBe(1);
    const msValues = frameValues(msBody);
    expect(msValues[0]).toEqual([FIXTURE_FROM_MS]);
    expect(msValues[1]).toEqual([FIXTURE_TO_MS]);
  });

  test('$__timeInterval buckets a GROUP BY without a zero interval (#534, #652)', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    // The interval Grafana calculates depends on the render width, so the
    // bucket count cannot be pinned. What is invariant: toStartOfInterval
    // with INTERVAL 0 is a ClickHouse error (the historic #534/#652 failure,
    // the handler now clamps to a 1 second minimum), every seeded row lands
    // in exactly one bucket, and GROUP BY produces no empty buckets. So the
    // query must succeed with 1..12 buckets whose counts sum to the 12 rows.
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      'SELECT $__timeInterval(timestamp) AS bucket, count(*) AS points FROM e2e_test.macro_events WHERE $__timeFilter(timestamp) GROUP BY bucket ORDER BY bucket'
    );
    const buckets = rowCount(body);
    expect(buckets).toBeGreaterThanOrEqual(1);
    expect(buckets).toBeLessThanOrEqual(12);
    const counts = frameValues(body)[1] ?? [];
    const total = counts.reduce<number>((sum, count) => sum + Number(count), 0);
    expect(total).toBe(12);
  });

  test('$__interval_s expands to a positive integer usable in arithmetic', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    // $__interval_s is a bare numeric literal (clamped to a 1 second
    // minimum), so it must survive arithmetic in the select list.
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      'SELECT $__interval_s AS interval_s, $__interval_s * 2 AS doubled'
    );
    expect(rowCount(body)).toBe(1);
    const values = frameValues(body);
    const intervalSeconds = Number(values[0]?.[0]);
    expect(Number.isInteger(intervalSeconds)).toBe(true);
    expect(intervalSeconds).toBeGreaterThanOrEqual(1);
    expect(Number(values[1]?.[0])).toBe(intervalSeconds * 2);
  });

  test('backslash-escaped quote before a macro still expands (#1991)', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    // The seeded label "O'Brien -- ops" reproduces the #1991 corruption
    // shape: a C-style backslash-escaped quote (\') with a line-comment
    // token after it inside one literal. Before the fix, the engine mis-read
    // \' as the closing quote, treated everything after -- as a comment and
    // silently dropped the trailing $__timeFilter, emitting invalid SQL.
    // Post-fix the macro must expand and the query return exactly the one
    // seeded O'Brien row (value 7.5 at 10:03:00).
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      "SELECT label, value FROM e2e_test.macro_events WHERE label = 'O\\'Brien -- ops' AND $__timeFilter(timestamp)"
    );
    expect(rowCount(body)).toBe(1);
    const values = frameValues(body);
    expect(values[0]).toEqual(["O'Brien -- ops"]);
    expect(values[1]).toEqual([7.5]);
  });
});
