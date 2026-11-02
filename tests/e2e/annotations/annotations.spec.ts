import { expect, test } from '@grafana/plugin-e2e';
import type { Page } from '@playwright/test';
import { skipFixtureTestsOnCloud } from '../helpers/env';

// The annotation editor is reached through Grafana's annotation edit page and
// works with any ClickHouse datasource. These tests drive the locally
// provisioned datasource (provisioning/datasources/clickhouse.yml) against the
// locally seeded fixture database, so the suite is local-only; the editor's SQL
// generation is also covered by the unit tests in
// src/data/CHAnnotationSupport.test.tsx. Only E2E can confirm the editor's
// generated query actually executes against a real ClickHouse instance.

// The SQL textarea is identified by its placeholder so it is not confused with
// the annotation Name input (both are role=textbox).
const sqlBox = (page: Page) => page.getByPlaceholder(/SELECT Timestamp AS time/);

// Two field shapes appear in this editor. The SchemaPicker fields (Database,
// Table, Watch Column, Map Key) expose the label as the combobox's accessible
// name. The editor's own Select rows (Annotation Type, Group By) render an
// InlineFormLabel inside a grafana-ui InlineField with no accessible name on
// the control — the InlineField container is the label's direct parent, so
// anchor on the label. Match either shape so one helper covers both.
//
// Kept local rather than using helpers/builder.ts pickBuilderSelect: that
// helper anchors on `label.query-keyword`, which the annotation editor's
// fields do not render.
const comboFor = (page: Page, label: string) =>
  page
    .getByRole('combobox', { name: label })
    .or(page.locator('label', { hasText: label }).locator('xpath=..').getByRole('combobox'))
    .first();

async function selectFromCombo(page: Page, label: string, optionText: string) {
  const combo = comboFor(page, label);
  await combo.click();
  await combo.fill(optionText);
  await page.keyboard.press('Enter');
}

test.describe('Annotation editor', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => {
    skipFixtureTestsOnCloud('seed.sql');
  });

  test('change detection preset reveals the schema builder', async ({
    annotationEditPage,
    page,
    readProvisionedDataSource,
  }) => {
    const ds = await readProvisionedDataSource({ fileName: 'clickhouse.yml', name: 'ClickHouse' });
    await annotationEditPage.datasource.set(ds.name);
    await expect(comboFor(page, 'Annotation Type')).toBeVisible();

    await selectFromCombo(page, 'Annotation Type', 'Change Detection');
    await expect(comboFor(page, 'Database')).toBeVisible();
    await expect(page.getByText('Watch Column', { exact: true })).toBeVisible();
    // Selecting the preset seeds a populated builder, so the box holds a runnable
    // change-detection query rather than the empty-state placeholder.
    await expect(sqlBox(page)).toHaveValue(/lagInFrame/);
  });

  test('a custom SQL annotation query executes against ClickHouse', async ({
    annotationEditPage,
    page,
    readProvisionedDataSource,
  }) => {
    const ds = await readProvisionedDataSource({ fileName: 'clickhouse.yml', name: 'ClickHouse' });
    await annotationEditPage.datasource.set(ds.name);

    // Custom SQL is the default preset. Use a time-independent query so the
    // assertion does not depend on the dashboard time range or seed data.
    await sqlBox(page).fill("SELECT now() AS time, 'smoke' AS text");
    const response = await annotationEditPage.runQuery();
    expect(response.ok()).toBeTruthy();
  });
});
