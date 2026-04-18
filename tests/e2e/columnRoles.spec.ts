import { expect, test } from '@grafana/plugin-e2e';
import { Locator, Page } from '@playwright/test';
import { QueryType } from '../../src/types/queryBuilder';
import { Components as Selectors } from '../../src/selectors';

// Matches the uid set in provisioning/datasources/clickhouse.yml
const DATASOURCE_UID = 'clickhouse-e2e';
const PLUGIN_TYPE = 'grafana-clickhouse-datasource';

// Doc anchor the help link points to; kept in sync with labels.ts.
const COLUMN_ROLES_DOCS_PATH = '/docs/plugins/grafana-clickhouse-datasource/latest/query-editor/#column-roles';

interface ExploreUrlOpts {
  queryType?: QueryType;
}

/**
 * Build an Explore URL that preselects a query type. The editor still opens
 * in SQL Editor mode on load (Grafana does not restore editorType from the
 * URL pane state for this plugin); tests that need the Query Builder must
 * call switchToBuilderMode after navigation.
 */
function exploreUrl(opts: ExploreUrlOpts = {}): string {
  const { queryType = QueryType.Table } = opts;

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
      range: { from: 'now-1h', to: 'now' },
    },
  });

  return `/explore?orgId=1&schemaVersion=1&panes=${encodeURIComponent(panes)}`;
}

/**
 * Switch from the default SQL Editor mode into Query Builder. Dismisses the
 * "Cannot convert" confirmation that appears when the SQL body is empty or
 * not a plain SELECT. Grafana does not restore `queryType` from Explore's pane
 * state, and switching editor types resets the query type to "Table"; callers
 * that need Logs / Traces / Time Series must pass `queryType` so we re-select
 * it after the mode switch.
 */
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

/**
 * Map a QueryType to the human-readable label used by the Query Type radio
 * group. Kept near switchToBuilderMode so both the selection and assertion use
 * the same string.
 */
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

/**
 * Returns the InlineFormLabel element that renders a given column selector
 * label. Grafana renders these as `<label class="query-keyword">` with the
 * label text as a child text node.
 */
function labelLocator(page: Page, labelText: string): Locator {
  return page.locator('label.query-keyword', { hasText: labelText });
}

/**
 * Hover the info-icon tooltip inside a label and return its popover text.
 * Grafana's InlineFormLabel renders the tooltip as a Popper child with
 * role="tooltip"; Playwright can target it once the hover has fired.
 */
async function readTooltip(page: Page, label: Locator): Promise<string> {
  // The icon is rendered inside the label; hovering the label surfaces the tooltip
  // in all current @grafana/ui versions we support.
  await label.locator('svg').first().hover();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  return (await tooltip.textContent()) ?? '';
}

test.describe('Column roles guidance', () => {
  test.describe('Logs query builder', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(exploreUrl({ queryType: QueryType.Logs }));
      await switchToBuilderMode(page, QueryType.Logs);
    });

    test('renders the column-roles help note with a docs link', async ({ page }) => {
      const help = page.getByTestId(Selectors.QueryBuilder.LogsQueryBuilder.columnRolesHelp);
      await expect(help).toBeVisible();
      await expect(help).toContainText('column roles', { ignoreCase: true });

      const link = page.getByTestId(Selectors.QueryBuilder.LogsQueryBuilder.columnRolesHelpLink);
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', COLUMN_ROLES_DOCS_PATH);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', /noreferrer/);
    });

    test('Time column tooltip explains the `timestamp` SQL alias', async ({ page }) => {
      const text = await readTooltip(page, labelLocator(page, 'Time'));
      expect(text.toLowerCase()).toContain('timestamp');
      expect(text.toLowerCase()).toContain('aliased to');
    });

    test('Message column tooltip explains the `body` SQL alias', async ({ page }) => {
      const text = await readTooltip(page, labelLocator(page, 'Message'));
      expect(text.toLowerCase()).toContain('body');
      expect(text.toLowerCase()).toContain('log message');
    });

    test('Log Level column tooltip explains the `level` SQL alias', async ({ page }) => {
      const text = await readTooltip(page, labelLocator(page, 'Log Level'));
      expect(text.toLowerCase()).toContain('level');
      expect(text.toLowerCase()).toContain('severity');
    });
  });

  test.describe('Traces query builder', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(exploreUrl({ queryType: QueryType.Traces }));
      await switchToBuilderMode(page, QueryType.Traces);
      // The Columns section is collapsible; make sure it's open before we assert.
      // If it's already open the header click is a no-op (toggles closed, then we re-open).
      const columnsHeader = page.getByRole('button', { name: 'Columns' });
      if (await columnsHeader.isVisible().catch(() => false)) {
        const helpVisible = await page
          .getByTestId(Selectors.QueryBuilder.TraceQueryBuilder.columnRolesHelp)
          .isVisible()
          .catch(() => false);
        if (!helpVisible) {
          await columnsHeader.click();
        }
      }
    });

    test('renders the column-roles help note with a docs link', async ({ page }) => {
      const help = page.getByTestId(Selectors.QueryBuilder.TraceQueryBuilder.columnRolesHelp);
      await expect(help).toBeVisible();
      await expect(help).toContainText('column roles', { ignoreCase: true });

      const link = page.getByTestId(Selectors.QueryBuilder.TraceQueryBuilder.columnRolesHelpLink);
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', COLUMN_ROLES_DOCS_PATH);
    });

    test('Trace ID column tooltip explains the `traceID` SQL alias', async ({ page }) => {
      const text = await readTooltip(page, labelLocator(page, 'Trace ID Column'));
      expect(text).toContain('traceID');
      expect(text.toLowerCase()).toContain('aliased to');
    });

    test('Span ID column tooltip explains the `spanID` SQL alias', async ({ page }) => {
      const text = await readTooltip(page, labelLocator(page, 'Span ID Column'));
      expect(text).toContain('spanID');
    });

    test('Duration Time column tooltip mentions the unit setting', async ({ page }) => {
      const text = await readTooltip(page, labelLocator(page, 'Duration Time Column'));
      expect(text.toLowerCase()).toContain('duration');
      expect(text.toLowerCase()).toContain('unit');
    });
  });

  test.describe('Time series query builder', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(exploreUrl({ queryType: QueryType.TimeSeries }));
      await switchToBuilderMode(page, QueryType.TimeSeries);
    });

    test('renders the column-roles help note with a docs link', async ({ page }) => {
      const help = page.getByTestId(Selectors.QueryBuilder.TimeSeriesQueryBuilder.columnRolesHelp);
      await expect(help).toBeVisible();
      await expect(help).toContainText('Time column is required');

      const link = page.getByTestId(Selectors.QueryBuilder.TimeSeriesQueryBuilder.columnRolesHelpLink);
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', COLUMN_ROLES_DOCS_PATH);
    });

    test('Time column tooltip describes DateTime/DateTime64 requirement', async ({ page }) => {
      const text = await readTooltip(page, labelLocator(page, 'Time'));
      expect(text).toContain('DateTime');
      expect(text.toLowerCase()).toContain('order and bucket');
    });
  });

  test.describe('Table query builder', () => {
    // The Table query type has no column roles; verify the help note is NOT rendered there
    // so the guidance doesn't leak into unrelated UI.
    test('does not render any column-roles help note', async ({ page }) => {
      await page.goto(exploreUrl({ queryType: QueryType.Table }));
      await switchToBuilderMode(page);
      await expect(page.getByTestId(Selectors.QueryBuilder.LogsQueryBuilder.columnRolesHelp)).toHaveCount(0);
      await expect(page.getByTestId(Selectors.QueryBuilder.TraceQueryBuilder.columnRolesHelp)).toHaveCount(0);
      await expect(page.getByTestId(Selectors.QueryBuilder.TimeSeriesQueryBuilder.columnRolesHelp)).toHaveCount(0);
    });
  });
});
