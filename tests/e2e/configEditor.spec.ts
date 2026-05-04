import { expect, test } from '@grafana/plugin-e2e';
import { Page } from '@playwright/test';
import { CHConfig } from '../../src/types/config';

const PLUGIN_UID = 'grafana-clickhouse-datasource';
const PROVISIONING_FILE = 'clickhouse.yml';

// GRAFANA_URL is set only by the Cloud cron workflow (playwright-cloud). Local and PR CI
// don't set it, so its presence is a reliable signal that we're running against a shared
// Cloud instance where the local provisioning/datasources/clickhouse.yml is not applied.
const isCloudRun = !!process.env.GRAFANA_URL;

function resolveClickhouseUrl(env = process.env) {
  const { CI, DS_INSTANCE_HOST } = env;
  return CI ? DS_INSTANCE_HOST || 'clickhouse-server' : 'localhost';
}

async function configurePDC(page: Page, networkName: string) {
  await page.getByRole('combobox', { name: 'Private data source connect' }).click();
  await page.getByText(networkName).click();
}

/**
 * Waits for the config editor to fully render, then returns true if V2
 * (newClickhouseConfigPageDesign) is active. Uses waitForSelector so it
 * handles both slow plugin initialization and CI environments reliably —
 * unlike isVisible(), which returns immediately without waiting.
 */
async function isV2Editor(page: Page): Promise<boolean> {
  await page.waitForSelector('[placeholder="Enter server address"], [placeholder="Server address"]', {
    timeout: 10000,
  });
  return page.locator('[placeholder="Enter server address"]').isVisible();
}

test.describe('Config editor', () => {
  test.describe('rendering', () => {
    test('smoke: should render config editor', { tag: ['@plugins'] }, async ({ createDataSourceConfigPage, page }) => {
      await createDataSourceConfigPage({ type: PLUGIN_UID });
      const isV2 = await isV2Editor(page);
      // V2 renders section titles inside CollapsableSection: the toggle button gets
      // aria-label pointing to the label div, so getByRole('button') is the right selector.
      await expect(
        isV2
          ? page.getByRole('button', { name: 'Server and encryption' })
          : page.getByRole('heading', { name: 'Server' })
      ).toBeVisible();
    });

    test('should render Server section', async ({ createDataSourceConfigPage, page }) => {
      await createDataSourceConfigPage({ type: PLUGIN_UID });
      const isV2 = await isV2Editor(page);
      await expect(
        isV2
          ? page.getByRole('button', { name: 'Server and encryption' })
          : page.getByRole('heading', { name: 'Server' })
      ).toBeVisible();
      await expect(page.getByPlaceholder(isV2 ? 'Enter server address' : 'Server address')).toBeVisible();
      await expect(page.getByPlaceholder(isV2 ? 'Enter server port' : '9000')).toBeVisible();
      await expect(page.getByRole('radio', { name: 'Native' })).toBeVisible();
      await expect(page.getByRole('radio', { name: 'HTTP' })).toBeVisible();
    });

    test('should render TLS / SSL Settings section', async ({ createDataSourceConfigPage, page }) => {
      await createDataSourceConfigPage({ type: PLUGIN_UID });
      const isV2 = await isV2Editor(page);
      if (isV2) {
        await expect(page.getByRole('button', { name: 'TLS/SSL settings' })).toBeVisible();
        // TLS/SSL section is collapsed by default in V2 — expand it before checking inner fields.
        await page.getByRole('button', { name: 'TLS/SSL settings' }).click();
      } else {
        await expect(page.getByRole('heading', { name: 'TLS / SSL Settings' })).toBeVisible();
      }
      // The label and description for these fields share identical text — use .first() to
      // target the visible label div, not the description span that follows it.
      await expect(page.getByText('Skip TLS Verify').first()).toBeVisible();
      await expect(page.getByText('TLS Client Auth').first()).toBeVisible();
    });

    test('should render Credentials section', async ({ createDataSourceConfigPage, page }) => {
      await createDataSourceConfigPage({ type: PLUGIN_UID });
      const isV2 = await isV2Editor(page);
      await expect(
        isV2
          ? page.getByRole('button', { name: 'Database credentials' })
          : page.getByRole('heading', { name: 'Credentials' })
      ).toBeVisible();
      await expect(page.getByPlaceholder(isV2 ? 'Enter username' : 'default')).toBeVisible();
      await expect(page.getByPlaceholder(isV2 ? 'Enter password' : 'password')).toBeVisible();
    });
  });

  test.describe('provisioned datasource', () => {
    test.beforeEach(() => {
      test.skip(
        isCloudRun,
        'Provisioned-datasource tests assert values from the local provisioning/datasources/clickhouse.yml file, which is not applied on the shared Cloud instance.'
      );
    });

    test('should load provisioned server address', async ({
      readProvisionedDataSource,
      gotoDataSourceConfigPage,
      page,
    }) => {
      const ds = await readProvisionedDataSource<CHConfig>({ fileName: PROVISIONING_FILE });
      await gotoDataSourceConfigPage(ds.uid);
      const isV2 = await isV2Editor(page);
      await expect(page.getByPlaceholder(isV2 ? 'Enter server address' : 'Server address')).toHaveValue(
        'clickhouse-server'
      );
    });

    test('should load provisioned port and protocol', async ({
      readProvisionedDataSource,
      gotoDataSourceConfigPage,
      page,
    }) => {
      const ds = await readProvisionedDataSource<CHConfig>({ fileName: PROVISIONING_FILE });
      await gotoDataSourceConfigPage(ds.uid);
      const isV2 = await isV2Editor(page);
      await expect(page.getByPlaceholder(isV2 ? 'Enter server port' : '9000')).toHaveValue('9000');
      await expect(page.getByRole('radio', { name: 'Native' })).toBeChecked();
    });
  });

  test.describe('save & test', () => {
    test('should pass health check for provisioned datasource', async ({
      readProvisionedDataSource,
      gotoDataSourceConfigPage,
      page,
    }) => {
      test.skip(
        isCloudRun,
        'Provisioned-datasource tests assert values from the local provisioning/datasources/clickhouse.yml file, which is not applied on the shared Cloud instance.'
      );
      // Provisioned datasources show a read-only "Test" button (not "Save & test"),
      // since the UI cannot modify provisioned configuration.
      const ds = await readProvisionedDataSource<CHConfig>({ fileName: PROVISIONING_FILE });
      await gotoDataSourceConfigPage(ds.uid);
      await page.getByRole('button', { name: 'Test' }).click();
      await expect(page.getByText('Data source is working')).toBeVisible();
    });

    test('invalid credentials should return an error', async ({ createDataSourceConfigPage, page }) => {
      const configPage = await createDataSourceConfigPage({ type: PLUGIN_UID });
      const isV2 = await isV2Editor(page);
      await page.getByPlaceholder(isV2 ? 'Enter server address' : 'Server address').fill(resolveClickhouseUrl());
      if (isV2) {
        await page.getByPlaceholder('Enter server port').fill('9000');
        await page.getByPlaceholder('Enter username').fill('invalid_user');
      }
      await expect(configPage.saveAndTest()).not.toBeOK();
    });

    test('valid credentials should display a success alert on the page', async ({
      createDataSourceConfigPage,
      page,
    }) => {
      // Requires ClickHouse to be reachable FROM INSIDE the Grafana container.
      // In Docker Compose, set DS_INSTANCE_HOST=clickhouse-server. Skipped otherwise.
      test.skip(
        !process.env.CI && !process.env.DS_INSTANCE_HOST,
        'ClickHouse must be reachable from inside Grafana; set DS_INSTANCE_HOST or run in CI'
      );

      const configPage = await createDataSourceConfigPage({ type: PLUGIN_UID });
      const isV2 = await isV2Editor(page);
      await page.getByPlaceholder(isV2 ? 'Enter server address' : 'Server address').fill(resolveClickhouseUrl());
      await page.getByPlaceholder(isV2 ? 'Enter server port' : '9000').fill(process.env.DS_INSTANCE_PORT ?? '9000');
      await page
        .getByPlaceholder(isV2 ? 'Enter username' : 'default')
        .fill(process.env.DS_INSTANCE_USERNAME ?? 'default');
      await page.getByPlaceholder(isV2 ? 'Enter password' : 'password').fill(process.env.DS_INSTANCE_PASSWORD ?? '');

      if (process.env.DS_PDC_NETWORK_NAME) {
        await configurePDC(page, process.env.DS_PDC_NETWORK_NAME);
      }

      await configPage.saveAndTest();
      await expect(configPage).toHaveAlert('success', { hasNotText: 'Datasource updated' });
    });

    test('mandatory fields should show error if left empty', async ({ createDataSourceConfigPage, page }) => {
      const configPage = await createDataSourceConfigPage({ type: PLUGIN_UID });

      // This test requires the V2 config editor (newClickhouseConfigPageDesign feature toggle).
      // The V2 editor shows inline validation errors on blur; V1 only shows them after save.
      const isV2 = await isV2Editor(page);
      test.skip(!isV2, 'Requires newClickhouseConfigPageDesign feature toggle to be enabled');

      const hostInput = page.getByPlaceholder('Enter server address');
      await hostInput.focus();
      await hostInput.press('Tab');
      await expect(page.getByText('Server address required')).toBeVisible();

      const portInput = page.getByPlaceholder('Enter server port');
      await portInput.focus();
      await portInput.press('Tab');
      await expect(page.getByText('Port is required')).toBeVisible();

      // In V2, validation blocks the save when required fields are empty — no network
      // request is made. Grafana surfaces the errors in the testing-status banner instead.
      await page.getByRole('button', { name: 'Save & test' }).click();
      await expect(page.getByText('Server address required')).toBeVisible();
      await expect(page.getByText('Port is required')).toBeVisible();
    });
  });
});
