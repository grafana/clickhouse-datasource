import { expect, test } from '@grafana/plugin-e2e';
import { Page, Request } from '@playwright/test';

const PLUGIN_TYPE = 'grafana-clickhouse-datasource';

const isCloudRun = !!process.env.GRAFANA_URL;

const CLOUD_DEFAULT_UID = 'clickhouse-native-ds-m';
const LOCAL_DEFAULT_UID = 'clickhouse-e2e';
const DATASOURCE_UID = process.env.DS_E2E_UID || (isCloudRun ? CLOUD_DEFAULT_UID : LOCAL_DEFAULT_UID);

// Paths inside e2e_test.json_events.attributes (tests/e2e/fixtures/seed.sql).
const JSON_PATH_COLUMNS = ['attributes.http.status_code', 'attributes.level', 'attributes.user_id'];

function exploreUrl(): string {
  const query = {
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

function rawSqlOf(request: Request): string {
  const body = request.postDataJSON() as { queries?: Array<{ rawSql?: string }> } | null;
  return body?.queries?.[0]?.rawSql ?? '';
}

const isJsonPathProbe = (request: Request) =>
  request.url().includes('/api/ds/query') && rawSqlOf(request).includes('distinctJSONPathsAndTypes');

const suggestionRows = (page: Page) => page.locator('.monaco-editor .suggest-widget.visible .monaco-list-row');

test.describe('JSON column path suggestions', () => {
  test.beforeEach(() => {
    test.skip(
      isCloudRun,
      'Fixture-data tests depend on e2e_test.json_events seeded by tests/e2e/fixtures/seed.sql via the local e2e-data-loader Docker service, which is not available on Cloud.'
    );
  });

  test('SQL editor suggests the paths inside a JSON column after `column.`', async ({ page }) => {
    await page.goto(exploreUrl());
    const probe = page.waitForRequest(isJsonPathProbe);
    await focusEditorAndType(page, 'SELECT * FROM e2e_test.json_events WHERE attributes.');

    const labels = suggestionRows(page).locator('.label-name');
    await expect
      .poll(async () => (await labels.allTextContents()).map((l) => l.trim()))
      .toEqual(expect.arrayContaining(JSON_PATH_COLUMNS));

    // The path lookup reads a bounded row sample (#1461) and needs no SETTINGS rights.
    const sql = rawSqlOf(await probe);
    expect(sql).toContain('(SELECT "attributes" FROM "e2e_test"."json_events" LIMIT 100000)');
    expect(sql).not.toContain('SETTINGS');
  });

  test('accepting a path completion inserts the rest of the path after the typed segment', async ({ page }) => {
    await page.goto(exploreUrl());
    await focusEditorAndType(page, 'SELECT * FROM e2e_test.json_events WHERE attributes.ht');

    await suggestionRows(page).filter({ hasText: 'attributes.http.status_code' }).click();

    await expect(page.locator('.monaco-editor .view-lines')).toContainText(
      'SELECT * FROM e2e_test.json_events WHERE attributes.http.status_code'
    );
  });
});
