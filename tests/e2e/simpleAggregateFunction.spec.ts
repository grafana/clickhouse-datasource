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

function getFrameFields(body: any): any[] {
  return body?.results?.A?.frames?.[0]?.schema?.fields ?? [];
}

test.describe('SimpleAggregateFunction type handling', () => {
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

  test('SimpleAggregateFunction(any, Float64) returns numeric values', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    await enterSql(page, 'SELECT value FROM e2e_test.simple_aggregate_events ORDER BY timestamp');

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();

    await responsePromise;
    const values = getFrameValues(getBody());
    expect(values.length).toBeGreaterThan(0);
    expect(values[0]).toEqual([1.5, 2.0, 3.5, 4.0, 5.5]);
  });

  test('SimpleAggregateFunction(any, Nullable(Float64)) returns numbers with nulls', async ({
    page,
    explorePage,
  }) => {
    await page.goto(exploreUrl());
    await enterSql(page, 'SELECT nullable_value FROM e2e_test.simple_aggregate_events ORDER BY timestamp');

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();

    await responsePromise;
    const values = getFrameValues(getBody());
    expect(values.length).toBeGreaterThan(0);
    expect(values[0]).toEqual([1.5, null, 3.5, null, 5.5]);
  });

  test('SimpleAggregateFunction(sum, UInt64) returns integer values', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    await enterSql(page, 'SELECT count FROM e2e_test.simple_aggregate_events ORDER BY timestamp');

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();

    await responsePromise;
    const values = getFrameValues(getBody());
    expect(values.length).toBeGreaterThan(0);
    expect(values[0]).toEqual([10, 20, 30, 40, 50]);
  });

  test('SimpleAggregateFunction(any, Bool) returns boolean values', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    await enterSql(page, 'SELECT is_active FROM e2e_test.simple_aggregate_events ORDER BY timestamp');

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();

    await responsePromise;
    const values = getFrameValues(getBody());
    expect(values.length).toBeGreaterThan(0);
    expect(values[0]).toEqual([true, false, true, true, false]);
  });

  test('SimpleAggregateFunction(max, DateTime64) returns time values', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    await enterSql(page, 'SELECT last_seen FROM e2e_test.simple_aggregate_events ORDER BY timestamp');

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();

    await responsePromise;
    const fields = getFrameFields(getBody());
    const lastSeenField = fields.find((f: any) => f.name === 'last_seen');
    expect(lastSeenField?.typeInfo?.frame).toBe('time.Time');
  });

  test('table panel renders all SAF types with correct field metadata', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    await enterSql(
      page,
      'SELECT timestamp, name, label, value, nullable_value, count, is_active, last_seen FROM e2e_test.simple_aggregate_events ORDER BY timestamp'
    );

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();

    await responsePromise;
    const fields = getFrameFields(getBody());
    expect(fields.length).toBe(8);

    const fieldByName = (n: string) => fields.find((f: any) => f.name === n);
    expect(fieldByName('name')?.typeInfo?.frame).toBe('string');
    expect(fieldByName('label')?.typeInfo?.frame).toMatch(/string/);
    expect(fieldByName('value')?.typeInfo?.frame).toBe('float64');
    expect(fieldByName('nullable_value')?.typeInfo?.frame).toMatch(/float64/);
    expect(fieldByName('count')?.typeInfo?.frame).toMatch(/uint64|int64|float64/);
    expect(fieldByName('is_active')?.typeInfo?.frame).toBe('bool');
    expect(fieldByName('last_seen')?.typeInfo?.frame).toBe('time.Time');
  });
});
