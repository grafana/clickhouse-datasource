import { chromium } from 'k6/experimental/browser';
import { check, fail } from 'k6';
import http from 'k6/http';

import { URL } from 'https://jslib.k6.io/url/1.0.0/index.js';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { selectors } from 'https://unpkg.com/@grafana/e2e-selectors/dist/index.js';

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
};

export async function addDatasource(page) {
  try {
    const addDataSourceURL = selectors.pages.AddDataSource.url;
    await page.goto(`http://localhost:3000${addDataSourceURL}`, { waitUntil: 'networkidle' });
    
    const clickHouseDataSource = page.locator(`button[aria-label="${selectors.pages.AddDataSource.dataSourcePluginsV2('ClickHouse')}"]`);
    await clickHouseDataSource.click();
    const dataSourceName = page.locator(`input[aria-label="${selectors.pages.DataSource.name}"]`);
    dataSourceName.fill('');
    dataSourceName.type(`${DATASOURCE_NAME}`);
    const serverAddress = page.locator(`input[aria-label="Server address"]`);
    serverAddress.type('localhost');
    const serverPort = page.locator('input[aria-label="Server port"]');
    serverPort.type('9000');
    const saveAndTestButton = page.locator(`button[data-testid="data-testid ${selectors.pages.DataSource.saveAndTest}"]`);
    await saveAndTestButton.click();

    // checks the page for the data source is working message
    check(page, {
      'add datasource successful':
      await page.locator('[aria-label="Create a dashboard').textContent() === "building a dashboard",
    });

    const orgName = `api-org-${uuidv4()}`

    // creates org
    const getOrg = http.post('http://admin:admin@localhost:3000/api/orgs', `{"name": "${orgName}"}`, {
      headers: { 'Content-Type': 'application/json' },
    });

    const orgID = getOrg.json().orgId;

    // ensures admin is added as a user to the org
    http.post(`http://admin:admin@localhost:3000/api/orgs/${orgID}/users`, '{"loginOrEmail":"admin", "role": "Admin"}', {
      headers: { 'Content-Type': 'application/json' },
    });

    // switch the org context for the Admin user to the new org
    http.post(`http://admin:admin@localhost:3000/api/user/using/${orgID}`, null);

    // creates API token
    const getApiToken = http.post('http://admin:admin@localhost:3000/api/auth/keys', '{"name":"apikey", "role": "Admin", "secondsToLive": 6000 }', {
      headers: { 'Content-Type': 'application/json' },
    });
    apiToken = getApiToken.json().key;

    const addNewDatasourcePostBody = {
      "name": "ClickHouse",
      "type":"grafana-clickhouse-datasource",
      "url":"http://mydatasource.com",
      "access":"proxy",
      "basicAuth":false
    }

    const addNewDatasource = http.post('http://admin:admin@localhost:3000/api/datasources', JSON.stringify(addNewDatasourcePostBody), {
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiToken}` } 
     });

    check(addNewDatasource, {
      'add new data source returns a status of 200':
      (r) => r.status === 200
    });

    datasourceUID = addNewDatasource.json().uid;
    
    // checks the status code of the checkHealth function
    const pageURL = page.url();
    const healthCheck = http.get(`${pageURL}\health`);

    check(healthCheck, {
      'checkHealth returns a status of 200':
      (r) => r.status === 200,
    });
  } catch (e) {
    fail(`add datasource failed: ${e}`);
  }
};

export async function addDashboard(page) {
  try {
    const addDashboardURL = selectors.pages.AddDashboard.url;
    await page.goto(`http://localhost:3000${addDashboardURL}`, { waitUntil: 'networkidle' });
    
    const saveDashboardToolbarButton = page.locator(`button[aria-label="${selectors.components.PageToolbar.item('Save dashboard')}"]`);
    await saveDashboardToolbarButton.click();
    const dashboardTitleInput = page.locator(`input[aria-label="${selectors.pages.SaveDashboardAsModal.newName}"]`);
    dashboardTitleInput.fill('');
    await dashboardTitleInput.type(DASHBOARD_TITLE);
    const saveDashboardModalButton = page.locator(`button[aria-label="${selectors.pages.SaveDashboardAsModal.save}"]`);
    saveDashboardModalButton.click();

    // checks that query is run successfully
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

    const addPanelButton = page.locator('button[aria-label="Add new panel"]');
    await addPanelButton.click();
    const addDatasourceInput = page.locator('input[placeholder="Search data source"]');
    addDatasourceInput.type('ClickHouse');
    page.keyboard.down('Tab');
    page.keyboard.down('Enter');
    const databaseDropdown = page.locator('#react-select-8-input');
    databaseDropdown.type('system');
    page.keyboard.down('Enter');
    const tableDropdown = page.locator('#react-select-9-input');
    tableDropdown.type('query_log');
    page.keyboard.down('Enter');
    const fieldsDropdown = page.locator('#react-select-10-input');
    fieldsDropdown.type('event_time');
    page.keyboard.down('Enter');
    fieldsDropdown.type('memory_usage');
    page.keyboard.down('Enter');
    const runQueryButton = page.locator('button[data-testid="data-testid RefreshPicker run button"]');
    await runQueryButton.click();

    const getCurrentUser = http.post('http://admin:admin@localhost:3000/api/orgs/users', null, {
     headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiToken}` } 
    });
    console.log('getCurrentUser', getCurrentUser.json())

    // deletes org after use for cleanup
    // const deleteOrg = http.del(`http://admin:admin@localhost:3000/api/orgs/${orgID}`, { "username": "admin", "password": "admin" }, {
    //   headers: { 'Content-Type': 'application/json' },
    // });
    // console.log('deleteOrg', deleteOrg.json())

    console.log('datasourceUID', datasourceUID)

    // const getDatasourceUID = http.get(`http://localhost:3000/api/datasources/name/${DATASOURCE_NAME}`, {
    //   headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiToken}` } 
    //  });
    // console.log('datasource UID123', getDatasourceUID.json())

    let queryData = {
      "queries": [
          {
              "datasource": {
                  "type": "grafana-clickhouse-datasource",
                  "uid": `${datasourceUID}`
              },
              "builderOptions": {
                  "database": "system",
                  "fields": [
                      "memory_usage",
                      "event_time"
                  ],
                  "filters": [
                      {
                          "condition": "AND",
                          "filterType": "custom",
                          "key": "event_time",
                          "operator": "WITH IN DASHBOARD TIME RANGE",
                          "restrictToFields": [
                              {
                                  "label": "event_time",
                                  "name": "event_time",
                                  "picklistValues": [],
                                  "type": "DateTime"
                              },
                              {
                                  "label": "event_time_microseconds",
                                  "name": "event_time_microseconds",
                                  "picklistValues": [],
                                  "type": "DateTime64(6)"
                              },
                              {
                                  "label": "query_start_time",
                                  "name": "query_start_time",
                                  "picklistValues": [],
                                  "type": "DateTime"
                              },
                              {
                                  "label": "query_start_time_microseconds",
                                  "name": "query_start_time_microseconds",
                                  "picklistValues": [],
                                  "type": "DateTime64(6)"
                              },
                              {
                                  "label": "initial_query_start_time",
                                  "name": "initial_query_start_time",
                                  "picklistValues": [],
                                  "type": "DateTime"
                              },
                              {
                                  "label": "initial_query_start_time_microseconds",
                                  "name": "initial_query_start_time_microseconds",
                                  "picklistValues": [],
                                  "type": "DateTime64(6)"
                              }
                          ],
                          "type": "datetime"
                      }
                  ],
                  "limit": 100,
                  "metrics": [],
                  "mode": "list",
                  "orderBy": [],
                  "table": "query_log",
                  "timeField": "event_time",
                  "timeFieldType": "DateTime"
              },
              "queryType": "builder",
              "rawSql": "SELECT memory_usage, event_time FROM system.\"query_log\" WHERE   ( event_time  >= $__fromTime AND event_time <= $__toTime ) LIMIT 100",
              "refId": "A",
              "meta": {
                  "timezone": "America/Denver"
              },
              "datasourceId": 2922,
              "intervalMs": 30000,
              "maxDataPoints": 638
          }
      ],
      "from": "1686147681613",
      "to": "1686169281613"
    };

    const res = http.post('http://localhost:3000/api/ds/query/', JSON.stringify(queryData), {
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiToken}` },
    });
    console.log('response123', res.json())

    // check(res, {
    //   'run query returns a response of 200':
    //   (r) => r.status === 200
    // })
  } catch(e) {
    fail(`run query failed: ${e}`);
  } 
};

export async function removeDatasource(browser, page) {
  try {
    const dashboardURL = page.url();
    // TODO: replace with scenarioContext
    const dashboardUID = getDashboardUid(dashboardURL);
    await page.goto(`http://localhost:3000/d/${dashboardUID}`, { waitUntil: 'networkidle' });
    
    const dashboardSettings = page.locator(`button[aria-label="${selectors.components.PageToolbar.item('Dashboard settings')}"]`);
    await dashboardSettings.click();
    const deleteDashboardButton = page.locator(`button[aria-label="${selectors.pages.Dashboard.Settings.General.deleteDashBoard}"]`);
    await deleteDashboardButton.click();
    const deleteDashboardModalButton = page.locator(`button[data-testid="data-testid ${selectors.pages.ConfirmModal.delete}"]`);
    await deleteDashboardModalButton.click();

    check(page, {
      'dashboard deleted successfully':
      await page.locator('div[data-testid="data-testid Alert success"]').isVisible(),
    })
  } catch(e) {
    fail(`remove datasource failed: ${e}`);
  } finally {
    browser.close();
  }
};

export default async function () {
  const browser = chromium.launch({ headless: false });
  const page = browser.newPage();
  await login(page);
  await addDatasource(page);
  await addDashboard(page);
  await configurePanel(page);
  await removeDatasource(browser, page);
}

