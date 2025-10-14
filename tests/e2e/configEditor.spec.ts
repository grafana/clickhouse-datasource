import { expect, test } from '@grafana/plugin-e2e';

const PLUGIN_UID = 'grafana-clickhouse-datasource';

// Determine ClickHouse DB URL based on environment
function resolveClickhouseUrl(env = process.env) {
  const { CI, DS_INSTANCE_HOST } = env;
  return CI ? (DS_INSTANCE_HOST || 'clickhouse-server') : 'localhost';
}

test.describe('Config Editor', () => {
  test('invalid credentials should return an error', async ({ createDataSourceConfigPage, page }) => {
    const configPage = await createDataSourceConfigPage({ type: PLUGIN_UID });
    await page.getByPlaceholder('Server address').fill(resolveClickhouseUrl());
    await expect(configPage.saveAndTest()).not.toBeOK();
  });

  test('valid credentials should display a success alert on the page', async ({ createDataSourceConfigPage, page }) => {
    const configPage = await createDataSourceConfigPage({ type: PLUGIN_UID });

    await page.getByPlaceholder('Server address').fill(resolveClickhouseUrl());
    await page.getByPlaceholder('9000').fill(process.env.DS_INSTANCE_PORT ?? '9000');
    await page.getByPlaceholder('default').fill(process.env.DS_INSTANCE_USERNAME ?? 'default');

    if (process.env.DS_INSTANCE_PASSWORD) {
      await page.getByPlaceholder('password').fill(process.env.DS_INSTANCE_PASSWORD);
    }

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
