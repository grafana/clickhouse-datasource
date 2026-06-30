import { expect, test, ExplorePage } from '@grafana/plugin-e2e';
import { Page } from '@playwright/test';

const PLUGIN_TYPE = 'grafana-clickhouse-datasource';

const isCloudRun = !!process.env.GRAFANA_URL;

const CLOUD_DEFAULT_UID = 'clickhouse-native-ds-m';
const LOCAL_DEFAULT_UID = 'clickhouse-e2e';
const DATASOURCE_UID = process.env.DS_E2E_UID || (isCloudRun ? CLOUD_DEFAULT_UID : LOCAL_DEFAULT_UID);

const FIXTURE_FROM_ISO = '2024-03-15T09:45:00.000Z';
const FIXTURE_TO_ISO = '2024-03-15T10:15:00.000Z';

function exploreUrl(): string {
  const query: Record<string, unknown> = {
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
      range: { from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO },
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
    const b: any = await r.json().catch(() => null);
    if (!Array.isArray(b?.results?.A?.frames)) {
      return false;
    }
    body = b as Record<string, unknown>;
    return true;
  });
  return { responsePromise, getBody: () => body };
}

function getFrameValues(body: any): any[][] {
  return body?.results?.A?.frames?.[0]?.data?.values ?? [];
}

test.describe('SimpleAggregateFunction string type handling', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => {
    test.skip(
      isCloudRun,
      'Fixture-data tests depend on e2e_test.simple_aggregate_events seeded by tests/e2e/fixtures/simple_aggregate_functions.sql via the local e2e-data-loader Docker service, which is not available on Cloud.'
    );
  });

  test('SimpleAggregateFunction(any, String) returns string values', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    await enterSql(page, 'SELECT name FROM e2e_test.simple_aggregate_events ORDER BY timestamp');

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();

    await responsePromise;
    const values = getFrameValues(getBody());
    expect(values.length).toBeGreaterThan(0);
    expect(values[0]).toEqual(['alpha', 'beta', 'gamma', 'delta', 'epsilon']);
  });

  test('SimpleAggregateFunction(any, Nullable(String)) returns values with nulls preserved', async ({
    page,
    explorePage,
  }) => {
    await page.goto(exploreUrl());
    await enterSql(page, 'SELECT label FROM e2e_test.simple_aggregate_events ORDER BY timestamp');

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();

    await responsePromise;
    const values = getFrameValues(getBody());
    expect(values.length).toBeGreaterThan(0);
    expect(values[0]).toEqual(['first', null, 'third', 'fourth', null]);
  });

  test('table panel renders both SAF string columns together', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    await enterSql(
      page,
      'SELECT timestamp, name, label FROM e2e_test.simple_aggregate_events ORDER BY timestamp'
    );

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();

    await responsePromise;
    const body = getBody() as any;
    const fields = body?.results?.A?.frames?.[0]?.schema?.fields ?? [];
    expect(fields.length).toBe(3);

    const nameField = fields.find((f: any) => f.name === 'name');
    const labelField = fields.find((f: any) => f.name === 'label');
    expect(nameField?.typeInfo?.frame).toBe('string');
    expect(labelField?.typeInfo?.frame).toMatch(/string/);
  });
});
