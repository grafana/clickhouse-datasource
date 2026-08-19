import { expect, test } from '@grafana/plugin-e2e';
import { FIXTURE_FROM_ISO, FIXTURE_TO_ISO, skipFixtureTestsOnCloud } from '../helpers/env';
import { exploreUrl } from '../helpers/explore';
import { frames, frameValues } from '../helpers/queryResponse';
import { runSqlAndGetBody } from '../helpers/sqlEditor';

// ---------------------------------------------------------------------------
// Ad hoc regex-operator filter regression guards (#1443)
//
// Unit tests in src/data/adHocFilter.test.ts cover the JS-level mapping of
// Grafana's `=~` / `!~` operators to ClickHouse `REGEXP` / `NOT REGEXP`
// and the exact `additional_table_filters={...}` shape AdHocFilter.apply()
// produces. Those tests can't confirm that ClickHouse actually accepts
// `REGEXP` and `NOT REGEXP` as a filter operator — only E2E can.
//
// Each test below runs a plain `WHERE ... REGEXP ...` query against the
// fixture to verify ClickHouse accepts the operator. If a future refactor
// silently reintroduces ILIKE (which is a LIKE pattern, not a regex), the
// third test — which uses a regex-only pattern that matches nothing as a
// LIKE — will fail.
//
// We deliberately avoid typing the full `SETTINGS additional_table_filters={...}`
// shape through the Monaco editor because Monaco auto-closes `{`, which
// mangles that syntax on keystroke entry. The unit tests cover the exact
// shape; the E2E tests cover the operator semantics.
// ---------------------------------------------------------------------------

test.describe('Ad hoc regex operator filters', () => {
  test.beforeEach(() => {
    skipFixtureTestsOnCloud('seed.sql');
  });

  test.describe.configure({ mode: 'serial' });

  test('REGEXP returns matching rows', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    // The fixture has exactly two messages that start with "Request":
    // "Request received" and "Request processed".
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      "SELECT timestamp, message FROM e2e_test.events WHERE message REGEXP '^Request' ORDER BY timestamp"
    );

    expect(frames(body).length).toBeGreaterThan(0);
    const messages = frameValues(body)[1];
    expect(messages).toEqual(['Request received', 'Request processed']);
  });

  test('NOT REGEXP returns the complement', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    // 10 rows in the fixture, 2 start with "Request", so 8 remain.
    // Parenthesize the predicate so the `NOT` keyword is not immediately
    // followed by `REGEXP` — Monaco's SQL autocomplete tends to offer
    // keyword suggestions after `NOT ` and can swallow/mangle the next
    // token when typed via page.keyboard.type().
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      "SELECT timestamp, message FROM e2e_test.events WHERE NOT (message REGEXP '^Request') ORDER BY timestamp"
    );

    expect(frames(body).length).toBeGreaterThan(0);
    const messages = frameValues(body)[1] ?? [];
    expect(messages.length).toBe(8);
    // None of the remaining rows should start with "Request".
    expect(messages.every((m) => !String(m).startsWith('Request'))).toBe(true);
  });

  test('REGEXP treats the pattern as a regex, not a LIKE pattern', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    // This test exists specifically to guard against a regression back to
    // ILIKE. The pattern `^(info|warn)$` is a regex that matches "info" or
    // "warn" exactly. As an ILIKE pattern it would match nothing (the
    // characters `^`, `(`, `|`, `)`, `$` are not wildcards in LIKE, and
    // there is no level literally equal to `^(info|warn)$`). If this test
    // ever sees zero rows, ILIKE is back.
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      "SELECT level FROM e2e_test.events WHERE level REGEXP '^(info|warn)$' ORDER BY timestamp"
    );

    expect(frames(body).length).toBeGreaterThan(0);
    const levels = frameValues(body)[0] ?? [];
    // Fixture has 5 "info" rows and 1 "warn" row.
    expect(levels.length).toBe(6);
    expect(levels.every((l) => l === 'info' || l === 'warn')).toBe(true);
  });
});
