// E2E coverage for switching a query from the SQL Editor to the Query Builder.
// Unit tests in src/components/queryBuilder/utils.test.ts cover how the SQL
// parses into builder options; only E2E confirms Explore completes the switch
// and the builder renders the converted filter.

import { expect, test } from '@grafana/plugin-e2e';
import { builderFieldRow } from '../helpers/builder';
import { exploreUrl } from '../helpers/explore';
import { enterSql } from '../helpers/sqlEditor';

// Every ClickHouse server has system.databases, so the spec needs no fixture data.
const SINGLE_VALUE_IN_SQL = "SELECT name FROM system.databases WHERE name IN ('default')";

test.describe('Switching from the SQL Editor to the Query Builder', () => {
  test('keeps a single-value IN filter', async ({ page }) => {
    await page.goto(exploreUrl());
    await enterSql(page, SINGLE_VALUE_IN_SQL);

    // The SQL converts to builder options, so the switch asks for confirmation. With a single-value
    // IN list, Continue used to throw before closing this dialog, leaving the SQL Editor selected (#2226).
    await page.getByRole('radio', { name: 'Query Builder' }).click();
    // Grafana 12.3 and earlier give this modal no accessible name, so match the dialog by its text.
    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Are you sure?' });
    await confirmDialog.getByRole('button', { name: 'Continue' }).click();
    await expect(confirmDialog).toBeHidden();
    await expect(page.getByRole('radio', { name: 'Query Builder' })).toBeChecked();

    // The first filter row holds the column and operator comboboxes, then the value input.
    const filterRow = builderFieldRow(page, 'Filters');
    await expect(filterRow.getByRole('combobox').nth(0)).toHaveValue('name');
    await expect(filterRow.getByRole('combobox').nth(1)).toHaveValue('IN');
    await expect(filterRow.getByPlaceholder('comma separated values')).toHaveValue('default');
    await expect(builderFieldRow(page, 'SQL Preview')).toContainText("name IN ('default')");
  });
});
