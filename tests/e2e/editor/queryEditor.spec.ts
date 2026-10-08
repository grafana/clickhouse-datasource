// E2E coverage for the query editor shell in Explore: the query type radio
// group, the SQL Editor / Query Builder mode switcher, and the builder's
// top-level controls. Unit tests can mount the editor components in
// isolation, but only E2E confirms Grafana wires them into Explore (mode
// switching, the "Cannot convert" confirmation, and query type selection)
// without requiring real query results.

import { expect, test } from '@grafana/plugin-e2e';
import { switchToBuilderMode } from '../helpers/builder';
import { exploreUrl } from '../helpers/explore';
import { enterSql } from '../helpers/sqlEditor';

// Cloud stacks send queries to the query service API instead of /api/ds/query.
const QUERY_DATA_URL = /\/api\/ds\/query|\/apis\/[^/]+\/v0alpha1\/namespaces\/[^/]+\/query\b/;

interface QueryDataBody {
  results?: Record<string, { status?: number; frames?: Array<{ data?: { values?: unknown[][] } }> }>;
}

// Needs no fixture data, so it runs on Cloud too and exercises the backend there.
test.describe('Query editor query path', () => {
  test('SELECT 1 returns a single row from the backend', async ({ page }) => {
    const sql = 'SELECT 1 AS one';
    await page.goto(exploreUrl());
    await enterSql(page, sql);
    const runQuery = page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' });

    // The first queries on Cloud can return no frames while the data source connection warms up.
    await expect(async () => {
      const responsePromise = page.waitForResponse(
        (r) => QUERY_DATA_URL.test(r.url()) && (r.request().postData() ?? '').includes(sql),
        { timeout: 15_000 }
      );
      await runQuery.click();
      const response = await responsePromise;

      expect(response.status()).toBe(200);
      const body = (await response.json()) as QueryDataBody;
      const result = body.results?.A;
      expect(result?.frames?.[0]?.data?.values, `query status ${result?.status}`).toEqual([[1]]);
    }).toPass({ intervals: [1_000, 2_000, 4_000, 8_000], timeout: 60_000 });
  });
});

test.describe('Query editor', () => {
  test.describe('Rendering', () => {
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
      // The toolbar also has a "Run query" button, so scope to the query editor row to
      // avoid a strict-mode violation from matching both.
      await expect(page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' })).toBeVisible();
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
      // Use a scoped locator: `label.query-keyword` is the Grafana inline form label
      // class used by the builder for all its field labels (Database, Table, etc.).
      await expect(
        page.locator('.query-editor-row').locator('label.query-keyword', { hasText: 'Database' })
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
