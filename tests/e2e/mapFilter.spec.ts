import { expect, test, ExplorePage } from '@grafana/plugin-e2e';
import { Locator, Page } from '@playwright/test';

// Matches the uid set in provisioning/datasources/clickhouse.yml
const DATASOURCE_UID = 'clickhouse-e2e';
const PLUGIN_TYPE = 'grafana-clickhouse-datasource';

// Time range that fully covers the seed fixture data in tests/e2e/fixtures/seed.sql
const FIXTURE_FROM_ISO = '2024-03-15T09:45:00.000Z';
const FIXTURE_TO_ISO = '2024-03-15T10:15:00.000Z';

function queryEditorRow(page: Page): Locator {
  return page.locator('[data-testid="data-testid Query editor row"], [aria-label="Query editor row"]');
}

function exploreUrl(from = FIXTURE_FROM_ISO, to = FIXTURE_TO_ISO): string {
  const query = {
    refId: 'A',
    datasource: { type: PLUGIN_TYPE, uid: DATASOURCE_UID },
    editorType: 'sql',
    pluginVersion: '',
    rawSql: '',
  };
  const panes = JSON.stringify({
    explore: {
      datasource: DATASOURCE_UID,
      queries: [query],
      range: { from, to },
    },
  });
  return `/explore?orgId=1&schemaVersion=1&panes=${encodeURIComponent(panes)}`;
}

async function enterSql(page: Page, sql: string) {
  const editor = page.getByRole('code');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(sql);
}

async function waitForQueryDataResponseWithBody(explorePage: ExplorePage) {
  let body: Record<string, unknown> | null = null;
  const responsePromise = explorePage.waitForQueryDataResponse(async (r) => {
    if (!r.ok()) {
      return false;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = await r.json().catch(() => null);
    if (!Array.isArray(b?.results?.A?.frames)) {
      return false;
    }
    body = b as Record<string, unknown>;
    return true;
  });
  return { responsePromise, getBody: () => body };
}

// ---------------------------------------------------------------------------
// Map-typed adhoc filter regression guards (#1434)
//
// Unit tests in src/data/adHocFilter.test.ts cover the SQL shape escapeKey()
// emits when a dotted key references a Map column. Unit tests in
// src/data/CHDatasource.test.ts cover the getTagKeys() Map-expansion and
// fetchTagValuesFromSchema() rewrite path. Those tests can't confirm that
// ClickHouse actually accepts the resulting SQL strings — only E2E can.
//
// Each test below runs the exact SQL shape our adhoc code paths produce, in
// the Explore SQL editor against the e2e_test.map_events fixture. If a
// future refactor changes the output in a way ClickHouse rejects, one of
// these tests will fail loudly.
// ---------------------------------------------------------------------------

test.describe('Map column adhoc filters', () => {
  test.describe.configure({ mode: 'serial' });

  test('mapKeys() discovery query returns distinct keys', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    // This is exactly the shape fetchUniqueMapKeys() emits, which
    // getTagKeys() invokes when it sees a Map-typed column. We assert that
    // the fixture has the expected distinct keys so that any future change
    // to the discovery query (e.g. sampling via a subquery) keeps surfacing
    // all map keys present in a small table.
    await enterSql(page, 'SELECT DISTINCT arrayJoin(labels.keys) AS keys FROM e2e_test.map_events ORDER BY keys');

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await queryEditorRow(page).getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = (getBody() as any)?.results?.A?.frames;
    expect(frames?.length).toBeGreaterThan(0);
    // Fixture defines 6 distinct map keys: http.method, http.status, region,
    // job.name, job.status, region (region is shared). Total distinct = 5.
    const values = frames[0]?.data?.values?.[0];
    expect(values).toEqual(['http.method', 'http.status', 'job.name', 'job.status', 'region']);
  });

  test('bracket-access values query returns distinct map values', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    // Shape emitted by fetchTagValuesFromSchema() after rewriting a dotted
    // key like `map_events.labels.http.method` into bracket access. The
    // previous implementation emitted `SELECT DISTINCT labels FROM …`
    // which ClickHouse returned as whole Map values — those were rendered
    // as `[object Object]` on the frontend.
    await enterSql(
      page,
      "SELECT DISTINCT labels['http.method'] AS v FROM e2e_test.map_events WHERE labels['http.method'] != '' ORDER BY v"
    );

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await queryEditorRow(page).getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = (getBody() as any)?.results?.A?.frames;
    expect(frames?.length).toBeGreaterThan(0);
    expect(frames[0]?.data?.values?.[0]).toEqual(['GET', 'POST']);
  });

  test('adhoc filter SQL using additional_table_filters and bracket-access Map key', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    // Shape produced by AdHocFilter.apply() when escapeKey rewrites
    // `map_events.labels.http.method` into bracket form. Must survive the
    // full `additional_table_filters` round-trip — that is the actual
    // runtime path used when a dashboard has an adhoc variable.
    await enterSql(
      page,
      "SELECT timestamp, labels['http.status'] AS status FROM e2e_test.map_events ORDER BY timestamp SETTINGS additional_table_filters={'map_events' : ' labels[\\'http.method\\'] = \\'GET\\' '}"
    );

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await queryEditorRow(page).getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = (getBody() as any)?.results?.A?.frames;
    expect(frames?.length).toBeGreaterThan(0);
    // Fixture has exactly two GET rows.
    expect(frames[0]?.data?.values?.[0]?.length).toBe(2);
  });

  test('selecting the whole Map column still works (no regression)', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    // Sanity: the previous behavior of `SELECT DISTINCT labels FROM …`
    // is still legal ClickHouse. We don't rely on it any more for adhoc
    // filters, but it must not regress for users who hand-write SQL.
    await enterSql(page, 'SELECT DISTINCT labels FROM e2e_test.map_events ORDER BY toString(labels)');

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await queryEditorRow(page).getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = (getBody() as any)?.results?.A?.frames;
    expect(frames?.length).toBeGreaterThan(0);
    // 6 rows inserted, each with a distinct Map value.
    expect(frames[0]?.data?.values?.[0]?.length).toBe(6);
  });
});
