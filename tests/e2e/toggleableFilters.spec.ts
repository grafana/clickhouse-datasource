import { expect, test, ExplorePage } from '@grafana/plugin-e2e';
import { Locator, Page, Request } from '@playwright/test';
import { QueryType } from '../../src/types/queryBuilder';

const PLUGIN_TYPE = 'grafana-clickhouse-datasource';

const isCloudRun = !!process.env.GRAFANA_URL;

const CLOUD_DEFAULT_UID = 'clickhouse-native-ds-m';
const LOCAL_DEFAULT_UID = 'clickhouse-e2e';
const DATASOURCE_UID = process.env.DS_E2E_UID || (isCloudRun ? CLOUD_DEFAULT_UID : LOCAL_DEFAULT_UID);

// Time range that fully covers the seed fixture data in tests/e2e/fixtures/seed.sql
const FIXTURE_FROM_ISO = '2024-03-15T09:45:00.000Z';
const FIXTURE_TO_ISO = '2024-03-15T10:15:00.000Z';

// ---------------------------------------------------------------------------
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

interface ExploreUrlOpts {
  queryType?: QueryType;
  from?: string;
  to?: string;
}

function exploreUrl(opts: ExploreUrlOpts = {}): string {
  const { queryType = QueryType.Logs, from = FIXTURE_FROM_ISO, to = FIXTURE_TO_ISO } = opts;

  const query: Record<string, unknown> = {
    refId: 'A',
    datasource: { type: PLUGIN_TYPE, uid: DATASOURCE_UID },
    editorType: 'sql',
    pluginVersion: '',
    rawSql: '',
    queryType,
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

async function switchToBuilderMode(page: Page, queryType?: QueryType) {
  await page.getByRole('radio', { name: 'Query Builder' }).click();
  const continueButton = page.getByRole('button', { name: 'Continue' });
  if (await continueButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await continueButton.click();
  }
  await expect(page.getByRole('radio', { name: 'Query Builder' })).toBeChecked();

  if (queryType && queryType !== QueryType.Table) {
    const label = queryTypeRadioLabel(queryType);
    await page.getByRole('radio', { name: label, exact: true }).click();
    await expect(page.getByRole('radio', { name: label, exact: true })).toBeChecked();
  }
}

function queryTypeRadioLabel(queryType: QueryType): string {
  switch (queryType) {
    case QueryType.Logs:
      return 'Logs';
    case QueryType.TimeSeries:
      return 'Time Series';
    case QueryType.Traces:
      return 'Traces';
    default:
      return 'Table';
  }
}

async function enterSql(page: Page, sql: string) {
  const editor = page.getByRole('code');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(sql);
  await page.keyboard.press('Escape');
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

/**
 * After switchToBuilderMode(page, QueryType.Logs), drive the database/table
 * and column-role Selects so the Logs builder points at e2e_test.events
 * with timestamp/message/level mapped to Time/Message/Log Level.
 *
 * The provisioned local datasource has no logs defaults — the builder
 * starts in the "unconfigured" state (a help note + empty Selects). All
 * Selects rendered by the plugin sit inside a `<label class="query-keyword">`
 * with the role label as text; the Select itself is the immediately
 * following sibling.
 */
async function configureBuilderLogsAgainstFixture(page: Page) {
  await pickComboboxByLabel(page, 'Database', 'e2e_test');
  await pickComboboxByLabel(page, 'Table', 'events');
  await pickComboboxByLabel(page, 'Time', 'timestamp');
  await pickComboboxByLabel(page, 'Message', 'message');
  await pickComboboxByLabel(page, 'Log Level', 'level');
}

/**
 * Locate the Select container immediately after a `<label class="query-keyword">`
 * whose text matches `labelText` exactly.
 *
 * Several labels share the prefix "Time" (e.g. "Filter Time", "Order By"
 * subsections), so we anchor with a regex to avoid `.first()` selecting an
 * unrelated label.
 */
function roleContainer(page: Page, labelText: string): Locator {
  return page
    .locator('label.query-keyword', { hasText: new RegExp(`^${labelText}$`) })
    .first()
    .locator('xpath=following-sibling::*[1]');
}

/**
 * Open the Select rendered immediately after a `<label class="query-keyword">`
 * whose text matches `labelText` exactly, type the value to filter the
 * option list, and commit the selection with Enter.
 *
 * The Database/Table pair lives inside a single parent row, so we cannot rely
 * on `xpath=..` + `.first()` (it would always hit the Database combobox).
 * Targeting the label's immediate following sibling is robust for both the
 * single-column rows (Time, Message, Log Level) and the shared-row pairs.
 */
async function pickComboboxByLabel(page: Page, labelText: string, value: string) {
  const combobox = roleContainer(page, labelText).getByRole('combobox').first();
  await combobox.click();
  await page.keyboard.type(value);
  await page.keyboard.press('Enter');
  // Close any lingering option list before the next interaction.
  await page.keyboard.press('Escape');
}

/**
 * Click Run Query, wait for the response, then expand the first log row in
 * the rendered Logs panel by clicking it.
 */
async function runQueryAndExpandFirstLogRow(page: Page, explorePage: ExplorePage) {
  const { responsePromise } = await waitForQueryDataResponseWithBody(explorePage);
  await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();
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

/**
 * Wait for the next /api/ds/query POST request AND its response, returning
 * the parsed request body.
 *
 * The request body directly verifies the plugin's toggleQueryFilter output
 * (filters[] mutation + rawSql regeneration). Awaiting the response too
 * ensures the panel has had a chance to start re-rendering before subsequent
 * interactions try to read the new state.
 */
async function waitForNextQueryRequestBody(page: Page): Promise<any> {
  const requestPromise = page.waitForRequest((r) => r.url().includes('/api/ds/query') && r.method() === 'POST');
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/ds/query') && r.request().method() === 'POST' && r.ok()
  );
  const [req] = await Promise.all([requestPromise, responsePromise]);
  return JSON.parse(req.postData() || '{}');
}

function firstQueryFromBody(body: any): any {
  const queries = body?.queries;
  return Array.isArray(queries) ? queries[0] : undefined;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('DataSourceWithToggleableQueryFiltersSupport (HDX-3540)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => {
    test.skip(
      isCloudRun,
      'Fixture-data tests depend on e2e_test.events seeded by tests/e2e/fixtures/seed.sql via the local e2e-data-loader Docker service, which is not available on Cloud.'
    );
  });

  test.describe('Builder mode (Logs)', () => {
    test.beforeEach(async ({ page, explorePage }) => {
      await page.goto(exploreUrl({ queryType: QueryType.Logs }));
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

      const filters: any[] = q?.builderOptions?.filters ?? [];
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
      await page.goto(exploreUrl({ queryType: QueryType.Logs }));
      await page.getByRole('radio', { name: 'Logs', exact: true }).click();
      await enterSql(page, 'SELECT timestamp, level, message FROM e2e_test.events ORDER BY timestamp');
      const { responsePromise } = await waitForQueryDataResponseWithBody(explorePage);
      await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();
      await responsePromise;

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
