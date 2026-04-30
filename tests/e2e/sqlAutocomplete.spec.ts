import { expect, test } from '@grafana/plugin-e2e';
import { Page } from '@playwright/test';

const PLUGIN_TYPE = 'grafana-clickhouse-datasource';

// GRAFANA_URL is set only by the Cloud cron workflow (see .github/workflows/cron.yml).
const isCloudRun = !!process.env.GRAFANA_URL;

const CLOUD_DEFAULT_UID = 'clickhouse-native-ds-m';
const LOCAL_DEFAULT_UID = 'clickhouse-e2e';
const DATASOURCE_UID = process.env.DS_E2E_UID || (isCloudRun ? CLOUD_DEFAULT_UID : LOCAL_DEFAULT_UID);

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

async function focusEditorAndType(page: Page, text: string) {
  const editor = page.getByRole('code');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type(text);
}

// Plugin macros are static (defined in src/ch-parser/pluginMacros.ts) so they're
// a deterministic target across local fixture and Cloud cron runs.
async function captureMacroLabels(page: Page): Promise<string[]> {
  const widget = page.locator('.monaco-editor .suggest-widget.visible');
  await widget.waitFor({ timeout: 5000 });
  const labels = await page
    .locator('.monaco-editor .suggest-widget .monaco-list-row .label-name')
    .allTextContents();
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
    await focusEditorAndType(page, 'SELECT * FROM t WHERE $__');

    const firstMountLabels = await captureMacroLabels(page);
    expect(firstMountLabels.length, 'first mount surfaces plugin macros').toBeGreaterThan(0);
    expect(findDuplicates(firstMountLabels), 'first mount has no duplicate macros').toEqual([]);

    // Navigate away and back to force SqlEditor to unmount and remount.
    await page.goto('/');
    await page.goto(exploreUrl());
    await focusEditorAndType(page, 'SELECT * FROM t WHERE $__');

    const secondMountLabels = await captureMacroLabels(page);
    expect(findDuplicates(secondMountLabels), 'second mount has no duplicate macros').toEqual([]);
    expect(new Set(secondMountLabels)).toEqual(new Set(firstMountLabels));
  });
});
