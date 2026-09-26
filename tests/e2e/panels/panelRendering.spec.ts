import { expect, test, PanelEditPage } from '@grafana/plugin-e2e';
import type { Page } from '@playwright/test';
import { QueryType } from '../../../src/types/queryBuilder';
import { queryTypeRadioLabel } from '../helpers/builder';
import { FIXTURE_FROM_ISO, FIXTURE_TO_ISO, skipFixtureTestsOnCloud } from '../helpers/env';
import { exploreUrl } from '../helpers/explore';
import { QueryDataBody, frameFields, rowCount, waitForQueryDataResponseWithBody } from '../helpers/queryResponse';
import { enterSql, runQuery } from '../helpers/sqlEditor';

// Rendered-visualization coverage. Every other fixture suite asserts on the
// parsed /api/ds/query response body, so a frame-shape regression that still
// returns HTTP 200 but breaks what Grafana draws (a broken long-to-wide
// conversion, a mis-mapped format, wrong field types) would pass all of them.
// These tests drive the panel editor and Explore and assert on what actually
// renders: the chart canvas, table column headers and cell values, and which
// Explore section (Graph vs Table) the response lands in.

// Name of the locally provisioned datasource (provisioning/datasources/
// clickhouse.yml). The panel editor's datasource picker selects by name, not
// uid; the picker types the name and picks the first match, which is the
// exact-named entry. These tests are local-only (fixture data), so the Cloud
// uid naming convention does not apply.
const LOCAL_DATASOURCE_NAME = 'ClickHouse';

// seed.sql inserts exactly 10 rows into e2e_test.events, one per minute from
// 10:00 to 10:09 UTC, spread across these five services.
const SEEDED_SERVICES = ['api', 'worker', 'cache', 'scheduler', 'db'];
const SEEDED_ROW_COUNT = 10;

// None of the SQL below uses time macros, so the panel time range only affects
// the visible plot window, never the returned rows (matching the other fixture
// suites). The range is still pinned to the fixture window, via the time
// picker or the Explore URL, so the drawn series falls inside the viewport.
const SINGLE_SERIES_SQL =
  'SELECT toStartOfMinute(timestamp) AS time, avg(value) AS avg_value FROM e2e_test.events GROUP BY time ORDER BY time';
const MULTI_SERIES_SQL =
  'SELECT toStartOfMinute(timestamp) AS time, service, avg(value) AS avg_value FROM e2e_test.events GROUP BY time, service ORDER BY time';
const TABLE_SQL = 'SELECT timestamp, level, message, value, service FROM e2e_test.events ORDER BY timestamp';

// Minimal view of the outgoing /api/ds/query request body, used to assert the
// format value the frontend sends to the backend.
interface DsQueryRequestBody {
  queries?: Array<{ refId?: string; format?: number }>;
}

/**
 * enterSql clicks, select-alls, then types. Monaco can grab focus a frame
 * after the click, so under load the select-all occasionally misses while
 * the typed characters still reach the editor, leaving the typed SQL
 * appended to whatever was already there (in the panel editor, the
 * generated "SELECT FROM LIMIT 1000" pre-fill) and producing a syntax
 * error. Verify the editor holds exactly the intended SQL via Monaco's
 * accessibility textarea and retry the whole click/select/type sequence
 * otherwise.
 */
async function enterSqlVerified(page: Page, sql: string) {
  const editorContent = page.getByRole('code').getByRole('textbox');
  await expect(async () => {
    await enterSql(page, sql);
    await expect(editorContent).toHaveValue(sql, { timeout: 1000 });
  }).toPass({ timeout: 15000 });
}

/**
 * A new panel query has no editorType yet, so the ClickHouse editor opens in
 * Query Builder mode (defaultEditorType in src/types/sql.ts). Switch to the
 * SQL Editor and optionally re-select a query type. Builder to SQL never shows
 * the "Cannot convert" confirmation, so no dialog handling is needed here.
 */
async function switchPanelEditorToSql(page: Page, queryType?: QueryType) {
  // The switcher being checked confirms the plugin query editor has mounted.
  await expect(page.getByRole('radio', { name: 'Query Builder' })).toBeChecked();
  await page.getByRole('radio', { name: 'SQL Editor' }).click();
  await expect(page.getByRole('radio', { name: 'SQL Editor' })).toBeChecked();

  // The switch regenerates rawSql from the builder options (an empty builder
  // yields "SELECT FROM LIMIT 1000") and Monaco mounts with that value
  // asynchronously. enterSql select-alls before typing, so wait for the
  // pre-fill to land first, otherwise the select-all can run against a
  // still-empty editor and the pre-fill later concatenates with the typed
  // SQL, producing a syntax error.
  await expect(page.getByRole('code')).toContainText('SELECT');

  if (queryType !== undefined && queryType !== QueryType.Table) {
    // Selecting the query type before typing SQL means the query's format is
    // already mapped via mapQueryTypeToGrafanaFormat when the editor saves the
    // typed SQL on blur.
    const label = queryTypeRadioLabel(queryType);
    await page.getByRole('radio', { name: label, exact: true }).click();
    await expect(page.getByRole('radio', { name: label, exact: true })).toBeChecked();
  }
}

/**
 * Refresh the panel and capture the parsed /api/ds/query body. The default
 * refreshPanel predicate matches any query response, which can race with the
 * SQL editor's autocomplete metadata queries (those use random refIds), so
 * this predicate additionally requires an OK response with frames for refId A.
 * Mirrors helpers/queryResponse.ts, which only wraps the Explore page model.
 */
async function refreshPanelAndGetBody(
  panelEditPage: PanelEditPage,
  queryEndpoint: string
): Promise<QueryDataBody | null> {
  let body: QueryDataBody | null = null;
  await panelEditPage.refreshPanel({
    waitForResponsePredicateCallback: async (r) => {
      if (!r.url().includes(queryEndpoint) || !r.ok()) {
        return false;
      }
      const b = (await r.json().catch(() => null)) as QueryDataBody | null;
      if (!Array.isArray(b?.results?.['A']?.frames)) {
        return false;
      }
      body = b;
      return true;
    },
  });
  return body;
}

test.describe('Panel rendering', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => {
    skipFixtureTestsOnCloud('seed.sql');
  });

  test.describe('Panel editor', () => {
    test('time series panel draws bucketed averages without a panel error', async ({
      page,
      panelEditPage,
      selectors,
    }) => {
      await panelEditPage.datasource.set(LOCAL_DATASOURCE_NAME);
      await panelEditPage.setVisualization('Time series');
      // ISO strings ending in Z are parsed as UTC by the time picker input, so
      // the plotted window stays aligned with the fixture regardless of the
      // local timezone of the machine running the tests.
      await panelEditPage.timeRange.set({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO });
      await switchPanelEditorToSql(page, QueryType.TimeSeries);
      await enterSqlVerified(page, SINGLE_SERIES_SQL);

      const body = await refreshPanelAndGetBody(panelEditPage, selectors.apis.DataSource.query);
      // One avg(value) bucket per seeded minute: 10 rows, fields time + avg_value.
      expect(rowCount(body)).toBe(SEEDED_ROW_COUNT);
      expect(frameFields(body)).toHaveLength(2);

      await expect(panelEditPage.panel.getErrorIcon()).not.toBeVisible();
      // The time series visualization paints onto a canvas element; its
      // presence distinguishes a drawn chart from an empty or errored panel.
      await expect(panelEditPage.panel.locator.locator('canvas').first()).toBeVisible();
    });

    test('time series panel renders one series per service (#735)', async ({ page, panelEditPage, selectors }) => {
      await panelEditPage.datasource.set(LOCAL_DATASOURCE_NAME);
      await panelEditPage.setVisualization('Time series');
      await panelEditPage.timeRange.set({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO });
      await switchPanelEditorToSql(page, QueryType.TimeSeries);
      await enterSqlVerified(page, MULTI_SERIES_SQL);

      const body = await refreshPanelAndGetBody(panelEditPage, selectors.apis.DataSource.query);
      // The time series format triggers the backend long-to-wide conversion:
      // one time field plus one labelled avg_value field per seeded service.
      expect(frameFields(body)).toHaveLength(1 + SEEDED_SERVICES.length);

      await expect(panelEditPage.panel.getErrorIcon()).not.toBeVisible();
      await expect(panelEditPage.panel.locator.locator('canvas').first()).toBeVisible();

      // The legend renders one entry per drawn series, each tagged with the
      // versioned VizLegend series test id for its field display name
      // ("avg_value api" and so on). Guards the historic multi-line rendering
      // fix (#735, #739): a regression back to a long frame would collapse
      // the legend into a single avg_value series. Table view headers are not
      // a usable anchor here: the Grafana 12 table is a virtualized grid, so
      // columns that overflow the panel width are absent from the DOM and a
      // columnheader count undercounts the series.
      const legendSeriesPrefix = selectors.components.VizLegend.seriesName('');
      await expect(panelEditPage.panel.locator.getByTestId(new RegExp(`^${legendSeriesPrefix}`))).toHaveCount(
        SEEDED_SERVICES.length
      );
      for (const service of SEEDED_SERVICES) {
        await expect(
          panelEditPage.panel.locator.getByTestId(selectors.components.VizLegend.seriesName(`avg_value ${service}`))
        ).toBeVisible();
      }
    });

    test('table query renders fixture columns and values in table view', async ({ page, panelEditPage, selectors }) => {
      await panelEditPage.datasource.set(LOCAL_DATASOURCE_NAME);
      // No time range or visualization setup needed: the SQL has no time
      // filter and the table view toggle renders raw frame data regardless of
      // the selected visualization. The query type stays Table (the default),
      // which maps to the table format.
      await switchPanelEditorToSql(page);
      await enterSqlVerified(page, TABLE_SQL);

      const body = await refreshPanelAndGetBody(panelEditPage, selectors.apis.DataSource.query);
      // seed.sql inserts exactly 10 rows into e2e_test.events.
      expect(rowCount(body)).toBe(SEEDED_ROW_COUNT);

      await panelEditPage.toggleTableView();
      await expect(panelEditPage.panel.fieldNames).toContainText(['timestamp', 'level', 'message']);
      // Two seeded messages in timestamp order (10:03 worker warn, 10:04 worker error).
      await expect(panelEditPage.panel.data).toContainText(['High memory usage', 'Connection timeout']);
    });
  });

  test.describe('Explore format mapping', () => {
    test('Time Series query type renders the Graph section, not the Table section', async ({ page, explorePage }) => {
      await page.goto(exploreUrl({ queryType: QueryType.TimeSeries, from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
      // The query type cannot be restored from the URL pane state in SQL
      // mode: exploreUrl writes pluginVersion '' into the query, which
      // migrateCHQuery (src/data/migration.ts) treats as a pre-4.0 query and
      // rederives queryType from the absent format field, resetting it to
      // Table. Select the query type through the UI instead, matching the
      // other Explore suites. The click drives the same SqlEditor
      // saveChanges path that maps queryType to the outgoing format.
      await page.getByRole('radio', { name: 'Time Series', exact: true }).click();
      await expect(page.getByRole('radio', { name: 'Time Series', exact: true })).toBeChecked();

      const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
      await enterSqlVerified(page, MULTI_SERIES_SQL);
      await runQuery(page);
      const response = await responsePromise;

      // Regression guard for mapQueryTypeToGrafanaFormat (src/data/utils.ts):
      // the Time Series query type must reach the backend as format 0. The
      // backend keys both the long-to-wide conversion and the frame's
      // preferred visualization on it, so a mis-mapping silently degrades a
      // grouped time series into a table result while still returning 200.
      const requestBody = response.request().postDataJSON() as DsQueryRequestBody | null;
      expect(requestBody?.queries?.find((q) => q.refId === 'A')?.format).toBe(0);

      // The response frame is already wide: one time field plus one avg_value
      // field per seeded service. A long (table format) frame would carry
      // three fields (time, service, avg_value) instead.
      expect(frameFields(getBody())).toHaveLength(1 + SEEDED_SERVICES.length);

      // Explore routes frames on meta.preferredVisualizationType: graph frames
      // render only in the Graph section, so the Table section must be absent.
      await expect(explorePage.timeSeriesPanel.locator).toBeVisible();
      await expect(explorePage.tablePanel.locator).toHaveCount(0);
    });
  });
});
