import { expect, test, ExplorePage } from '@grafana/plugin-e2e';
import type { Locator, Page } from '@playwright/test';
import { QueryType } from '../../../src/types/queryBuilder';
import { FIXTURE_FROM_ISO, FIXTURE_TO_ISO, skipFixtureTestsOnCloud } from '../helpers/env';
import { exploreUrl } from '../helpers/explore';
import { pickBuilderSelect, switchToBuilderMode } from '../helpers/builder';
import { waitForQueryDataResponseWithBody } from '../helpers/queryResponse';
import { runQuery, runSqlAndGetBody } from '../helpers/sqlEditor';

// ---------------------------------------------------------------------------
// Toggleable log filters in Explore
//
// Unit tests in src/data/CHDatasource.test.ts cover toggleQueryFilter and
// queryHasFilter exhaustively at the JS level. Only E2E can confirm the
// integration boundary: clicking the +/- "Filter for/out value" buttons in
// Grafana's Logs panel reaches the plugin, and the mutated query (with
// regenerated rawSql) reaches the next /api/ds/query request.
//
// Two structurally different DOMs:
//   * Legacy panel (Grafana ≤12.2 with newLogsPanel off): each row is a <tr>
//     containing a button with aria-label "See log details" that toggles the
//     row's details inline.
//   * New panel (Grafana ≥12.4, newLogsPanel GA + default true): each row is
//     a <div> with no implicit role; details are opened from a per-row kebab
//     IconButton with aria-label "Log menu" whose dropdown contains a
//     "Show log details" / "Hide log details" menu item.
//
// `openFirstLogRowDetails` below probes for the legacy row first and falls
// back to the new-panel flow.
// ---------------------------------------------------------------------------

const LOGS_PANEL_LOCATORS = {
  // Legacy <tr> row in LogRows: aria-label begins "See log details".
  legacyRowAriaLabel: /^See log details/i,
  // New panel per-row kebab IconButton (LogLineMenu.tsx): aria-label "Log menu".
  newPanelMenuLabel: /^Log menu$/i,
  // New panel dropdown item label (LogLineMenu.tsx); the fallback string in
  // the i18n call is "Show log details" when details are hidden.
  newPanelShowDetailsLabel: /^Show log details$/i,
  // Aria-label rendered on the + "Filter for value" IconButton in the
  // expanded details. Grafana scopes this by refId ("in query A") so we
  // match by substring. Same text in both panels.
  filterForLabel: /Filter for value/i,
};

/**
 * After switchToBuilderMode(page, QueryType.Logs), drive the database/table
 * and column-role Selects so the Logs builder points at e2e_test.events
 * with timestamp/message/level mapped to Time/Message/Log Level.
 *
 * The provisioned local datasource has no logs defaults — the builder
 * starts in the "unconfigured" state (a help note + empty Selects).
 */
async function configureBuilderLogsAgainstFixture(page: Page) {
  await pickBuilderSelect(page, 'Database', 'e2e_test');
  await pickBuilderSelect(page, 'Table', 'events');
  await pickBuilderSelect(page, 'Time', 'timestamp');
  await pickBuilderSelect(page, 'Message', 'message');
  await pickBuilderSelect(page, 'Log Level', 'level');
}

/**
 * Click Run Query, wait for the response, then expand the first log row in
 * the rendered Logs panel by clicking it.
 */
async function runQueryAndExpandFirstLogRow(page: Page, explorePage: ExplorePage) {
  const { responsePromise } = await waitForQueryDataResponseWithBody(explorePage);
  await runQuery(page);
  await responsePromise;
  await expandFirstLogRow(page);
}

/**
 * Open the first rendered log row's details so the +/- "Filter for/out value"
 * buttons appear. Works on both panels: probes the legacy <tr> first (cheap
 * if present), falls back to the new panel/LogList flow (kebab → menu item).
 */
async function openFirstLogRowDetails(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {});

  const legacyRow = page.getByRole('row', { name: LOGS_PANEL_LOCATORS.legacyRowAriaLabel }).first();

  if (await legacyRow.isVisible({ timeout: 2000 }).catch(() => false)) {
    const detailsButton = legacyRow.getByRole('button', { name: 'See log details' });
    await expect(detailsButton).toBeVisible();
    const expanded = (await detailsButton.getAttribute('aria-expanded')) === 'true';
    if (!expanded) {
      await detailsButton.click();
    }
    return;
  }

  // New panel/LogList (Grafana ≥12.4, newLogsPanel GA + default on).
  const firstLogMenu = page.getByRole('button', { name: LOGS_PANEL_LOCATORS.newPanelMenuLabel }).first();
  await expect(firstLogMenu).toBeVisible();
  await firstLogMenu.click();
  const showDetails = page.getByRole('menuitem', { name: LOGS_PANEL_LOCATORS.newPanelShowDetailsLabel });
  await expect(showDetails).toBeVisible();
  await showDetails.click();
}

/**
 * Builder-mode helper: open details and wait for the +/- buttons to render
 * before the test starts asserting on them.
 */
async function expandFirstLogRow(page: Page) {
  await openFirstLogRowDetails(page);
  await expect(filterForButton(page)).toBeVisible();
}

/**
 * Locate the + "Filter for value" IconButton in the expanded log details.
 *
 * The current Logs builder query exposes a single detail field (level), so
 * we target Grafana's per-refId aria-label directly. If a future test
 * exposes multiple detail fields and needs to disambiguate, scope this to
 * a parent row that contains both the field name text and the button.
 */
function filterForButton(page: Page): Locator {
  return page.getByRole('button', { name: LOGS_PANEL_LOCATORS.filterForLabel }).first();
}

// Minimal typed view of the /api/ds/query request body the tests drill into.
// Filters are kept as loose records because the plugin emits several filter
// shapes (key/operator/value plus optional hint) and the tests probe them
// field by field.
interface QueryRequestQuery {
  editorType?: string;
  rawSql?: string;
  builderOptions?: {
    filters?: Array<Record<string, unknown>>;
  };
}

interface QueryRequestBody {
  queries?: QueryRequestQuery[];
}

/**
 * Wait for the next /api/ds/query POST request AND its response, returning
 * the parsed request body.
 *
 * The request body directly verifies the plugin's toggleQueryFilter output
 * (filters[] mutation + rawSql regeneration). Awaiting the response too
 * ensures the panel has had a chance to start re-rendering before subsequent
 * interactions try to read the new state.
 */
async function waitForNextQueryRequestBody(page: Page): Promise<QueryRequestBody> {
  const requestPromise = page.waitForRequest((r) => r.url().includes('/api/ds/query') && r.method() === 'POST');
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/ds/query') && r.request().method() === 'POST' && r.ok()
  );
  const [req] = await Promise.all([requestPromise, responsePromise]);
  return JSON.parse(req.postData() || '{}') as QueryRequestBody;
}

function firstQueryFromBody(body: QueryRequestBody): QueryRequestQuery | undefined {
  const queries = body?.queries;
  return Array.isArray(queries) ? queries[0] : undefined;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Toggleable log filters in Explore', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => {
    skipFixtureTestsOnCloud('seed.sql');
  });

  test.describe('Builder mode (Logs)', () => {
    test.beforeEach(async ({ page, explorePage }) => {
      await page.goto(exploreUrl({ queryType: QueryType.Logs, from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
      await switchToBuilderMode(page, QueryType.Logs);
      await configureBuilderLogsAgainstFixture(page);
      await runQueryAndExpandFirstLogRow(page, explorePage);
    });

    // The single-click integration boundary: clicking + invokes the
    // plugin's toggleQueryFilter and the resulting CHQuery (with
    // regenerated rawSql) reaches the next /api/ds/query request.
    //
    // Behaviors NOT covered here:
    //   * Toggle-off / operator-swap: covered exhaustively by the 17 unit
    //     tests in src/data/CHDatasource.test.ts. Reproducing them in e2e
    //     would require chaining two toggles through a full panel re-render
    //     of Grafana's async Logs UI, which is reliably flaky.
    //   * queryHasFilter active-state highlighting: the aria-pressed
    //     attribute on the + button does flip after a filter is applied,
    //     but reading it requires re-expanding the row after a re-render
    //     — same flakiness. queryHasFilter is unit-tested directly, and
    //     the user-visible behavior is verified manually.
    test('FILTER_FOR adds an Equals filter on the level field', async ({ page }) => {
      const requestPromise = waitForNextQueryRequestBody(page);
      await filterForButton(page).click();
      const body = await requestPromise;

      const q = firstQueryFromBody(body);
      expect(q?.editorType).toBe('builder');

      const filters = q?.builderOptions?.filters ?? [];
      const levelFilter = filters.find(
        (f) => (f.key === 'level' || f.hint === 'log_level') && f.operator === '=' && String(f.value) === 'error'
      );
      expect(levelFilter, `expected an Equals filter for level=error, got: ${JSON.stringify(filters)}`).toBeTruthy();
      expect(String(q?.rawSql ?? '')).toMatch(/level\s*=\s*'error'/i);
    });
  });

  test.describe('SQL mode', () => {
    test('toggle does not modify a SQL-mode query (early return)', async ({ page, explorePage }) => {
      // Run a Logs-shaped SELECT in SQL mode. The Query Type radio defaults
      // to "Table" — explicitly select "Logs" so Grafana renders the result
      // as a Logs panel (with the +/- detail buttons we want to verify the
      // early-return for).
      await page.goto(exploreUrl({ queryType: QueryType.Logs, from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
      await page.getByRole('radio', { name: 'Logs', exact: true }).click();
      await runSqlAndGetBody(
        page,
        explorePage,
        'SELECT timestamp, level, message FROM e2e_test.events ORDER BY timestamp'
      );

      await openFirstLogRowDetails(page);

      // If Grafana hides the +/- buttons in SQL mode (it may, since the
      // toggle is a no-op), assert their absence and we're done.
      const filterFor = filterForButton(page);
      const buttonCount = await filterFor.count();
      if (buttonCount === 0) {
        return;
      }

      // Otherwise, click and assert the next request (if any) does not
      // mutate the rawSql / editorType — toggleQueryFilter must early-return
      // for SQL-mode queries.
      const requestPromise = waitForNextQueryRequestBody(page);
      await filterFor.click();
      const body = await Promise.race([
        requestPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);

      if (body === null) {
        // No follow-up query was issued — the early-return path works.
        return;
      }

      const q = firstQueryFromBody(body);
      expect(q?.editorType).toBe('sql');
      expect(String(q?.rawSql ?? '')).toMatch(/SELECT\s+timestamp,\s*level,\s*message/i);
      expect(String(q?.rawSql ?? '')).not.toMatch(/WHERE/i);
    });
  });
});
