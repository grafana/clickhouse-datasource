import { chromium } from 'k6/experimental/browser';
import { check, fail } from 'k6';
import http from 'k6/http';

import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { selectors } from 'unpkg.com/@grafana/e2e-selectors/dist/index.js';

const dashboardTitle = `e2e-test-dashboard-${uuidv4()}`;

export async function login(page) {
  try {
    const loginURL = selectors.pages.Login.url;
    await page.goto(`http://localhost:3000${loginURL}`, { waitUntil: 'networkidle' });

    const usernameInput = page.locator(`input[aria-label="${selectors.pages.Login.username}"]`)
    await usernameInput.type('admin');
    const passwordInput = page.locator(`input[aria-label="${selectors.pages.Login.password}"]`)
    await passwordInput.type('admin');
    const submitButton = page.locator(`button[aria-label="${selectors.pages.Login.submit}"]`)
    await submitButton.click();

    // checks page for skip change password screen
    check(page, {
      'change password is presented':
        page.locator(`button[aria-label="${selectors.pages.Login.skip}"]`).textContent() === 'Skip',
    });
  } catch (e) {
    fail(`login failed: ${e}`);
  } 
}

export async function addDatasource(page) {
  try {
    const addDataSourceURL = selectors.pages.AddDataSource.url;
    await page.goto(`http://localhost:3000${addDataSourceURL}`, { waitUntil: 'networkidle' });
    
    const clickHouseDataSource = page.locator(`button[aria-label="${selectors.pages.AddDataSource.dataSourcePluginsV2('ClickHouse')}"]`);
    await clickHouseDataSource.click();
    const dataSourceName = page.locator(`input[aria-label="${selectors.pages.DataSource.name}"]`);
    dataSourceName.fill('');
    dataSourceName.type(`ClickHouse-e2e-test-${uuidv4()}`);
    const serverAddress = page.locator(`input[aria-label="Server address"]`);
    serverAddress.type('localhost');
    const serverPort = page.locator('input[aria-label="Server port"]');
    serverPort.type('9000');
    const saveAndTestButton = page.locator(`button[data-testid="data-testid ${selectors.pages.DataSource.saveAndTest}"]`);
    await saveAndTestButton.click();

    // checks the page for the data source is working message
    check(page, {
      'add datasource successful with correct auth':
      await page.locator('[aria-label="Create a dashboard').textContent() === "building a dashboard",
    })
    
    // checks the status code of the checkHealth function
    const pageURL = page.url();
    const res = http.get(`${pageURL}\health`);

    check(res, {
      'checkHealth returns a status of 200 with correct auth':
      (r) => r.status === 200,
    })

  } catch (e) {
    fail(`add datasource failed: ${e}`);
  }
}

export async function addDashboard(page) {
  try {
    const addDashboardURL = selectors.pages.AddDashboard.url;
    await page.goto(`http://localhost:3000${addDashboardURL}`, { waitUntil: 'networkidle' });
    
    const saveDashboardToolbarButton = page.locator(`button[aria-label="${selectors.components.PageToolbar.item('Save dashboard')}"]`);
    await saveDashboardToolbarButton.click();
    const dashboardTitleInput = page.locator(`input[aria-label="${selectors.pages.SaveDashboardAsModal.newName}"]`);
    dashboardTitleInput.fill('');
    await dashboardTitleInput.type(dashboardTitle);
    const saveDashboardModalButton = page.locator(`button[aria-label="${selectors.pages.SaveDashboardAsModal.save}"]`);
    saveDashboardModalButton.click();

    // checks that query is run successfully
    check(page, {
      'dashboard created successfully':
      page.locator(`span[data-testid="data-testid ${dashboardTitle} breadcrumb"]`).textContent() === `${dashboardTitle}`,
      // TODO: replace above test with below test that aligns with core Grafana flows
      // page.locator(`div[data-testid="data-testid ${selectors.components.Alert.alertV2('success')}`).textContent() === 'Dashboard saved',
    })
  } catch(e) {
    fail(`add dashboard failed: ${e}`);
  } 
}

export async function configurePanel(browser, page) {
  try {
    const latestDashboardURL = page.url();

    await page.goto(`${latestDashboardURL}`, { waitUntil: 'networkidle' });
    const addPanelButton = page.locator('button[aria-label="Add new panel"]');
    await addPanelButton.click();
    const addDatasourceInput = page.locator('input[placeholder="Search data source"]');
    addDatasourceInput.type('ClickHouse');
    page.keyboard.down('Tab');
    page.keyboard.down('Enter');
    const databaseDropdown = page.locator('#react-select-8-input');
    databaseDropdown.type('system');
    page.keyboard.down('Enter');
    const tableDropdown = page.locator('#react-select-7-input');
    tableDropdown.type('query_log');
    page.keyboard.down('Enter');
    const fieldsDropdown = page.locator('#react-select-10-input');
    fieldsDropdown.type('event_time');
    page.keyboard.down('Enter');
    fieldsDropdown.type('memory_usage');
    page.keyboard.down('Enter');
    const runQueryButton = page.locator('button[data-testid="data-testid RefreshPicker run button"]');
    await runQueryButton.click();

    check(page, {
      'configure panel query returns a status of 200':
      (r) => r.status === 200,
    })
  } catch(e) {
    fail(`run query failed: ${e}`);
  } finally {
    browser.close();
  }
}

export default async function () {
  const browser = chromium.launch({ headless: false });
  const page = browser.newPage();
  await login(page);
  await addDatasource(page);
  await addDashboard(page);
  await configurePanel(browser, page);
  // await removeDatasource(browser, page);
}

