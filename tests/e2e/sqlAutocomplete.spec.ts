import { expect, test } from '@grafana/plugin-e2e';
import { Page } from '@playwright/test';

const PLUGIN_TYPE = 'grafana-clickhouse-datasource';

// GRAFANA_URL is set only by the Cloud cron workflow (see .github/workflows/cron.yml).
const isCloudRun = !!process.env.GRAFANA_URL;

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

async function focusEditorAndType(page: Page, text: string) {
  const editor = page.getByRole('code');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type(text);
}

/**
 * Capture macro labels currently rendered in the Monaco suggest widget. We filter
 * to `$__` prefixes because the plugin macros are static (defined in
 * src/ch-parser/pluginMacros.ts) and don't depend on a database round trip — making
 * them a stable, predictable target for duplicate detection across environments.
 */
async function captureMacroLabels(page: Page): Promise<string[]> {
  const widget = page.locator('.monaco-editor .suggest-widget.visible');
  await widget.waitFor({ timeout: 5000 });
  const labels = await page
    .locator('.monaco-editor .suggest-widget .monaco-list-row .label-name')
    .allTextContents();
  return labels.map((l) => l.trim()).filter((l) => l.startsWith('$__'));
}

function findDuplicates(labels: string[]): string[] {
  const counts = new Map<string, number>();
  for (const l of labels) {
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, c]) => c > 1).map(([l]) => l);
}

/**
 * Regression for grafana/data-sources#1108 item 2 (the duplicate-suggestions half,
 * follow-up to grafana/clickhouse-datasource#1779 which fixed case-insensitive
 * matching but explicitly deferred the duplicate fix).
 *
 * Root cause: each SqlEditor mount called registerSQL, which in turn called
 * monaco.languages.registerCompletionItemProvider('sql', ...). The returned
 * disposable was never captured, so re-mounting the editor (panel close/open,
 * dashboard navigation, switching between Explore and other pages) stacked
 * providers. Monaco invokes every registered provider for the language and merges
 * results — duplicating each suggestion N times for N mounts.
 *
 * The fix disposes both providers in onEditorWillUnmount. This test exercises the
 * full path: mount the editor, force an unmount via navigation, mount again, and
 * verify suggestions are not duplicated. Without the fix, every macro label appears
 * twice on the second visit.
 */
test.describe('SQL editor autocomplete', () => {
  test('does not duplicate suggestions after editor remount', async ({ page }) => {
    // First mount. Typing `$` is a registered trigger character (see
    // sqlProvider.ts → triggerCharacters: [' ', '.', '$']) and surfaces the macro
    // suggestions immediately; `$__` narrows the popup to plugin macros.
    await page.goto(exploreUrl());
    await focusEditorAndType(page, 'SELECT * FROM t WHERE $__');

    const firstMountLabels = await captureMacroLabels(page);
    expect(firstMountLabels.length, 'first mount surfaces plugin macros').toBeGreaterThan(0);
    expect(findDuplicates(firstMountLabels), 'first mount has no duplicate macros').toEqual([]);

    // Navigate away and back to force SqlEditor to unmount and remount. The
    // unmount fires onEditorWillUnmount → disposes the previously registered
    // providers. Without that dispose, the second mount stacks a second provider
    // and Monaco merges both providers' results — producing duplicates.
    await page.goto('/');
    await page.goto(exploreUrl());
    await focusEditorAndType(page, 'SELECT * FROM t WHERE $__');

    const secondMountLabels = await captureMacroLabels(page);
    expect(findDuplicates(secondMountLabels), 'second mount has no duplicate macros').toEqual([]);
    // The label set should be identical across mounts; drift here would point at a
    // different bug (e.g., schema state leaking) but is worth catching.
    expect(new Set(secondMountLabels)).toEqual(new Set(firstMountLabels));
  });
});
