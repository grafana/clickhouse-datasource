import { expect, test } from '@grafana/plugin-e2e';
import type { Locator, Page } from '@playwright/test';
import { Filter, FilterOperator, QueryType } from '../../../src/types/queryBuilder';
import { pluginVersion } from '../../../src/utils/version';
import { FIXTURE_FROM_ISO, FIXTURE_TO_ISO, skipFixtureTestsOnCloud } from '../helpers/env';
import { exploreUrl } from '../helpers/explore';

// ---------------------------------------------------------------------------
// Query builder filter value suggestions
//
// Unit tests in FilterEditor.test.tsx and CHDatasource.test.ts cover the value
// fields and the suggestion SQL with a mocked datasource. Only E2E can confirm
// the whole path: the field fetches the distinct values of the column from
// ClickHouse, narrows them by the other filters of the query, and the picked
// value reaches the SQL the builder generates.
//
// Fixture: e2e_test.events from seed.sql. Its service column holds api,
// worker, cache, scheduler and db; the two error rows are from worker and db.
// ---------------------------------------------------------------------------

const ALL_SERVICES = ['api', 'cache', 'db', 'scheduler', 'worker'];

const serviceFilter = (operator: FilterOperator, value: string | string[]) =>
  ({
    filterType: 'custom',
    key: 'service',
    type: 'LowCardinality(String)',
    operator,
    condition: 'AND',
    value,
  }) as Filter;

const levelIsError = {
  filterType: 'custom',
  key: 'level',
  type: 'LowCardinality(String)',
  operator: FilterOperator.Equals,
  condition: 'AND',
  value: 'error',
} as Filter;

/** Opens Explore on a Table builder query over e2e_test.events with these filters. */
async function openBuilderQuery(page: Page, filters: Filter[]) {
  await page.goto(
    exploreUrl({
      from: FIXTURE_FROM_ISO,
      to: FIXTURE_TO_ISO,
      pluginVersion,
      builderOptions: {
        database: 'e2e_test',
        table: 'events',
        queryType: QueryType.Table,
        mode: 'list',
        columns: [{ name: 'message' }],
        filters,
        orderBy: [],
        limit: 100,
      },
    })
  );
  await expect(page.getByRole('radio', { name: 'Query Builder' })).toBeChecked();
}

/** The value field of the service filter: the last filter of the query in these tests. */
function valueField(page: Page, kind: 'single' | 'multi'): Locator {
  return page.getByTestId(`query-builder-filters-${kind}-string-value-container`).last().getByRole('combobox');
}

/** The names of the options the open dropdown lists. */
async function listedOptions(page: Page): Promise<string[]> {
  const options = page.getByRole('option');
  await expect(options.first()).toBeVisible();
  return (await options.allInnerTexts()).map((text) => text.trim()).sort();
}

function sqlPreview(page: Page): Locator {
  return page.locator('pre').filter({ hasText: 'FROM' }).first();
}

test.describe('Query builder filter value suggestions', () => {
  test.beforeEach(() => {
    skipFixtureTestsOnCloud('seed.sql');
  });

  test('suggests the values of the column and puts the picked one in the SQL', async ({ page }) => {
    await openBuilderQuery(page, [serviceFilter(FilterOperator.Equals, '')]);

    await valueField(page, 'single').click();
    expect(await listedOptions(page)).toEqual(ALL_SERVICES);

    await page.getByRole('option', { name: 'worker', exact: true }).click();
    await expect(sqlPreview(page)).toContainText("service = 'worker'");
  });

  test('narrows the suggestions by the other filters of the query', async ({ page }) => {
    await openBuilderQuery(page, [levelIsError, serviceFilter(FilterOperator.Equals, '')]);

    await valueField(page, 'single').click();

    expect(await listedOptions(page)).toEqual(['db', 'worker']);
  });

  test('picks several values for IN', async ({ page }) => {
    await openBuilderQuery(page, [serviceFilter(FilterOperator.In, [])]);

    const field = valueField(page, 'multi');
    await field.click();
    await page.getByRole('option', { name: 'api', exact: true }).click();
    await page.getByRole('option', { name: 'worker', exact: true }).click();
    await page.keyboard.press('Escape');

    await expect(sqlPreview(page)).toContainText("service IN ('api', 'worker')");
  });
});
