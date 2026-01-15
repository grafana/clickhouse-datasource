import { expect, test } from '@grafana/plugin-e2e';

const PLUGIN_UID = 'grafana-clickhouse-datasource';
const CLICKHOUSE_DB_URL = Boolean(process.env.CI) ? 'clickhouse-server' : 'localhost';

test.describe('Config Editor', () => {
  test('invalid credentials should return an error', async ({ createDataSourceConfigPage, page }) => {
    const configPage = await createDataSourceConfigPage({ type: PLUGIN_UID });
    await page.getByPlaceholder('Enter server address').fill(CLICKHOUSE_DB_URL);
    await expect(configPage.saveAndTest()).not.toBeOK();
  });

  test('valid credentials should display a success alert on the page', async ({ createDataSourceConfigPage, page }) => {
    const configPage = await createDataSourceConfigPage({ type: PLUGIN_UID });

    await page.getByPlaceholder('Enter server address').fill(CLICKHOUSE_DB_URL);
    await page.getByPlaceholder('Enter server port').fill('9000');
    await page.getByPlaceholder('Enter username').fill('default');

    await configPage.saveAndTest();
    await expect(configPage).toHaveAlert('success', { hasNotText: 'Datasource updated' });

    await page.pause();
  });
});
