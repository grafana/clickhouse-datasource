import { browser } from 'k6/experimental/browser';
import { check, fail } from 'k6';
import http from 'k6/http';

import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { URL } from 'https://jslib.k6.io/url/1.0.0/index.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { selectors } from 'https://unpkg.com/@grafana/e2e-selectors@9.4.3/dist/index.js';

const getEnvVariables = () => {
  if (__ENV.TEST_ENV === "local") {
    return {
      GRAFANA_HOST: "localhost"
    }
  }
  return {
    GRAFANA_HOST: "grafana",
  }
};
const GRAFANA_HOST = getEnvVariables().GRAFANA_HOST;
const DASHBOARD_TITLE = `e2e-test-dashboard-${uuidv4()}`;
const DATASOURCE_NAME = `ClickHouse-e2e-test-${uuidv4()}`;
let datasourceUID;
let apiToken;
const getDashboardUid = (url) => {
  const matches = new URL(url).pathname.match(/\/d\/([^/]+)/);
  if (!matches) {
    throw new Error(`Couldn't parse uid from ${url}`);
  } else {
    return matches[1];
  }
};

export const options = {
  scenarios: {
    ui: {
      executor: 'shared-iterations',
      options: {
        browser: {
          type: 'chromium'
        },
      },
    },
  },
}

export async function login(page) {
  try {
    const loginURL = selectors.pages.Login.url;
    await page.goto(`http://${GRAFANA_HOST}:3000${loginURL}`, { waitUntil: 'networkidle' });
    page.waitForTimeout(15000);

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
};

export async function addDatasource(page) {
  try {
    const addDataSourceURL = selectors.pages.AddDataSource.url;
    await page.goto(`http://${GRAFANA_HOST}:3000${addDataSourceURL}`, { waitUntil: 'networkidle' });
    
    const clickHouseDataSource = page.locator(`button[aria-label="${selectors.pages.AddDataSource.dataSourcePluginsV2('ClickHouse')}"]`);
    await clickHouseDataSource.click();
    const dataSourceName = page.locator(`input[aria-label="${selectors.pages.DataSource.name}"]`);
    dataSourceName.fill('');
    dataSourceName.type(DATASOURCE_NAME);
    const serverAddress = page.locator(`input[aria-label="Server address"]`);
    serverAddress.type('clickhouse');
    const serverPort = page.locator('input[aria-label="Server port"]');
    serverPort.type('9000');
    const saveAndTestButton = page.locator(`button[data-testid="data-testid ${selectors.pages.DataSource.saveAndTest}"]`);
    await saveAndTestButton.click();

    // checks the page for the data source is working message
    check(page, {
      'add datasource successful':
      await page.locator('[aria-label="Create a dashboard"]').textContent() === "building a dashboard",
    });

    const pageURL = page.url().split('/');
    datasourceUID = pageURL[pageURL.length - 1];

  } catch (e) {
    fail(`add datasource failed: ${e}`);
  }
};

export async function addDashboard(page) {
  try {
    const addDashboardURL = selectors.pages.AddDashboard.url;
    await page.goto(`http://${GRAFANA_HOST}:3000${addDashboardURL}`, { waitUntil: 'networkidle' });
    
    const saveDashboardToolbarButton = page.locator(`button[aria-label="${selectors.components.PageToolbar.item('Save dashboard')}"]`);
    await saveDashboardToolbarButton.click();
    const dashboardTitleInput = page.locator(`input[aria-label="${selectors.pages.SaveDashboardAsModal.newName}"]`);
    dashboardTitleInput.fill('');
    await dashboardTitleInput.type(DASHBOARD_TITLE);
    const saveDashboardModalButton = page.locator(`button[aria-label="${selectors.pages.SaveDashboardAsModal.save}"]`);
    saveDashboardModalButton.click();

    // checks that the dashboard is created successfully
    check(page, {
      'dashboard created successfully':
      await page.locator('div[data-testid="data-testid Alert success"]').isVisible(),
    })
  } catch(e) {
    fail(`add dashboard failed: ${e}`);
  } 
};

export async function configurePanel(page) {
  try {
    const dashboardURL = page.url();
    await page.goto(`${dashboardURL}`, { waitUntil: 'networkidle' });

    const addPanelButton = page.locator('button[data-testid="data-testid Create new panel button"]');
    await addPanelButton.click();
    const addDatasourceInput = page.locator('input[placeholder="Search data source"]');
    addDatasourceInput.type(`${DATASOURCE_NAME}`);
    page.keyboard.down('Tab');
    page.keyboard.down('Enter');

    let queryData = {
      "queries": [
        {
          "datasource": {
            "type": "grafana-clickhouse-datasource",
            "uid": `${datasourceUID}`
          },
          "pluginVersion": "4.0.0",
          "editorType": "builder",
          "rawSql": "SELECT \"schema_name\" FROM \"information_schema\".\"schemata\" LIMIT 1000",
          "builderOptions": {
            "database": "information_schema",
            "table": "schemata",
            "queryType": "table",
            "mode": "list",
            "columns": [
              {
                "name": "schema_name",
                "type": "String",
                "custom": false
              }
            ],
            "meta": {},
            "limit": 1000,
            "aggregates": [],
            "groupBy": [],
            "filters": [],
            "orderBy": []
          },
          "format": 1,
          "meta": {
            "timezone": "America/New_York"
          },
          "datasourceId": 1,
          "intervalMs": 10000,
          "maxDataPoints": 1920
        }
      ],
      "from": "1695121104422",
      "to": "1695142704422"
    };

    // ensures user is an admin to the org
    http.post(`http://admin:admin@${GRAFANA_HOST}:3000/api/user/using/1`, null);

    const apiKeyName = `apikey-${uuidv4()}`

    // creates API token 
    const getApiToken = http.post(`http://admin:admin@${GRAFANA_HOST}:3000/api/auth/keys`, `{"name":"${apiKeyName}", "role": "Admin", "secondsToLive": 60 }`, {
      headers: { 'Content-Type': 'application/json' },
    });
    apiToken = getApiToken.json().key;

    // sends POST request for query
    const res = http.post(`http://admin:admin@${GRAFANA_HOST}:3000/api/ds/query/`, JSON.stringify(queryData), {
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiToken}` },
    });

    // checks for 200 response of query request
    check(res, {
      'run query returns a response of 200':
      (r) => r.status === 200
    })
  } catch(e) {
    fail(`run query failed: ${e}`);
  } 
};

export async function removeDashboard(page) {
  try {
    const dashboardURL = page.url();
    const dashboardUID = getDashboardUid(dashboardURL);
    await page.goto(`http://${GRAFANA_HOST}:3000/d/${dashboardUID}`, { waitUntil: 'networkidle' });
    
    const dashboardSettings = page.locator(`button[aria-label="${selectors.components.PageToolbar.item('Dashboard settings')}"]`);
    await dashboardSettings.click();
    const deleteDashboardButton = page.locator(`button[aria-label="${selectors.pages.Dashboard.Settings.General.deleteDashBoard}"]`);
    await deleteDashboardButton.click();
    const deleteDashboardModalButton = page.locator(`button[data-testid="data-testid ${selectors.pages.ConfirmModal.delete}"]`);
    await deleteDashboardModalButton.click();

    // checks for success alert message
    check(page, {
      'dashboard deleted successfully':
      await page.locator('div[data-testid="data-testid Alert success"]').isVisible(),
    });
  } catch(e) {
    fail(`remove datasource failed: ${res}`);
  }
};

export default async function () {
  const context = browser.newContext();
  const page = context.newPage();

  await login(page);
  await addDatasource(page);
  await addDashboard(page);
  await configurePanel(page);
  await removeDashboard(page);

  page.close();
};

export function handleSummary(data) {
  console.log('Preparing the end-of-test summary...');

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true}),
    'test_summary.json': JSON.stringify(data), 
  };
}

