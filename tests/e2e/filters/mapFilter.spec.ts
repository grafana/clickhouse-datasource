import { expect, test } from '@grafana/plugin-e2e';
import { FIXTURE_FROM_ISO, FIXTURE_TO_ISO, skipFixtureTestsOnCloud } from '../helpers/env';
import { exploreUrl } from '../helpers/explore';
import { frames, frameValues, rowCount } from '../helpers/queryResponse';
import { runSqlAndGetBody } from '../helpers/sqlEditor';

// ---------------------------------------------------------------------------
// Map-typed ad hoc filter regression guards (#1434)
//
// Unit tests in src/data/adHocFilter.test.ts cover the SQL shape escapeKey()
// emits when a dotted key references a Map column. Unit tests in
// src/data/CHDatasource.test.ts cover the getTagKeys() Map-expansion and
// fetchTagValuesFromSchema() rewrite path. Those tests can't confirm that
// ClickHouse actually accepts the resulting SQL strings — only E2E can.
//
// Each test below runs the exact SQL shape our ad hoc code paths produce, in
// the Explore SQL editor against the e2e_test.map_events fixture. If a
// future refactor changes the output in a way ClickHouse rejects, one of
// these tests will fail loudly.
// ---------------------------------------------------------------------------

test.describe('Map column ad hoc filters', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => {
    skipFixtureTestsOnCloud('map_events.sql');
  });

  test('mapKeys() discovery query returns distinct keys', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    // This is exactly the shape fetchUniqueMapKeys() emits, which
    // getTagKeys() invokes when it sees a Map-typed column. We assert that
    // the fixture has the expected distinct keys so that any future change
    // to the discovery query (e.g. sampling via a subquery) keeps surfacing
    // all map keys present in a small table.
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      'SELECT DISTINCT arrayJoin(mapKeys(labels)) AS keys FROM e2e_test.map_events ORDER BY keys'
    );

    expect(frames(body).length).toBeGreaterThan(0);
    // Fixture defines 6 distinct map keys: http.method, http.status, region,
    // job.name, job.status, region (region is shared). Total distinct = 5.
    const values = frameValues(body)[0];
    expect(values).toEqual(['http.method', 'http.status', 'job.name', 'job.status', 'region']);
  });

  test('bracket-access values query returns distinct map values', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    // Shape emitted by fetchTagValuesFromSchema() after rewriting a dotted
    // key like `map_events.labels.http.method` into bracket access. The
    // previous implementation emitted `SELECT DISTINCT labels FROM …`
    // which ClickHouse returned as whole Map values — those were rendered
    // as `[object Object]` on the frontend.
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      "SELECT DISTINCT labels['http.method'] AS v FROM e2e_test.map_events WHERE labels['http.method'] != '' ORDER BY v"
    );

    expect(frames(body).length).toBeGreaterThan(0);
    expect(frameValues(body)[0]).toEqual(['GET', 'POST']);
  });

  test('bracket-access Map key filter returns matching rows', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    // Bracket-access shape produced by escapeKey when rewriting a dotted
    // key like `map_events.labels.http.method` on the ad hoc filter path.
    // Unit tests in src/data/adHocFilter.test.ts cover the full
    // `additional_table_filters={...}` wrapper shape; we avoid typing that
    // through Monaco because `{` auto-closes and mangles the SQL. This
    // test covers the half unit tests can't: that ClickHouse actually
    // executes the `labels['key'] = 'value'` predicate end-to-end.
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      "SELECT timestamp, labels['http.status'] AS status FROM e2e_test.map_events WHERE labels['http.method'] = 'GET' ORDER BY timestamp"
    );

    expect(frames(body).length).toBeGreaterThan(0);
    // Fixture has exactly two GET rows.
    expect(rowCount(body)).toBe(2);
  });

  test('selecting the whole Map column still works (no regression)', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    // Sanity: the previous behavior of `SELECT DISTINCT labels FROM …`
    // is still legal ClickHouse. We don't rely on it any more for ad hoc
    // filters, but it must not regress for users who hand-write SQL.
    const body = await runSqlAndGetBody(
      page,
      explorePage,
      'SELECT DISTINCT labels FROM e2e_test.map_events ORDER BY toString(labels)'
    );

    expect(frames(body).length).toBeGreaterThan(0);
    // 6 rows inserted, each with a distinct Map value.
    expect(rowCount(body)).toBe(6);
  });
});
