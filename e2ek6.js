import { chromium } from 'k6/experimental/browser';
import { check, fail } from 'k6';
import http from 'k6/http';

export async function login(browser, page) {
  try {
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });

    page.locator('input[name="user"]').type('admin');
    page.locator('input[name="password"]').type('admin');
    page.locator('button[type="submit"]').click();

    check(page, {
      'change password is presented':
        page.locator('button[aria-label="Skip change password button"]').textContent() === 'Skip',
    });
  } catch (e) {
    fail(`login failed: ${e}`);
  }
}

//TODO: select datasource as default to ensure it is selected for query
export async function addDatasource(browser, page) {
  try {
    await page.goto('http://localhost:3000/connections/add-new-connection', { waitUntil: 'networkidle' });
    page.locator('input[aria-label="Search all"]').type('click')
    await page.locator('a[href="/connections/datasources/grafana-clickhouse-datasource"]').click();
    await page.locator('button[data-testid="create-data-source-button"]').click();
    page.locator('input[aria-label="Server address"]').type('play.clickhouse.com');
    page.locator('input[aria-label="Server port"]').type('9440');
    page.locator('label[for="secure"]').check();
    page.locator('input[aria-label="Username"]').type('play');
    page.locator('input[aria-label="Default database"]').type('default');
    await page.locator('button[data-testid="data-testid Data source settings page Save and Test button"]').click();

    check(page, {
      'add datasource successful':
      await page.locator('[aria-label="Create a dashboard').textContent() === "building a dashboard",
    })
    
    // add checkHealth response status?; need to find a way to grab UIDxs
    // const res = http.get('');
    // check(res, {
    //   'checkHealth returns a status of 200':
    //   (r) => r.status === 200,
    // })

  } catch (e) {
    fail(`add datasource failed: ${e}`);
  }
}

export async function addDashboardWithQueryBuilder(browser, page) {
  try {
    await page.goto('http://localhost:3000/dashboard/new?orgId=1', { waitUntil: 'networkidle' });
    await page.locator('input[aria-label="Add new panel"]').click();
    await page.locator('input[aria-label="Close dialog"]').click();

    check(page, {
      'add dashboard successful':
      await page.locator(),
    })
  } catch(e) {
    fail(`add dashboard failed: ${e}`);
  }
}

export default async function () {
  const browser = chromium.launch({ headless: false });
  const page = browser.newPage();
  await login(browser, page);
  await addDatasource(browser, page);
}
