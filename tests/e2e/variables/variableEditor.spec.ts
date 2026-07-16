// E2E coverage for the query-variable editor (guided editor shipped in #1868).
//
// Unit tests in src/data/CHVariableSupport.test.tsx cover generateVariableSql,
// the editor wiring and the string coercion of query results. They cannot
// cover the roundtrip these tests exercise: the plugin editor rendering
// inside Grafana's dashboard variable edit page, the generated SQL executing
// on a real ClickHouse through /api/ds/query, and Grafana accepting the
// returned frame and rendering the preview of values. The numeric-value
// regression (#2021) lived in that last hop, which no unit test could see.
//
// The legacy plain-string query shape (a variable saved by the pre-#1868
// editor arrives as a bare string) is deliberately not tested here: the
// current editor always emits CHVariableQuery objects, so a legacy-shaped
// query cannot be produced through the UI. It can only come from an existing
// dashboard JSON, and that runtime path stays covered by the unit tests.
//
// None of the queries here use time macros, so the dashboard's default time
// range is irrelevant and the fixture window does not need pinning.

import { expect, test, VariableEditPage } from '@grafana/plugin-e2e';
import type { Locator, Page } from '@playwright/test';
import { skipFixtureTestsOnCloud } from '../helpers/env';
import { Frame, QueryDataBody } from '../helpers/queryResponse';

// Name of the locally provisioned datasource (provisioning/datasources/
// clickhouse.yml). Cloud runs never reach the picker because every test in
// this suite depends on fixture data and is skipped there.
const DATASOURCE_NAME = 'ClickHouse';

// SQL that generateVariableSql emits for the guided types under test. The
// specs assert the SQL Query field holds exactly these strings, then match
// the /api/ds/query request on them.
const DATABASES_SQL = 'SELECT name FROM system.databases ORDER BY name';
const LEVEL_VALUES_SQL =
  'SELECT DISTINCT "level" AS value FROM "e2e_test"."events" WHERE "level" IS NOT NULL ORDER BY value LIMIT 1000';

/** Subset of the /api/ds/query request body needed to match the variable query. */
interface QueryRequestBody {
  queries?: Array<{ rawSql?: string }>;
}

/**
 * A select inside the plugin's variable editor, located by accessible name.
 * Grafana's own selects on this page derive their names from label elements
 * and its built-in variable type dropdown is also named "Variable type", so
 * intersect with the literal aria-label attribute that only the plugin's
 * selects carry (CHVariableSupport.tsx and SchemaPicker.tsx set it).
 */
function pluginEditorSelect(page: Page, label: string): Locator {
  return page.getByRole('combobox', { name: label, exact: true }).and(page.locator(`[aria-label="${label}"]`));
}

/** The plugin editor's own "Variable type" select. */
function variableTypeSelect(page: Page): Locator {
  return pluginEditorSelect(page, 'Variable type');
}

/** The plugin editor's SQL Query field (a TextArea labelled "SQL Query"). */
function sqlQueryField(page: Page): Locator {
  return page.getByRole('textbox', { name: 'SQL Query', exact: true });
}

/**
 * Drive the Grafana-side setup shared by every test: variable type Query,
 * the provisioned ClickHouse datasource, then wait for the plugin's variable
 * editor to render. The editor opens on the Custom SQL type by default.
 */
async function openClickHouseVariableEditor(variableEditPage: VariableEditPage, page: Page): Promise<void> {
  await variableEditPage.setVariableType('Query');
  await variableEditPage.datasource.set(DATASOURCE_NAME);
  await expect(variableTypeSelect(page)).toBeVisible();
}

/**
 * Pick a value in one of the plugin editor's selects, located by its
 * aria-label: open the combobox, type the value to filter the option list,
 * commit with Enter and close any lingering menu with Escape (the same
 * pattern as pickBuilderSelect in helpers/builder.ts).
 */
async function pickEditorSelect(page: Page, label: string, value: string): Promise<void> {
  const combobox = pluginEditorSelect(page, label);
  await combobox.click();
  await page.keyboard.type(value);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
}

/**
 * Register interest in the /api/ds/query response for the variable query
 * itself before clicking Run query. The variable edit page also issues
 * /api/ds/query calls for the schema pickers (databases, tables, columns),
 * so match on the exact rawSql the variable resolver sends, and read the
 * response body inside the predicate while it is still live.
 */
function waitForVariableQueryResponse(variableEditPage: VariableEditPage, expectedSql: string) {
  let body: QueryDataBody | null = null;
  const responsePromise = variableEditPage.waitForQueryDataResponse(async (response) => {
    if (!response.ok()) {
      return false;
    }
    const requestBody = response.request().postDataJSON() as QueryRequestBody | null;
    if (!requestBody?.queries?.some((q) => q.rawSql === expectedSql)) {
      return false;
    }
    body = (await response.json().catch(() => null)) as QueryDataBody | null;
    return body !== null;
  });
  return { responsePromise, getBody: (): QueryDataBody | null => body };
}

/**
 * First column of the first frame in the response. Variable queries carry a
 * random refId (CHDatasource.runQuery), so read the single results entry
 * instead of assuming refId 'A' like the Explore helpers do.
 */
function firstColumnValues(body: QueryDataBody | null): unknown[] {
  const resultEntries = Object.values(body?.results ?? {});
  const resultFrames: Frame[] = resultEntries[0]?.frames ?? [];
  return resultFrames[0]?.data?.values?.[0] ?? [];
}

test.describe('Query variable editor (#1868)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => {
    skipFixtureTestsOnCloud('seed.sql');
  });

  test.describe('guided query types', () => {
    test('List databases generates the system.databases query and previews e2e_test', async ({
      variableEditPage,
      page,
    }) => {
      await openClickHouseVariableEditor(variableEditPage, page);
      await pickEditorSelect(page, 'Variable type', 'List databases');
      await expect(sqlQueryField(page)).toHaveValue(DATABASES_SQL);

      const { responsePromise, getBody } = waitForVariableQueryResponse(variableEditPage, DATABASES_SQL);
      await variableEditPage.runQuery();
      await responsePromise;

      // seed.sql creates the e2e_test database. The server always has other
      // databases alongside it (system, default), so assert membership
      // rather than an exact list.
      expect(firstColumnValues(getBody())).toContain('e2e_test');
      await expect(variableEditPage).toDisplayPreviews(['e2e_test']);
    });

    test('Column values on e2e_test.events level previews the distinct levels', async ({ variableEditPage, page }) => {
      await openClickHouseVariableEditor(variableEditPage, page);
      await pickEditorSelect(page, 'Variable type', 'Column values');
      await pickEditorSelect(page, 'Database', 'e2e_test');
      await pickEditorSelect(page, 'Table', 'events');
      await pickEditorSelect(page, 'Column', 'level');
      await expect(sqlQueryField(page)).toHaveValue(LEVEL_VALUES_SQL);

      const { responsePromise, getBody } = waitForVariableQueryResponse(variableEditPage, LEVEL_VALUES_SQL);
      await variableEditPage.runQuery();
      await responsePromise;

      // seed.sql inserts ten rows carrying exactly four distinct levels
      // (info, debug, warn, error). The generated SQL orders by value.
      expect(firstColumnValues(getBody())).toEqual(['debug', 'error', 'info', 'warn']);
      await expect(variableEditPage).toDisplayPreviews(['debug', 'error', 'info', 'warn']);
    });
  });

  test.describe('Custom SQL', () => {
    test('a distinct-services query previews the seeded services', async ({ variableEditPage, page }) => {
      const sql = 'SELECT DISTINCT service FROM e2e_test.events ORDER BY service';
      await openClickHouseVariableEditor(variableEditPage, page);
      // Custom SQL is the editor's default variable type, so only the SQL
      // field needs filling.
      await sqlQueryField(page).fill(sql);

      const { responsePromise, getBody } = waitForVariableQueryResponse(variableEditPage, sql);
      await variableEditPage.runQuery();
      await responsePromise;

      // seed.sql inserts rows for exactly five services: api (three rows),
      // worker (three), scheduler (two), cache and db (one each).
      expect(firstColumnValues(getBody())).toEqual(['api', 'cache', 'db', 'scheduler', 'worker']);
      await expect(variableEditPage).toDisplayPreviews(['api', 'cache', 'db', 'scheduler', 'worker']);
    });

    test('a numeric column still resolves previews (#2021)', async ({ variableEditPage, page }) => {
      const sql = 'SELECT DISTINCT value FROM e2e_test.events ORDER BY value';
      await openClickHouseVariableEditor(variableEditPage, page);
      await sqlQueryField(page).fill(sql);

      const { responsePromise, getBody } = waitForVariableQueryResponse(variableEditPage, sql);
      await variableEditPage.runQuery();
      await responsePromise;

      // seed.sql holds six distinct Float64 values across its ten rows. The
      // raw frame is numeric; CHVariableSupport coerces the variable frame
      // to string fields because Grafana's toMetricFindValues rejects
      // number-typed fields, which is exactly how the #2021 regression
      // surfaced (the variable errored instead of listing values).
      expect(firstColumnValues(getBody())).toEqual([0, 0.5, 1, 1.2, 2.5, 85.3]);
      await expect(variableEditPage).toDisplayPreviews(['0', '0.5', '1', '1.2', '2.5', '85.3']);
    });
  });
});
