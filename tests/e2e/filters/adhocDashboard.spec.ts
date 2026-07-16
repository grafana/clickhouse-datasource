import { readFileSync } from 'fs';
import { join } from 'path';
import { expect, test, DashboardPage } from '@grafana/plugin-e2e';
import type { E2ESelectorGroups } from '@grafana/plugin-e2e';
import type { Locator, Page } from '@playwright/test';
import { skipFixtureTestsOnCloud } from '../helpers/env';
import { QueryDataBody, rowCount } from '../helpers/queryResponse';

// ---------------------------------------------------------------------------
// Ad hoc filter dashboard flow
//
// Unit tests cover getTagKeys/getTagValues against a mocked runQuery and the
// exact additional_table_filters string AdHocFilter.apply() emits, and
// adhocRegexFilter.spec.ts proves ClickHouse accepts REGEXP at the plain SQL
// level. None of them exercise the real dashboard variable flow: Grafana
// calling getTagKeys when the ad hoc picker opens, the clickhouse_adhoc_query
// constant variable scoping key discovery to a single table, getTagValues
// populating the value dropdown, and Grafana handing the committed filter to
// applyTemplateVariables so the panel re-queries with the filter attached.
// This spec covers that end-to-end loop, asserting on the outgoing
// /api/ds/query bodies and exact fixture row counts.
//
// The dashboard under test lives in tests/e2e/dashboards/adhoc-dashboard.json
// and is imported through the HTTP API in a beforeEach. Its saved time range
// pins the seed fixture window, so no Explore URL plumbing is needed.
//
// The interactions target the pill-style ad hoc combobox, which has been the
// default dashboard ad hoc UI since Grafana 11.5 (newFiltersUI went GA in
// 11.5 and the toggle was removed in 13.0), covering the whole supported
// Grafana window.
// ---------------------------------------------------------------------------

const DASHBOARD_UID = 'e2e-adhoc-dash';
const DASHBOARD_JSON_PATH = join(__dirname, '..', 'dashboards', 'adhoc-dashboard.json');

// Label of the adhoc variable in the dashboard JSON; used to anchor the
// picker input the same way Grafana core's own adhoc Playwright tests do.
const FILTERS_VARIABLE_LABEL = 'Filters';

// Shape of the outgoing /api/ds/query request body, as far as these tests
// need to inspect it.
interface DsQueryRequestBody {
  queries?: Array<{ refId?: string; rawSql?: string }>;
}

/**
 * The ad hoc combobox input, anchored via the variable label element so the
 * locator survives markup changes inside the pill UI.
 */
function adHocFilterInput(dashboardPage: DashboardPage, selectors: E2ESelectorGroups): Locator {
  return dashboardPage
    .getByGrafanaSelector(selectors.pages.Dashboard.SubMenu.submenuItemLabels(FILTERS_VARIABLE_LABEL))
    .locator('..')
    .locator('input');
}

/**
 * Operator options render the symbol plus a description (for example
 * '= Equals'), so an exact name match on the symbol alone fails. Anchor the
 * symbol at the start of the accessible name and require end-of-name or
 * whitespace after it, so '=' cannot match '=~', '=|' or '!='.
 */
function operatorOption(page: Page, symbol: '=' | '=~'): Locator {
  const pattern = symbol === '=' ? /^=($|\s)/ : /^=~($|\s)/;
  return page.getByRole('option', { name: pattern });
}

/**
 * Resolve with the parsed /api/ds/query response body of the next panel
 * query whose outgoing rawSql contains every given fragment. Tag-key and
 * tag-value lookups also POST to /api/ds/query, so callers must include a
 * fragment unique to the filtered panel query (the additional_table_filters
 * clause). Call without await before the click that triggers the query (the
 * response listener registers synchronously), then await the result.
 */
async function waitForPanelQueryContaining(
  dashboardPage: DashboardPage,
  sqlFragments: string[]
): Promise<QueryDataBody | null> {
  let body: QueryDataBody | null = null;
  await dashboardPage.waitForQueryDataResponse(async (response) => {
    if (!response.ok()) {
      return false;
    }
    // postDataJSON throws on a body-less request; treat that as a non-match.
    let requestBody: DsQueryRequestBody | null = null;
    try {
      requestBody = response.request().postDataJSON() as DsQueryRequestBody | null;
    } catch {
      return false;
    }
    const queries = requestBody?.queries ?? [];
    const matches = queries.some((query) => {
      const rawSql = query.rawSql;
      return typeof rawSql === 'string' && sqlFragments.every((fragment) => rawSql.includes(fragment));
    });
    if (!matches) {
      return false;
    }
    const parsed = (await response.json().catch(() => null)) as QueryDataBody | null;
    if (!Array.isArray(parsed?.results?.['A']?.frames)) {
      return false;
    }
    body = parsed;
    return true;
  });
  return body;
}

test.describe('Ad hoc filter dashboard flow', () => {
  test.beforeEach(async ({ page }) => {
    skipFixtureTestsOnCloud('seed.sql');

    // Import the dashboard through the HTTP API rather than provisioning so
    // the spec stays self-contained; overwrite keeps re-runs idempotent.
    const dashboard = JSON.parse(readFileSync(DASHBOARD_JSON_PATH, 'utf-8')) as Record<string, unknown>;
    const response = await page.request.post('/api/dashboards/db', {
      data: { dashboard, overwrite: true },
    });
    expect(response.ok()).toBeTruthy();
  });

  test.describe.configure({ mode: 'serial' });

  test('opening the key picker lists the scoped table columns (getTagKeys)', async ({
    gotoDashboardPage,
    selectors,
    page,
  }) => {
    const dashboardPage = await gotoDashboardPage({ uid: DASHBOARD_UID });
    await adHocFilterInput(dashboardPage, selectors).click();

    // getTagKeys queries system.columns scoped by the clickhouse_adhoc_query
    // constant ('e2e_test.events'), so exactly the five events columns from
    // seed.sql should be offered as filter keys, prefixed with the table name.
    for (const key of ['events.timestamp', 'events.level', 'events.message', 'events.value', 'events.service']) {
      await expect(page.getByRole('option', { name: key, exact: true })).toBeVisible();
    }

    // Columns of other e2e_test tables must not leak into the key list; a
    // json_events key appearing here would mean the constant variable no
    // longer scopes discovery to the single named table.
    await expect(page.getByRole('option', { name: 'json_events.timestamp', exact: true })).toHaveCount(0);
  });

  test('selecting level = error re-queries the panel with only the seeded error rows (getTagValues)', async ({
    gotoDashboardPage,
    selectors,
    page,
  }) => {
    const dashboardPage = await gotoDashboardPage({ uid: DASHBOARD_UID });
    await adHocFilterInput(dashboardPage, selectors).click();
    await page.getByRole('option', { name: 'events.level', exact: true }).click();

    // The combobox flow inserts an operator stage between key and value.
    await operatorOption(page, '=').click();

    // getTagValues runs `select distinct level from e2e_test.events`; the
    // seed fixture has exactly these four distinct levels.
    for (const level of ['info', 'debug', 'warn', 'error']) {
      await expect(page.getByRole('option', { name: level, exact: true })).toBeVisible();
    }

    // Committing the value must re-run the panel query with the filter baked
    // into additional_table_filters (automatic AdHocFilter.apply; the panel
    // SQL carries no $__adHocFilters macro).
    const filteredQuery = waitForPanelQueryContaining(dashboardPage, [
      'additional_table_filters',
      " level = \\'error\\' ",
    ]);
    await page.getByRole('option', { name: 'error', exact: true }).click();
    const body = await filteredQuery;

    // seed.sql has exactly two level='error' rows ('Connection timeout' and
    // 'Database connection failed') out of ten.
    expect(rowCount(body)).toBe(2);
  });

  test('the =~ operator applies a REGEXP filter through the picker (#1443)', async ({
    gotoDashboardPage,
    selectors,
    page,
  }) => {
    const dashboardPage = await gotoDashboardPage({ uid: DASHBOARD_UID });
    const input = adHocFilterInput(dashboardPage, selectors);
    await input.click();
    await page.getByRole('option', { name: 'events.level', exact: true }).click();
    await operatorOption(page, '=~').click();

    // '^(error|warn)$' only matches rows when evaluated as a regular
    // expression; as an equality or LIKE pattern it matches nothing. No
    // seeded level equals the pattern text, so it is entered as a custom
    // value. Typing filters the fetched values out of the dropdown, leaving
    // the custom-value row as the only interactive option.
    await input.fill('^(error|warn)$');
    const customValue = page.getByRole('option', { name: /Use custom value/ });
    await expect(customValue).toBeVisible();

    // Grafana's '=~' must reach ClickHouse as REGEXP (not ILIKE, see #1443)
    // inside the additional_table_filters clause.
    const filteredQuery = waitForPanelQueryContaining(dashboardPage, [
      'additional_table_filters',
      " level REGEXP \\'^(error|warn)$\\' ",
    ]);
    await customValue.click();
    const body = await filteredQuery;

    // seed.sql has one 'warn' row and two 'error' rows, so the regex keeps
    // three of the ten fixture rows.
    expect(rowCount(body)).toBe(3);
  });
});
