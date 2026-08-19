import { expect } from '@grafana/plugin-e2e';
import type { Locator, Page } from '@playwright/test';
import { QueryType } from '../../../src/types/queryBuilder';

/**
 * Map a QueryType to the human-readable label used by the Query Type radio
 * group. Kept near switchToBuilderMode so both the selection and assertion use
 * the same string.
 */
export function queryTypeRadioLabel(queryType: QueryType): string {
  switch (queryType) {
    case QueryType.Logs:
      return 'Logs';
    case QueryType.TimeSeries:
      return 'Time Series';
    case QueryType.Traces:
      return 'Traces';
    default:
      return 'Table';
  }
}

/**
 * Switch from the default SQL Editor mode into Query Builder. Dismisses the
 * "Cannot convert" confirmation that appears when the SQL body is empty or
 * not a plain SELECT. Grafana does not restore `queryType` from Explore's pane
 * state, and switching editor types resets the query type to "Table"; callers
 * that need Logs / Traces / Time Series must pass `queryType` so we re-select
 * it after the mode switch.
 */
export async function switchToBuilderMode(page: Page, queryType?: QueryType) {
  await page.getByRole('radio', { name: 'Query Builder' }).click();
  const continueButton = page.getByRole('button', { name: 'Continue' });
  if (await continueButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await continueButton.click();
  }
  // Wait until the Query Builder radio is checked, confirming the builder has rendered.
  await expect(page.getByRole('radio', { name: 'Query Builder' })).toBeChecked();

  if (queryType && queryType !== QueryType.Table) {
    const label = queryTypeRadioLabel(queryType);
    await page.getByRole('radio', { name: label, exact: true }).click();
    await expect(page.getByRole('radio', { name: label, exact: true })).toBeChecked();
  }
}

/**
 * Returns the builder field row that contains a specific `<label
 * class="query-keyword">` whose text matches `label` exactly. Each field is a
 * grafana-ui InlineField whose container div is the direct parent of the
 * InlineFormLabel, so the label's parent IS the field row.
 *
 * Several labels share the prefix "Time" (e.g. "Filter Time", "Order By"
 * subsections), so we anchor with a whole-string regex rather than substring
 * matching.
 */
export function builderFieldRow(page: Page, label: string): Locator {
  return page.locator('label.query-keyword', { hasText: new RegExp(`^${label}$`) }).locator('xpath=..');
}

/**
 * Pick a value in the Select rendered immediately after a `<label
 * class="query-keyword">` whose text matches `label` exactly: open the
 * combobox, type the value to filter the option list, commit with Enter, and
 * close any lingering option list with Escape.
 *
 * The Database/Table pair lives inside a single parent row, so we cannot rely
 * on `xpath=..` + `.first()` (it would always hit the Database combobox).
 * Targeting the label's immediate following sibling is robust for both the
 * single-column rows (Time, Message, Log Level) and the shared-row pairs.
 *
 * With `allowAutoPopulated`, first race against the field auto-populating to
 * `value` (e.g. Table auto-picks when the chosen database has a single
 * table): if the value appears within a short window, there is nothing to
 * pick. `isVisible()` does NOT honour its timeout argument — use waitFor to
 * actually wait.
 */
export async function pickBuilderSelect(
  page: Page,
  label: string,
  value: string,
  opts: { allowAutoPopulated?: boolean } = {}
) {
  const container = page
    .locator('label.query-keyword', { hasText: new RegExp(`^${label}$`) })
    .first()
    .locator('xpath=following-sibling::*[1]');

  if (opts.allowAutoPopulated) {
    const alreadySelected = container.getByText(value, { exact: true });
    const autoSelected = await alreadySelected
      .waitFor({ state: 'visible', timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    if (autoSelected) {
      return;
    }
  }

  const combobox = container.getByRole('combobox').first();
  await combobox.click();
  await page.keyboard.type(value);
  // The option list populates asynchronously from a schema fetch, so a blind
  // Enter can commit before the matching option exists and leave the field
  // unchanged (under parallel load this made the Log Level pick silently
  // no-op and the logs-volume query fall back to count(*)). Wait for the
  // real option, click it, and verify the value actually committed.
  await page.getByRole('option', { name: value, exact: true }).first().click();
  await expect(container.getByText(value, { exact: true }).first()).toBeVisible();
  // Close any lingering option list before the next interaction.
  await page.keyboard.press('Escape');
}
