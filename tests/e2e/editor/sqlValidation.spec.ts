// E2E coverage for SQL editor validation markers. Two checks run while the user types: the lexer
// check on each keystroke, and, once typing pauses, a check that asks ClickHouse to explain the
// query. Unit tests cover each verdict, but only E2E confirms the full wiring: keystrokes reach
// the handlers, the query check goes to the server and back, setModelMarkers() is called, and
// Monaco renders (or does not render) the red squiggles the user actually sees.

import { expect, test } from '@grafana/plugin-e2e';
import type { Page } from '@playwright/test';
import { isCloudRun } from '../helpers/env';
import { exploreUrl } from '../helpers/explore';
import { enterSql } from '../helpers/sqlEditor';

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

/** Resolves when the server has answered the query check for the text just typed. */
function queryCheckAnswered(page: Page) {
  return page.waitForResponse(
    (r) => r.url().includes('/api/ds/query') && (r.request().postData() ?? '').includes('-- grafana: query check')
  );
}

/** Types `sql` and waits for the server's verdict, so a marker it would cause has had its chance. */
async function enterSqlAndWaitForCheck(page: Page, sql: string) {
  const answered = queryCheckAnswered(page);
  await enterSql(page, sql);
  await answered;
  // The editor sets the markers right after the answer, and Monaco draws them on the next frame.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
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
  // The queries read the e2e_test tables, which the managed Cloud datasource doesn't have, so the
  // query check would mark every table there as unknown. Covered by local/PR CI.
  test.beforeEach(() => {
    test.skip(isCloudRun, 'The managed Cloud datasource has no e2e_test tables; covered by local/PR CI.');
  });

  // Real tables and columns, so the query check has nothing to mark either. FINAL on a plain
  // MergeTree table fails when it runs, but that error has no place in the text, so it is left to Run.
  // In Explore the ${service} variable is undefined, which the check skips rather than marks.
  const validClickhouseQueries: Array<{ name: string; sql: string }> = [
    { name: 'FINAL keyword', sql: 'SELECT * FROM e2e_test.events FINAL' },
    { name: 'PREWHERE clause', sql: "SELECT * FROM e2e_test.events PREWHERE value > 1 WHERE level = 'error'" },
    { name: 'ARRAY JOIN', sql: 'SELECT service, x FROM e2e_test.events ARRAY JOIN [1, 2] AS x' },
    { name: 'SETTINGS', sql: 'SELECT * FROM e2e_test.events SETTINGS max_rows_to_read = 1000' },
    {
      name: 'GLOBAL IN',
      sql: 'SELECT * FROM e2e_test.events WHERE service GLOBAL IN (SELECT service FROM e2e_test.events)',
    },
    {
      name: 'ASOF JOIN',
      sql: 'SELECT a.service FROM e2e_test.events AS a ASOF JOIN e2e_test.events AS b ON a.service = b.service AND a.timestamp >= b.timestamp',
    },
    { name: ':: cast operator', sql: "SELECT '2024-01-01'::DateTime FROM e2e_test.events" },
    { name: 'Grafana $__timeFilter macro', sql: 'SELECT * FROM e2e_test.events WHERE $__timeFilter(timestamp)' },
    { name: 'Grafana ${variable} template', sql: 'SELECT * FROM e2e_test.events WHERE service = ${service}' },
  ];

  for (const { name, sql } of validClickhouseQueries) {
    test(`does not flag ${name} as invalid`, async ({ page }) => {
      await page.goto(exploreUrl());
      await enterSqlAndWaitForCheck(page, sql);
      await expectNoErrorMarkers(page);
    });
  }

  test('marks a missing comma before the query runs', async ({ page }) => {
    await page.goto(exploreUrl());
    await enterSqlAndWaitForCheck(page, 'SELECT service count() AS n FROM e2e_test.events GROUP BY service');
    await expectHasErrorMarker(page);
  });

  test('marks an unknown column before the query runs', async ({ page }) => {
    await page.goto(exploreUrl());
    await enterSqlAndWaitForCheck(page, 'SELECT services FROM e2e_test.events');
    await expectHasErrorMarker(page);
  });

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
