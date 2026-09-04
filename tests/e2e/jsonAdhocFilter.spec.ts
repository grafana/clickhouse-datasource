import { expect, test, ExplorePage } from '@grafana/plugin-e2e';
import { Page } from '@playwright/test';

const PLUGIN_TYPE = 'grafana-clickhouse-datasource';

const isCloudRun = !!process.env.GRAFANA_URL;

const CLOUD_DEFAULT_UID = 'clickhouse-native-ds-m';
const LOCAL_DEFAULT_UID = 'clickhouse-e2e';
const DATASOURCE_UID = process.env.DS_E2E_UID || (isCloudRun ? CLOUD_DEFAULT_UID : LOCAL_DEFAULT_UID);

// Time range that fully covers the seed fixture data in tests/e2e/fixtures/seed.sql
const FIXTURE_FROM_ISO = '2024-03-15T09:45:00.000Z';
const FIXTURE_TO_ISO = '2024-03-15T10:15:00.000Z';

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
// JSON-typed adhoc filter regression guards
//
// Unit tests in src/data/adHocFilter.test.ts cover the SQL shape escapeKey()
// emits when a dotted key references a JSON column, and unit tests in
// src/data/CHDatasource.test.ts cover getTagKeys() JSON-path expansion and the
// fetchTagValuesFromSchema() rewrite. Those tests can't confirm ClickHouse
// actually accepts the resulting SQL strings — only E2E can.
//
// The filter-application predicate shape (`col.`path`::Nullable(String) = ...`)
// is identical between the query-builder and the adhoc path and is already
// exercised by jsonFilter.spec.ts. The tests below run the SQL *shapes* the
// adhoc path emits — JSON-path discovery (as fetchUniqueJSONPathsForAdhoc emits)
// and the distinct-value listing (as fetchTagValuesFromSchema emits) — against
// the e2e_test.json_events fixture to confirm ClickHouse accepts them. They
// assert CH semantics, not the plugin's SQL generation (the unit tests cover
// generation), so they hand-type the SQL rather than invoking those methods.
// ---------------------------------------------------------------------------

test.describe('JSON column adhoc filters', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => {
    test.skip(
      isCloudRun,
      'Fixture-data tests depend on e2e_test.json_events seeded by tests/e2e/fixtures/seed.sql via the local e2e-data-loader Docker service, which is not available on Cloud.'
    );
  });

  test('JSONAllPaths discovery query returns distinct paths', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    // Shape emitted by fetchUniqueJSONPathsForAdhoc(), which getTagKeys()
    // invokes when it sees a JSON-typed column. Nested keys are returned as
    // flattened dot-paths (`http.status_code`).
    await enterSql(page, 'SELECT DISTINCT arrayJoin(JSONAllPaths(attributes)) AS path FROM e2e_test.json_events ORDER BY path');

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = (getBody() as any)?.results?.A?.frames;
    expect(frames?.length).toBeGreaterThan(0);
    expect(frames[0]?.data?.values?.[0]).toEqual(['http.status_code', 'level', 'user_id']);
  });

  test('dot-access cast values query returns distinct values', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    // Shape emitted by fetchTagValuesFromSchema() after rewriting a dotted key
    // like `json_events.attributes.level` into JSON dot-access with the
    // Nullable(String) cast. The previous behavior (`SELECT DISTINCT attributes`)
    // returned whole JSON objects, rendered as `[object Object]`.
    await enterSql(
      page,
      'SELECT DISTINCT attributes.`level`::Nullable(String) AS v FROM e2e_test.json_events ORDER BY v'
    );

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = (getBody() as any)?.results?.A?.frames;
    expect(frames?.length).toBeGreaterThan(0);
    expect(frames[0]?.data?.values?.[0]).toEqual(['error', 'info', 'warn']);
  });

  test('nested dot-access cast values query returns distinct values', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    // Nested path shape (`attributes.`http`.`status_code`::Nullable(String)`)
    // emitted by fetchTagValuesFromSchema() for a discovered nested path.
    await enterSql(
      page,
      'SELECT DISTINCT attributes.`http`.`status_code`::Nullable(String) AS v FROM e2e_test.json_events ORDER BY v'
    );

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = (getBody() as any)?.results?.A?.frames;
    expect(frames?.length).toBeGreaterThan(0);
    expect(frames[0]?.data?.values?.[0]).toEqual(['200', '400', '504']);
  });

  test('dot-access cast JSON filter returns matching rows', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    // The predicate shape escapeKey() emits inside additional_table_filters for
    // an adhoc JSON filter. Unit tests cover the full `additional_table_filters`
    // wrapper; we avoid typing `{` through Monaco (it auto-closes and mangles
    // the SQL). This covers the half unit tests can't: ClickHouse executing the
    // cast predicate end-to-end.
    await enterSql(
      page,
      "SELECT timestamp FROM e2e_test.json_events WHERE attributes.`level`::Nullable(String) = 'info' ORDER BY timestamp"
    );

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = (getBody() as any)?.results?.A?.frames;
    expect(frames?.length).toBeGreaterThan(0);
    // Fixture has two 'info' rows.
    expect(frames[0]?.data?.values?.[0]?.length).toBe(2);
  });
});
