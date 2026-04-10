import { expect, test, ExplorePage } from '@grafana/plugin-e2e';
import { Locator, Page } from '@playwright/test';
import { QueryType } from '../../src/types/queryBuilder';
import { EditorType } from '../../src/types/sql';

// Matches the uid set in provisioning/datasources/clickhouse.yml
const DATASOURCE_UID = 'clickhouse-e2e';
const PLUGIN_TYPE = 'grafana-clickhouse-datasource';

// Time range that fully covers the seed fixture data in tests/e2e/fixtures/seed.sql
const FIXTURE_FROM_ISO = '2024-03-15T09:45:00.000Z';
const FIXTURE_TO_ISO = '2024-03-15T10:15:00.000Z';

interface ExploreUrlOpts {
  queryType?: QueryType;
  editorType?: EditorType;
  from?: string;
  to?: string;
}

/**
 * Returns a locator that matches the query editor row regardless of Grafana version.
 * Grafana < 13 uses [aria-label="Query editor row"]; Grafana >= 13 uses
 * [data-testid="data-testid Query editor row"]. The CSS union matches whichever is present.
 */
function queryEditorRow(page: Page): Locator {
  return page.locator('[data-testid="data-testid Query editor row"], [aria-label="Query editor row"]');
}

/**
 * Build an Explore URL encoding the full pane state.
 * Note: Grafana does not restore editorType or builderOptions from the URL panes
 * state for this plugin — the editor always opens in SQL Editor mode.
 * queryType IS restored via the query's top-level queryType field (used by SQL mode).
 */
function exploreUrl(opts: ExploreUrlOpts = {}): string {
  const { from = 'now-1h', to = 'now' } = opts;

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
      range: { from, to },
    },
  });
  
  return `/explore?orgId=1&schemaVersion=1&panes=${encodeURIComponent(panes)}`;
}

/**
 * Switch the query editor from SQL Editor mode (the default on page load) to
 * Query Builder mode. If the editor contains a non-SELECT statement, Grafana
 * shows a "Cannot convert" confirmation dialog — dismiss it by clicking Continue.
 */
async function switchToBuilderMode(page: Page) {
  await page.getByRole('radio', { name: 'Query Builder' }).click();
  // When the SQL editor contains a non-SELECT statement (e.g. empty), Grafana
  // shows a "Cannot convert" confirmation dialog before switching modes.
  const continueButton = page.getByRole('button', { name: 'Continue' });
  if (await continueButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await continueButton.click();
  }
  // Wait until the Query Builder radio is checked, confirming the builder has rendered.
  await expect(page.getByRole('radio', { name: 'Query Builder' })).toBeChecked();
}

/**
 * Type SQL into the CodeMirror editor. Clicks to focus, selects all existing
 * content, then types the replacement query.
 */
async function enterSql(page: Page, sql: string) {
  const editor = page.getByRole('code');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(sql);
}

/**
 * Wraps explorePage.waitForQueryDataResponse, reading the response body
 * inside the predicate while the CDP buffer is still live.
 *
 * TODO: patch @grafana/plugin-e2e so waitForQueryDataResponse exposes the
 * body directly, removing the need for this workaround.
 */
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
// Rendering tests — verify the query editor UI structure without requiring
// real query results.
// ---------------------------------------------------------------------------

test.describe('Query editor', () => {
  test.describe('rendering', () => {
    test('smoke: renders all query type options', { tag: ['@plugins'] }, async ({ page }) => {
      await page.goto(exploreUrl());
      // Query type radios are always visible regardless of editor mode
      await expect(page.getByRole('radio', { name: 'Table' })).toBeVisible();
      await expect(page.getByRole('radio', { name: 'Logs' })).toBeVisible();
      await expect(page.getByRole('radio', { name: 'Time Series' })).toBeVisible();
      await expect(page.getByRole('radio', { name: 'Traces' })).toBeVisible();
    });

    test('renders editor type switcher', async ({ page }) => {
      await page.goto(exploreUrl());
      // Grafana opens the editor in SQL Editor mode by default
      await expect(page.getByRole('radio', { name: 'SQL Editor' })).toBeChecked();
      await expect(page.getByRole('radio', { name: 'Query Builder' })).toBeVisible();
    });

    test('renders Run Query button', async ({ page }) => {
      await page.goto(exploreUrl());
      // The toolbar also has a "Run query" button — scope to the query editor row to
      // avoid a strict-mode violation from matching both.
      await expect(
        queryEditorRow(page).getByRole('button', { name: 'Run Query' })
      ).toBeVisible();
    });

    test('renders SQL editor code area', async ({ page }) => {
      await page.goto(exploreUrl());
      await expect(page.getByRole('code')).toBeVisible();
    });
  });

  test.describe('Query Builder mode', () => {
    test('renders database and table selectors after switching to Builder mode', async ({ page }) => {
      await page.goto(exploreUrl());
      await switchToBuilderMode(page);
      // Use a scoped locator — `label.query-keyword` is the Grafana inline form label
      // class used by the builder for all its field labels (Database, Table, etc.).
      await expect(
        queryEditorRow(page).locator('label.query-keyword', { hasText: 'Database' })
      ).toBeVisible();
    });

    test('renders builder mode toggle with Simple and Aggregate options', async ({ page }) => {
      await page.goto(exploreUrl());
      await switchToBuilderMode(page);
      await expect(page.getByText('Builder Mode')).toBeVisible();
      await expect(page.getByRole('radio', { name: 'Simple' })).toBeVisible();
      await expect(page.getByRole('radio', { name: 'Aggregate' })).toBeVisible();
    });
  });

  test.describe('Query type selection', () => {
    test('can select Logs query type', async ({ page }) => {
      await page.goto(exploreUrl());
      await page.getByRole('radio', { name: 'Logs' }).click();
      await expect(page.getByRole('radio', { name: 'Logs' })).toBeChecked();
    });

    test('can select Time Series query type', async ({ page }) => {
      await page.goto(exploreUrl());
      await page.getByRole('radio', { name: 'Time Series' }).click();
      await expect(page.getByRole('radio', { name: 'Time Series' })).toBeChecked();
    });

    test('can select Traces query type', async ({ page }) => {
      await page.goto(exploreUrl());
      await page.getByRole('radio', { name: 'Traces' }).click();
      await expect(page.getByRole('radio', { name: 'Traces' })).toBeChecked();
    });
  });
});

// ---------------------------------------------------------------------------
// Fixture-data tests — require e2e_test.events seeded by seed.sql via the
// e2e-data-loader Docker Compose service. Run serially to avoid competing for
// the same ClickHouse instance under parallel workers.
// ---------------------------------------------------------------------------

test.describe('Query editor with fixture data', () => {
  test.describe.configure({ mode: 'serial' });

  test('SQL query returns rows from fixture data', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    await enterSql(page, 'SELECT timestamp, level, message FROM e2e_test.events ORDER BY timestamp LIMIT 10');

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await queryEditorRow(page).getByRole('button', { name: 'Run Query' }).click();

    await responsePromise;
    expect((getBody() as any)?.results?.A?.frames?.length).toBeGreaterThan(0);
  });

  test('Aggregate SQL query returns a count from fixture data', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    await enterSql(page, 'SELECT count(*) AS total FROM e2e_test.events');

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await queryEditorRow(page).getByRole('button', { name: 'Run Query' }).click();

    await responsePromise;
    expect((getBody() as any)?.results?.A?.frames?.length).toBeGreaterThan(0);
  });

  test('SQL query with WHERE filter returns matching rows', async ({ page, explorePage }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    await enterSql(page, "SELECT timestamp, message FROM e2e_test.events WHERE level = 'error' ORDER BY timestamp");

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await queryEditorRow(page).getByRole('button', { name: 'Run Query' }).click();

    await responsePromise;
    expect((getBody() as any)?.results?.A?.frames?.length).toBeGreaterThan(0);
  });
});
