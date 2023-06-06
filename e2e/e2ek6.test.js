import { chromium } from 'k6/experimental/browser';
import { check, fail } from 'k6';
import http from 'k6/http';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
// import { e2e } from '@grafana/e2e';

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 400 }));

export async function login(page) {
  try {
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });

    // e2e.flows.login({ username: 'admin', password: 'admin'})

    page.locator('input[name="user"]').type('admin');
    page.locator('input[name="password"]').type('admin');
    page.locator('button[type="submit"]').click();

    // checks page for skip change password screen
    check(page, {
      'change password is presented':
        page.locator('button[aria-label="Skip change password button"]').textContent() === 'Skip',
    });
  } catch (e) {
    fail(`login failed: ${e}`);
  } 
}

export async function addDatasource(page) {
  try {
    await page.goto('http://localhost:3000/connections/datasources/new', { waitUntil: 'networkidle' });
    const findDatasource = page.locator('input[placeholder="Filter by name or type"]');
    await findDatasource.type('click');
    const clickHouseDataSource = page.locator('button[aria-label="Add new data source ClickHouse"]');
    await clickHouseDataSource.click();
    page.locator(`input[aria-label="Server address"]`).type('localhost');
    page.locator('input[aria-label="Server port"]').type('9000');
    const saveAndTestButton = page.locator('button[data-testid="data-testid Data source settings page Save and Test button"]');
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
    const dashboardTitle = `e2e-test-dashboard-${uuidv4()}`;
    await page.goto('http://localhost:3000/dashboard/new', { waitUntil: 'networkidle' });
    const dashboardSettings = page.locator('button[aria-label="Dashboard settings"]');
    await dashboardSettings.click();
    const dashboardTitleInput = page.locator('#title-input');
    dashboardTitleInput.fill('');
    await dashboardTitleInput.type(dashboardTitle);
    const saveDashboardButton = page.locator('button[aria-label="Dashboard settings aside actions Save button"]');
    saveDashboardButton.click();
    const saveDashboardSidebarButton = page.locator('button[aria-label="Save dashboard button"]');
    saveDashboardSidebarButton.click();
    // TODO: check query network request
    // const res = http.get('http://localhost:3000/api/ds/query?ds_type=grafana-clickhouse-datasource');
    // console.log('res body', res.json())

    // checks that query is run successfully
    check(page, {
      'query builder dashboard created successfully':
      page.locator(`span[data-testid="data-testid ${dashboardTitle} breadcrumb"]`).textContent() === `${dashboardTitle}`,
    })
  } catch(e) {
    fail(`add dashboard failed: ${e}`);
  } 
}

export async function runQuery(browser, page) {
  try {

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
  await runQuery(browser, page);
  // await removeDatasource(browser, page);
}

