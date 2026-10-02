import { expect } from '@grafana/plugin-e2e';
import type { Locator, Page } from '@playwright/test';
import { QueryType } from '../../../src/types/queryBuilder';

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
 * Switch from the SQL Editor to the Query Builder. The switch resets the query
 * type to Table, and Explore does not restore it from the pane state. Pass
 * queryType to re-select Logs, Traces, or Time Series afterwards.
 */
export async function switchToBuilderMode(page: Page, queryType?: QueryType) {
  await page.getByRole('radio', { name: 'Query Builder' }).click();
  // The "Cannot convert" confirmation appears when the SQL is empty or not a plain SELECT.
  const continueButton = page.getByRole('button', { name: 'Continue' });
  if (await continueButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await continueButton.click();
  }
  await expect(page.getByRole('radio', { name: 'Query Builder' })).toBeChecked();

  if (queryType && queryType !== QueryType.Table) {
    const label = queryTypeRadioLabel(queryType);
    await page.getByRole('radio', { name: label, exact: true }).click();
    await expect(page.getByRole('radio', { name: label, exact: true })).toBeChecked();
  }
}

/**
 * The builder field row that owns the `query-keyword` label with this exact
 * text. The label's parent is the row. Whole-string regex, because several
 * labels share a prefix.
 */
export function builderFieldRow(page: Page, label: string): Locator {
  return page.locator('label.query-keyword', { hasText: new RegExp(`^${label}$`) }).locator('xpath=..');
}

/**
 * Pick a value in the Select that follows the `query-keyword` label with this
 * exact text. The Select is the label's next sibling: Database and Table share
 * one row, so the row's first combobox is not always the right one.
 *
 * With allowAutoPopulated, first wait briefly for the field to auto-populate
 * to `value`. Table does this when the database has one table. If it does,
 * there is nothing to pick.
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
    // isVisible() ignores its timeout, so waitFor is the only way to wait.
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
  // Options load from a schema fetch. A blind Enter can commit before the
  // matching option exists and leave the field unchanged. Wait for the
  // option, then confirm the value committed.
  await page.getByRole('option', { name: value, exact: true }).first().click();
  await expect(container.getByText(value, { exact: true }).first()).toBeVisible();
  await page.keyboard.press('Escape');
}
