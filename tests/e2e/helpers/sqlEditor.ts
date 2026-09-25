import { ExplorePage } from '@grafana/plugin-e2e';
import type { Page } from '@playwright/test';
import { QueryDataBody, waitForQueryDataResponseWithBody } from './queryResponse';

/**
 * Replace the SQL editor content by typing, so each keystroke runs the
 * editor's validation. The final Escape closes any autocomplete popup, which
 * otherwise swallows the Run Query click or rewrites the last token.
 */
export async function enterSql(page: Page, sql: string) {
  const editor = page.getByRole('code');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(sql);
  await page.keyboard.press('Escape');
}

// Scoped to the editor row because the Explore toolbar has a second "Run query" button.
export async function runQuery(page: Page) {
  await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();
}

/** Enter SQL, run it, and return the /api/ds/query body once refId A has frames. */
export async function runSqlAndGetBody(
  page: Page,
  explorePage: ExplorePage,
  sql: string
): Promise<QueryDataBody | null> {
  await enterSql(page, sql);
  const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
  await runQuery(page);
  await responsePromise;
  return getBody();
}
