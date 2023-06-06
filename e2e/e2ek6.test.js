import { chromium } from 'k6/experimental/browser';
import { check, fail } from 'k6';
import http from 'k6/http';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { selectors } from 'unpkg.com/@grafana/e2e-selectors/dist/index.js';

console.log('selectors', selectors);

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 400 }));
const dashboardTitle = `e2e-test-dashboard-${uuidv4()}`;

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

    // checks that query is run successfully
    check(page, {
      'query builder dashboard created successfully':
      page.locator(`span[data-testid="data-testid ${dashboardTitle} breadcrumb"]`).textContent() === `${dashboardTitle}`,
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

    // TODO: export to util file
    let data = {
      "queries": [
          {
              "datasource": {
                  "type": "grafana-clickhouse-datasource",
                  "uid": `${latestDashboardUID}`
              },
              "refId": "A",
              "queryType": "builder",
              "rawSql": "SELECT memory_usage, event_time FROM system.\"query_log\" WHERE   ( event_time  >= $__fromTime AND event_time <= $__toTime ) LIMIT 100",
              "builderOptions": {
                  "mode": "list",
                  "fields": [
                      "memory_usage",
                      "event_time"
                  ],
                  "limit": 100,
                  "database": "system",
                  "table": "query_log",
                  "filters": [
                      {
                          "operator": "WITH IN DASHBOARD TIME RANGE",
                          "filterType": "custom",
                          "key": "event_time",
                          "type": "datetime",
                          "condition": "AND",
                          "restrictToFields": [
                              {
                                  "name": "event_time",
                                  "type": "DateTime",
                                  "label": "event_time",
                                  "picklistValues": []
                              },
                              {
                                  "name": "event_time_microseconds",
                                  "type": "DateTime64(6)",
                                  "label": "event_time_microseconds",
                                  "picklistValues": []
                              },
                              {
                                  "name": "query_start_time",
                                  "type": "DateTime",
                                  "label": "query_start_time",
                                  "picklistValues": []
                              },
                              {
                                  "name": "query_start_time_microseconds",
                                  "type": "DateTime64(6)",
                                  "label": "query_start_time_microseconds",
                                  "picklistValues": []
                              },
                              {
                                  "name": "initial_query_start_time",
                                  "type": "DateTime",
                                  "label": "initial_query_start_time",
                                  "picklistValues": []
                              },
                              {
                                  "name": "initial_query_start_time_microseconds",
                                  "type": "DateTime64(6)",
                                  "label": "initial_query_start_time_microseconds",
                                  "picklistValues": []
                              }
                          ]
                      }
                  ],
                  "orderBy": []
              },
              "meta": {
                  "timezone": "America/Denver"
              },
              "datasourceId": 2922,
              "intervalMs": 43200000,
              "maxDataPoints": 531
          }
      ],
      "from": "1654534659803",
      "to": "1686070659803"
  }

  // Using a JSON string as body
  let res = http.post(url, JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });

  http.post('http://localhost:3000/api/ds/query?ds_type=grafana-clickhouse-datasource');

    check(res, {
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

