// E2E coverage for SQL editor validation markers. Unit tests cover the
// validator's verdict on individual statements, but only E2E confirms the
// full wiring: user keystrokes reach the onKeyUp handler, validate() runs,
// setModelMarkers() is called, and Monaco renders (or does not render) the
// red squiggles the user actually sees.

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
  // The managed Cloud datasource does not enable `validateSql`, so SqlEditor's validation
  // pipeline (onKeyUp -> validate() -> setModelMarkers -> Monaco) never runs there: the
  // "no false positive" cases pass vacuously and the genuine-error control case fails for
  // want of a marker. The suite is only meaningful where validateSql is enabled — local/PR
  // CI, where provisioning/datasources/clickhouse.yml sets validateSql: true.
  test.beforeEach(() => {
    test.skip(
      isCloudRun,
      'validateSql is disabled on the managed Cloud datasource, making this suite inert; covered by local/PR CI.'
    );
  });

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
