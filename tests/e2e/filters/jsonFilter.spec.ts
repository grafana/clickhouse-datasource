import { expect, test } from '@grafana/plugin-e2e';
import { FIXTURE_FROM_ISO, FIXTURE_TO_ISO, skipFixtureTestsOnCloud } from '../helpers/env';
import { exploreUrl } from '../helpers/explore';
import { frames, rowCount } from '../helpers/queryResponse';
import { runSqlAndGetBody } from '../helpers/sqlEditor';

// ---------------------------------------------------------------------------
// JSON filter regression guards
//
// Unit tests in src/data/sqlGenerator.test.ts already cover the string shape
// our builder emits for JSON sub-column filters (backtick-escaped dot paths,
// string coercion for IN / NOT IN / IS NULL operators). Those tests can't
// confirm that ClickHouse actually accepts those strings though — only
// E2E can.
//
// Each test below runs the exact SQL shape our getFilters() output produces
// for a given filter operator, against the e2e_test.json_events fixture. If
// a future refactor breaks the output shape in a way ClickHouse rejects, one
// of these tests will fail loudly.
// ---------------------------------------------------------------------------

test.describe('JSON column filters', () => {
  test.beforeEach(() => {
    skipFixtureTestsOnCloud('seed.sql');
  });

  test.describe.configure({ mode: 'serial' });

  test('equals filter on JSON path returns matching rows', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    // Exact shape of sqlGenerator output for: attributes filter, mapKey "level",
    // operator Equals, value "info". See sqlGenerator.test.ts "JSON filters" suite.
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      "SELECT timestamp, message FROM e2e_test.json_events WHERE ( attributes.`level`::Nullable(String) = 'info' ) ORDER BY timestamp"
    );

    expect(frames(body).length).toBeGreaterThan(0);
    // Fixture has two 'info' rows
    expect(rowCount(body)).toBe(2);
  });

  test('IN filter on JSON path returns matching rows', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    // Exact shape of sqlGenerator output for: attributes filter, mapKey "level",
    // operator In, value ["error", "warn"].
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      "SELECT timestamp, message FROM e2e_test.json_events WHERE ( attributes.`level`::Nullable(String) IN ('error', 'warn') ) ORDER BY timestamp"
    );

    expect(frames(body).length).toBeGreaterThan(0);
    // Fixture has one 'error' + one 'warn' row
    expect(rowCount(body)).toBe(2);
  });

  test('nested JSON path filter returns matching rows', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    // Exact shape for: attributes filter, mapKey "http.status_code", operator Equals.
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      "SELECT timestamp, message FROM e2e_test.json_events WHERE ( attributes.`http`.`status_code`::Nullable(String) = '200' ) ORDER BY timestamp"
    );

    expect(frames(body).length).toBeGreaterThan(0);
    // Fixture has two status_code=200 rows
    expect(rowCount(body)).toBe(2);
  });

  test('LIKE filter on JSON path returns matching rows', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    // Exact shape for: attributes filter, mapKey "user_id", operator Like, value "u-".
    // getFilters() wraps the user-entered value with '%...%'.
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      "SELECT timestamp, message FROM e2e_test.json_events WHERE ( attributes.`user_id`::Nullable(String) LIKE '%u-%' ) ORDER BY timestamp"
    );

    expect(frames(body).length).toBeGreaterThan(0);
    // Fixture has four rows, all with user_id matching '%u-%'
    expect(rowCount(body)).toBe(4);
  });
});
