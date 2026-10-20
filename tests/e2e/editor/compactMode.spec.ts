// E2E coverage for compact query mode against the locally provisioned
// single-source datasources (logs-only and traces-only). Unit tests cover the
// compact components in isolation; only E2E confirms the plugin detects a
// single-source datasource inside Explore, swaps in the compact filter bar,
// hides the full builder chrome, and still issues queries that return frames.

import { expect, test } from '@grafana/plugin-e2e';
import {
  FIXTURE_FROM_ISO,
  FIXTURE_TO_ISO,
  isCloudRun,
  SINGLE_LOGS_DATASOURCE_UID,
  SINGLE_TRACES_DATASOURCE_UID,
} from '../helpers/env';
import { exploreUrl } from '../helpers/explore';
import { frames, waitForQueryDataResponseWithBody } from '../helpers/queryResponse';

test.describe('Compact query mode', () => {
  test.beforeEach(() => {
    test.skip(
      isCloudRun,
      'Compact mode E2E uses local provisioned single-source datasources and seeded ClickHouse fixture tables.'
    );
  });

  test('renders compact logs editor for single-source datasource', async ({ page, explorePage }) => {
    await page.goto(
      exploreUrl({
        datasourceUid: SINGLE_LOGS_DATASOURCE_UID,
        from: FIXTURE_FROM_ISO,
        to: FIXTURE_TO_ISO,
      })
    );

    await page.getByRole('button', { name: 'Switch to compact view' }).click();

    const queryEditor = page.locator('[data-testid="query-editor-section-builder"]');
    await expect(queryEditor.locator('[data-testid="compact-filter-bar"]')).toBeVisible();
    await expect(page.getByPlaceholder('Search log body text...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add filter' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Order by' })).toBeVisible();
    await expect(queryEditor.getByRole('button', { name: 'SQL', exact: true })).toBeVisible();

    const databaseLabel = page.locator('.query-editor-row').locator('label.query-keyword', { hasText: 'Database' });
    await expect(databaseLabel).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Table' })).toHaveCount(0);
    await expect(queryEditor.locator('pre')).toHaveCount(0);
    await expect(
      page.getByText(/React error #185|Maximum update depth exceeded|An unexpected error occurred/i)
    ).toHaveCount(0);

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.getByPlaceholder('Search log body text...').fill('error');
    await page.keyboard.press('Enter');
    await responsePromise;
    expect(frames(getBody()).length).toBeGreaterThan(0);
  });

  test('renders compact traces editor for single-source datasource', async ({ page }) => {
    await page.goto(
      exploreUrl({
        datasourceUid: SINGLE_TRACES_DATASOURCE_UID,
        from: FIXTURE_FROM_ISO,
        to: FIXTURE_TO_ISO,
      })
    );

    await page.getByRole('button', { name: 'Switch to compact view' }).click();

    const queryEditor = page.locator('[data-testid="query-editor-section-builder"]');
    await expect(queryEditor.locator('[data-testid="compact-filter-bar"]')).toBeVisible();
    await expect(page.getByPlaceholder('Search log body text...')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add filter' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Order by' })).toBeVisible();
    await expect(queryEditor.getByRole('button', { name: 'SQL', exact: true })).toBeVisible();

    const databaseLabel = page.locator('.query-editor-row').locator('label.query-keyword', { hasText: 'Database' });
    await expect(databaseLabel).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Table' })).toHaveCount(0);
    await expect(queryEditor.locator('pre')).toHaveCount(0);
    await expect(
      page.getByText(/React error #185|Maximum update depth exceeded|An unexpected error occurred/i)
    ).toHaveCount(0);
  });
});
