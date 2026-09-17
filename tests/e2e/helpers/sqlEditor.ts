import { ExplorePage } from '@grafana/plugin-e2e';
import type { Page } from '@playwright/test';
import { QueryDataBody, waitForQueryDataResponseWithBody } from './queryResponse';

/**
 * Type SQL into the Monaco editor. Clicks to focus, selects all existing
 * content, then types the replacement query. Each keystroke triggers the
 * editor's onKeyUp handler, which runs validate() and writes Monaco markers.
 *
 * Ends with an unconditional Escape (always safe) to dismiss any Monaco
 * autocomplete popup that may have captured a keyword mid-stream (e.g. `NOT `
 * can trigger a suggestion list that, if left open, swallows the Enter/click
 * on the Run Query button or rewrites the last token when focus shifts).
 */
export async function enterSql(page: Page, sql: string) {
  const editor = page.getByRole('code');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(sql);
  await page.keyboard.press('Escape');
}

/**
 * Click the Run Query button. The toolbar also has a "Run query" button —
 * scope to the query editor row to avoid a strict-mode violation from
 * matching both.
 */
export async function runQuery(page: Page) {
  await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();
}

/**
 * Enter SQL, run the query, and return the parsed /api/ds/query response
 * body once a response with frames for the given refId arrives.
 */
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
