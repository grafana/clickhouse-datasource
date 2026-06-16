import { expect, test } from '@grafana/plugin-e2e';
import { Page } from '@playwright/test';

const PLUGIN_TYPE = 'grafana-clickhouse-datasource';

// GRAFANA_URL is set only by the Cloud cron workflow (see .github/workflows/cron.yml).
const isCloudRun = !!process.env.GRAFANA_URL;

// CLOUD_DEFAULT_UID points at `[managed_data_source] - ClickHouse Native (PDC)` on the
// shared Cloud dev instance. The infra team uses a stable `clickhouse-{protocol}-ds-m`
// naming convention, but if the datasource is ever re-provisioned and Cloud E2E starts
// failing with datasource-not-found errors, log into the instance, copy the current uid
// from the /connections/datasources/edit/<uid> URL, and update this constant (or set
// DS_E2E_UID in the workflow as a quick override).
const CLOUD_DEFAULT_UID = 'clickhouse-native-ds-m';
const LOCAL_DEFAULT_UID = 'clickhouse-e2e';
const DATASOURCE_UID = process.env.DS_E2E_UID || (isCloudRun ? CLOUD_DEFAULT_UID : LOCAL_DEFAULT_UID);

/**
 * Build an Explore URL with an empty SQL query so the editor opens in
 * SQL Editor mode with no pre-existing content.
 */
function exploreUrl(): string {
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
      range: { from: 'now-1h', to: 'now' },
    },
  });

  return `/explore?orgId=1&schemaVersion=1&panes=${encodeURIComponent(panes)}`;
}

/**
 * Type SQL into the Monaco editor. Clicks to focus, selects all existing
 * content, then types the replacement query. Each keystroke triggers the
 * editor's onKeyUp handler, which runs validate() and writes Monaco markers.
 */
async function enterSql(page: Page, sql: string) {
  const editor = page.getByRole('code');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(sql);
}

/**
 * Monaco renders validation errors by adding the `squiggly-error` CSS class
 * to inline decoration spans under the offending tokens. Counting instances
 * of that class gives a DOM-level read of what the user sees.
 *
 * The typed SQL is committed synchronously but Monaco schedules decoration
 * rendering on the next animation frame, so we give it a brief moment before
 * asserting.
 */
async function expectNoErrorMarkers(page: Page) {
  await expect(async () => {
    await expect(page.locator('.squiggly-error')).toHaveCount(0);
  }).toPass({ timeout: 2000 });
}

async function expectHasErrorMarker(page: Page) {
  await expect(page.locator('.squiggly-error').first()).toBeVisible({ timeout: 2000 });
}

/**
 * Regression guard for the js-sql-parser false-positive bug: that parser flagged
 * valid ClickHouse-specific syntax (FINAL, PREWHERE, ARRAY JOIN, SETTINGS,
 * ASOF JOIN, :: cast, etc.) as errors, producing red squiggles in the SQL editor
 * whenever `validateSql` was enabled. This suite exercises the full wiring —
 * user types SQL → onKeyUp → validate() → setModelMarkers() → Monaco renders — so
 * if anyone re-introduces a parser that misidentifies these constructs, the
 * regression shows up as a failing test here rather than as a user complaint.
 */
test.describe('SQL editor validation', () => {
  const validClickhouseQueries: Array<{ name: string; sql: string }> = [
    { name: 'FINAL keyword', sql: 'SELECT * FROM test.events FINAL' },
    { name: 'PREWHERE clause', sql: 'SELECT * FROM t PREWHERE x > 1 WHERE y > 2' },
    { name: 'ARRAY JOIN', sql: 'SELECT * FROM t ARRAY JOIN arr' },
    { name: 'SETTINGS', sql: 'SELECT * FROM t SETTINGS max_rows_to_read = 1000' },
    { name: 'GLOBAL IN', sql: 'SELECT * FROM t WHERE id GLOBAL IN (SELECT id FROM t2)' },
    { name: 'ASOF JOIN', sql: 'SELECT * FROM t1 ASOF JOIN t2 ON t1.id = t2.id' },
    { name: ':: cast operator', sql: "SELECT '2024-01-01'::DateTime FROM t" },
    { name: 'Grafana $__timeFilter macro', sql: 'SELECT * FROM t WHERE $__timeFilter(timestamp)' },
    { name: 'Grafana ${variable} template', sql: 'SELECT * FROM t WHERE service = ${service}' },
  ];

  for (const { name, sql } of validClickhouseQueries) {
    test(`does not flag ${name} as invalid`, async ({ page }) => {
      await page.goto(exploreUrl());
      await enterSql(page, sql);
      await expectNoErrorMarkers(page);
    });
  }

  // Control test: without this, all the positive assertions above would still
  // pass if validation were silently disabled (no validator → no markers). This
  // confirms the editor → validator → Monaco marker pipeline is actually wired.
  //
  // We use an unclosed `/*` block comment rather than an unclosed string, because
  // Monaco's auto-close-bracket feature inserts a matching `'` as you type, which
  // defeats the unclosed-string case.
  test('flags a genuine error (unclosed block comment)', async ({ page }) => {
    await page.goto(exploreUrl());
    await enterSql(page, 'SELECT * FROM t /* unclosed comment');
    await expectHasErrorMarker(page);
  });
});
