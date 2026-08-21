// E2E coverage for Monaco autocomplete registration in the SQL editor. Unit
// tests cover the suggestion providers in isolation; only E2E confirms that
// remounting SqlEditor (navigating away from Explore and back) does not
// re-register completion providers and duplicate every suggestion.

import { expect, test } from '@grafana/plugin-e2e';
import type { Page } from '@playwright/test';
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
  // 15s ceiling rather than the 5s default: on the shared Cloud instance each
  // test's fresh browser context re-downloads the Monaco assets, and the widget
  // repeatedly took longer than 5s on the nightly cron (fails through retries).
  await widget.waitFor({ timeout: 15_000 });
  const labels = await page.locator('.monaco-editor .suggest-widget .monaco-list-row .label-name').allTextContents();
  return labels.map((l) => l.trim()).filter((l) => l.startsWith('$__'));
}

function findDuplicates(labels: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  labels.forEach((l) => (seen.has(l) ? dupes.add(l) : seen.add(l)));
  return [...dupes];
}

test.describe('SQL editor autocomplete', () => {
  test('does not duplicate suggestions after editor remount', async ({ page }) => {
    await page.goto(exploreUrl());
    // `$` is a registered trigger character; `$__` narrows the popup to plugin macros.
    await typeSqlLeavingSuggestionsOpen(page, 'SELECT * FROM t WHERE $__');

    const firstMountLabels = await captureMacroLabels(page);
    expect(firstMountLabels.length, 'first mount surfaces plugin macros').toBeGreaterThan(0);
    expect(findDuplicates(firstMountLabels), 'first mount has no duplicate macros').toEqual([]);

    // Navigate away and back to force SqlEditor to unmount and remount.
    await page.goto('/');
    await page.goto(exploreUrl());
    await typeSqlLeavingSuggestionsOpen(page, 'SELECT * FROM t WHERE $__');

    const secondMountLabels = await captureMacroLabels(page);
    expect(findDuplicates(secondMountLabels), 'second mount has no duplicate macros').toEqual([]);
    expect(new Set(secondMountLabels)).toEqual(new Set(firstMountLabels));
  });
});
