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
    test.skip(
      isCloudRun,
      'Fixture-data tests depend on e2e_test.events seeded by tests/e2e/fixtures/seed.sql via the local e2e-data-loader Docker service, which is not available on Cloud.'
    );
  });

  test.describe.configure({ mode: 'serial' });

  test('equals filter on JSON path returns matching rows', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    // Exact shape of sqlGenerator output for: attributes filter, mapKey "level",
    // operator Equals, value "info". See sqlGenerator.test.ts "JSON filters" suite.
    await enterSql(
      page,
      "SELECT timestamp, message FROM e2e_test.json_events WHERE ( attributes.`level`::Nullable(String) = 'info' ) ORDER BY timestamp"
    );

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = (getBody() as any)?.results?.A?.frames;
    expect(frames?.length).toBeGreaterThan(0);
    // Fixture has two 'info' rows
    expect(frames[0]?.data?.values?.[0]?.length).toBe(2);
  });

  test('IN filter on JSON path returns matching rows', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    // Exact shape of sqlGenerator output for: attributes filter, mapKey "level",
    // operator In, value ["error", "warn"].
    await enterSql(
      page,
      "SELECT timestamp, message FROM e2e_test.json_events WHERE ( attributes.`level`::Nullable(String) IN ('error', 'warn') ) ORDER BY timestamp"
    );

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = (getBody() as any)?.results?.A?.frames;
    expect(frames?.length).toBeGreaterThan(0);
    // Fixture has one 'error' + one 'warn' row
    expect(frames[0]?.data?.values?.[0]?.length).toBe(2);
  });

  test('nested JSON path filter returns matching rows', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    // Exact shape for: attributes filter, mapKey "http.status_code", operator Equals.
    await enterSql(
      page,
      "SELECT timestamp, message FROM e2e_test.json_events WHERE ( attributes.`http`.`status_code`::Nullable(String) = '200' ) ORDER BY timestamp"
    );

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = (getBody() as any)?.results?.A?.frames;
    expect(frames?.length).toBeGreaterThan(0);
    // Fixture has two status_code=200 rows
    expect(frames[0]?.data?.values?.[0]?.length).toBe(2);
  });

  test('LIKE filter on JSON path returns matching rows', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    // Exact shape for: attributes filter, mapKey "user_id", operator Like, value "u-".
    // getFilters() wraps the user-entered value with '%...%'.
    await enterSql(
      page,
      "SELECT timestamp, message FROM e2e_test.json_events WHERE ( attributes.`user_id`::Nullable(String) LIKE '%u-%' ) ORDER BY timestamp"
    );

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = (getBody() as any)?.results?.A?.frames;
    expect(frames?.length).toBeGreaterThan(0);
    // Fixture has four rows, all with user_id matching '%u-%'
    expect(frames[0]?.data?.values?.[0]?.length).toBe(4);
  });
});
