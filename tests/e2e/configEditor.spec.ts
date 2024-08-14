import { expect, test } from '@grafana/plugin-e2e';

const PLUGIN_UID = 'grafana-clickhouse-datasource';
const CLICKHOUSE_DB_URL = Boolean(process.env.CI) ? 'clickhouse-server' : 'localhost';

test.describe('Config Editor', () => {
  test('invalid credentials should return an error', async ({ createDataSourceConfigPage, page }) => {
    const configPage = await createDataSourceConfigPage({ type: PLUGIN_UID });
    await page.getByPlaceholder('Server address').fill(CLICKHOUSE_DB_URL);
    await expect(configPage.saveAndTest()).not.toBeOK();
  });

  test('valid credentials should return a 200 status code', async ({ createDataSourceConfigPage, page }) => {
    const configPage = await createDataSourceConfigPage({ type: PLUGIN_UID });
    configPage.mockHealthCheckResponse({ status: 200 });

    await page.getByPlaceholder('Server address').fill(CLICKHOUSE_DB_URL);
    await page.getByPlaceholder('9000').fill('9000');
    await page.getByPlaceholder('default').fill('default');

    await expect(configPage.saveAndTest()).toBeOK();
  });

  test('valid credentials should display a success alert on the page', async ({ createDataSourceConfigPage, page }) => {
    const configPage = await createDataSourceConfigPage({ type: PLUGIN_UID });

    await page.getByPlaceholder('Server address').fill(CLICKHOUSE_DB_URL);
    await page.getByPlaceholder('9000').fill('9000');
    await page.getByPlaceholder('default').fill('default');

    await configPage.saveAndTest();
    await expect(configPage).toHaveAlert('success', { hasNotText: 'Datasource updated' });

    await page.pause();
  });

  test('mandatory fields should show error if left empty', async ({ createDataSourceConfigPage, page }) => {
    const configPage = await createDataSourceConfigPage({ type: PLUGIN_UID });

    await page.getByPlaceholder('Server address').fill('');
    await page.keyboard.press('Tab');
    await expect(page.getByText('Server address required')).toBeVisible();

    await page.getByPlaceholder('9000').fill('');
    await page.keyboard.press('Tab');
    await expect(page.getByText('Port is required')).toBeVisible();

    await expect(configPage.saveAndTest()).not.toBeOK();
  });
});
