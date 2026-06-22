import { expect, test } from '@grafana/plugin-e2e';
import { Page } from '@playwright/test';

// The annotation editor is reached through Grafana's annotation edit page and
// works with any ClickHouse datasource. These tests drive the locally
// provisioned datasource (provisioning/datasources/clickhouse.yml). The Cloud
// cron uses a different managed datasource, so the suite is local-only; the
// editor's SQL generation is also covered by the unit tests in
// src/data/CHAnnotationSupport.test.tsx.
const isCloudRun = !!process.env.GRAFANA_URL;

// The SQL textarea is identified by its placeholder so it is not confused with
// the annotation Name input (both are role=textbox).
const sqlBox = (page: Page) => page.getByPlaceholder(/SELECT Timestamp AS time/);

// Two field shapes appear in this editor. The SchemaPicker fields (Database,
// Table, Watch Column, Map Key) expose the label as the combobox's accessible
// name. The editor's own Select rows (Annotation Type, Group By) render an
// InlineFormLabel inside a .gf-form row with no accessible name on the control.
// Match either shape so one helper covers both.
const comboFor = (page: Page, label: string) =>
  page
    .getByRole('combobox', { name: label })
    .or(page.locator('.gf-form', { hasText: label }).getByRole('combobox'))
    .first();

async function selectFromCombo(page: Page, label: string, optionText: string) {
  const combo = comboFor(page, label);
  await combo.click();
  await combo.fill(optionText);
  await page.keyboard.press('Enter');
}

test.describe('annotation editor', () => {
  test.skip(isCloudRun, 'uses the locally provisioned datasource');

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
    // Watch Column is a downstream cascade level: the row is revealed but the
    // control stays disabled (no combobox) until a table is chosen, so assert
    // the field label rather than an interactive combobox.
    await expect(page.getByText('Watch Column', { exact: true })).toBeVisible();
    // Until a table and column are picked, the generator emits a placeholder comment.
    await expect(sqlBox(page)).toHaveValue(/Select a table and column/);
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
