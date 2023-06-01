import { chromium } from 'k6/experimental/browser';
import { check, fail } from 'k6';
import http from 'k6/http';
// import { e2e } from '@grafana/e2e';
// import { selectors } from './src/selectors.ts';

export async function login(page) {
  try {
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });

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

export async function addDatasourceSuccess(page) {
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
      'add datasource successful':
      await page.locator('[aria-label="Create a dashboard').textContent() === "building a dashboard",
    })
    
    // checks the status code of the checkHealth function
    const pageURL = page.url();
    const res = http.get(`${pageURL}\health`);

    check(res, {
      'checkHealth returns a status of 200':
      (r) => r.status === 200,
    })

  } catch (e) {
    fail(`add datasource failed: ${e}`);
  }
}

export async function addDatasourceFailure(page) {
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

    // checks the page for the data source is working 
    check(page, {
      'add datasource successful':
      await page.locator('[aria-label="Create a dashboard').textContent() === "building a dashboard",
    })
    
    // checks the status code of the checkHealth function
    const pageURL = page.url();
    const res = http.get(`${pageURL}\health`);

    check(res, {
      'checkHealth returns a status of 200':
      (r) => r.status === 200,
    })

  } catch (e) {
    fail(`add datasource failed: ${e}`);
  }
}

export async function addDashboardWithQueryBuilder(browser, page) {
  try {
    await page.goto('http://localhost:3000/dashboard/new?orgId=1', { waitUntil: 'networkidle' });
    const addNewPanel = page.locator('button[aria-label="Add new panel"]');
    await addNewPanel.click();
    const closeDialog = page.locator('button[aria-label="Close dialog"]');
    await closeDialog.click();

    // checks that a dashboard can be added successfully using the query builder
    check(page, {
      'add dashboard successful with query builder':
      await page.locator(),
    })
  } catch(e) {
    fail(`add dashboard failed: ${e}`);
  } finally {
    page.close();
    browser.close();
  }
}

export default async function () {
  const browser = chromium.launch({ headless: false });
  const page = browser.newPage();
  await login(page);
  await addDatasourceSuccess(page);
  await addDashboardWithQueryBuilder(browser, page);
}
