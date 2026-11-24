// E2E coverage for Monaco autocomplete registration in the SQL editor. Unit
// tests cover the suggestion providers in isolation; only E2E confirms that
// remounting SqlEditor in the same document (toggling the editor type) does not
// re-register completion providers and duplicate every suggestion.

import { expect, test } from '@grafana/plugin-e2e';
import type { Page } from '@playwright/test';
import { DATASOURCE_UID, PLUGIN_TYPE, skipFixtureTestsOnCloud } from '../helpers/env';
import { exploreUrl } from '../helpers/explore';

/**
 * Type SQL and leave the Monaco suggest widget open. The shared enterSql
 * helper ends with an Escape press to dismiss the autocomplete popup, but
 * this spec asserts on that popup's contents, so it needs a local variant
 * without the dismissal.
 */
async function typeSqlLeavingSuggestionsOpen(page: Page, text: string) {
  const editor = page.getByRole('code');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(text);
}

// Plugin macros are static (defined in src/ch-parser/pluginMacros.ts) so they're
// a deterministic target across local fixture and Cloud cron runs.
async function captureMacroLabels(page: Page): Promise<string[]> {
  const widget = page.locator('.monaco-editor .suggest-widget.visible');
  // Assert rather than `waitFor`: web-first assertions read `expect.timeout` from
  // playwright.config.ts, which is already raised for Cloud runs. `waitFor` reads
  // `actionTimeout` instead, so it would need its own constant kept in sync.
  await expect(widget).toBeVisible();
  const labels = await page.locator('.monaco-editor .suggest-widget .monaco-list-row .label-name').allTextContents();
  return labels.map((l) => l.trim()).filter((l) => l.startsWith('$__'));
}

function findDuplicates(labels: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  labels.forEach((l) => (seen.has(l) ? dupes.add(l) : seen.add(l)));
  return [...dupes];
}

/**
 * Remount SqlEditor inside the same document by toggling the editor type.
 * registerSQL registers the completion provider against the global 'sql' language, so only
 * an in-document remount can leave a stale provider answering alongside the new one. A full
 * page navigation tears Monaco down with the rest of the document and always re-registers
 * cleanly, which is why it cannot catch a missing dispose.
 */
async function remountSqlEditor(page: Page) {
  // Close the open suggest widget so the next capture cannot read the previous one.
  await page.keyboard.press('Escape');

  await page.getByRole('radio', { name: 'Query Builder' }).click();
  // Grafana asks for confirmation when the SQL does not convert to builder options.
  const continueButton = page.getByRole('button', { name: 'Continue' });
  const needsConfirm = await continueButton
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (needsConfirm) {
    await continueButton.click();
  }
  await expect(page.getByRole('radio', { name: 'Query Builder' })).toBeChecked();

  await page.getByRole('radio', { name: 'SQL Editor' }).click();
  await expect(page.getByRole('radio', { name: 'SQL Editor' })).toBeChecked();
}

const VARIABLE_DASHBOARD_UID = 'e2e-sql-autocomplete-variable';

// Explore has no dashboard variables, so this suite edits the panel of a dashboard that has one.
test.describe('SQL editor autocomplete in a dashboard', () => {
  test.beforeEach(async ({ request }) => {
    skipFixtureTestsOnCloud('seed.sql');
    const datasource = { type: PLUGIN_TYPE, uid: DATASOURCE_UID };
    const dashboard = {
      uid: VARIABLE_DASHBOARD_UID,
      title: 'E2E SQL autocomplete variable',
      schemaVersion: 39,
      templating: { list: [{ type: 'custom', name: 'service', query: 'api,worker' }] },
      panels: [
        {
          id: 1,
          type: 'table',
          title: 'events',
          gridPos: { x: 0, y: 0, w: 24, h: 8 },
          datasource,
          targets: [{ refId: 'A', datasource, editorType: 'sql', format: 1, queryType: 'table', rawSql: '' }],
        },
      ],
    };
    const created = await request.post('/api/dashboards/db', { data: { dashboard, overwrite: true } });
    expect(created.ok()).toBe(true);
  });

  test.afterEach(async ({ request }) => {
    await request.delete(`/api/dashboards/uid/${VARIABLE_DASHBOARD_UID}`);
  });

  test('inserts a variable picked after `$` without repeating the `$`', async ({ page, gotoPanelEditPage }) => {
    const panelEditPage = await gotoPanelEditPage({ dashboard: { uid: VARIABLE_DASHBOARD_UID }, id: '1' });
    await typeSqlLeavingSuggestionsOpen(page, 'SELECT * FROM e2e_test.events WHERE service = $');
    await page
      .locator('.monaco-editor .suggest-widget.visible .monaco-list-row')
      .filter({ hasText: '${service}' })
      .click();

    // Monaco keeps the typed `$` in place, since it is a word separator, so the suggestion has to
    // insert only `{service}` after it.
    await expect(panelEditPage.getQueryEditorRow('A').locator('.view-line')).toHaveText([
      'SELECT * FROM e2e_test.events WHERE service = ${service}',
    ]);
  });
});

test.describe('SQL editor autocomplete', () => {
  test('does not duplicate suggestions after editor remount', async ({ page }) => {
    await page.goto(exploreUrl());
    // `$` is a registered trigger character; `$__` narrows the popup to plugin macros.
    await typeSqlLeavingSuggestionsOpen(page, 'SELECT * FROM t WHERE $__');

    const firstMountLabels = await captureMacroLabels(page);
    expect(firstMountLabels.length, 'first mount surfaces plugin macros').toBeGreaterThan(0);
    expect(findDuplicates(firstMountLabels), 'first mount has no duplicate macros').toEqual([]);

    await remountSqlEditor(page);
    await typeSqlLeavingSuggestionsOpen(page, 'SELECT * FROM t WHERE $__');

    const secondMountLabels = await captureMacroLabels(page);
    expect(findDuplicates(secondMountLabels), 'second mount has no duplicate macros').toEqual([]);
    expect(new Set(secondMountLabels)).toEqual(new Set(firstMountLabels));
  });
});
