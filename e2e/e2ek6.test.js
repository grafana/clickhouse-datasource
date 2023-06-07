import { chromium } from 'k6/experimental/browser';
import { check, fail } from 'k6';
import http from 'k6/http';

import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { selectors } from 'https://unpkg.com/@grafana/e2e-selectors/dist/index.js';

const DASHBOARD_TITLE = `e2e-test-dashboard-${uuidv4()}`;
const getDashboardUid = (url) => {
  const matches = new URL(url).pathname.match(/\/d\/([^/]+)/);
  if (!matches) {
    throw new Error(`Couldn't parse uid from ${url}`);
  } else {
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
    dataSourceName.type(`ClickHouse-e2e-test-${uuidv4()}`);
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

    const dashboardUID = getDashboardUid(dashboardURL);

    let saveDashboardData = {
      "annotations": {
        "list": [
          {
            "builtIn": 1,
            "datasource": {
              "type": "grafana",
              "uid": "-- Grafana --"
            },
            "enable": true,
            "hide": true,
            "iconColor": "rgba(0, 211, 255, 1)",
            "name": "Annotations & Alerts",
            "type": "dashboard"
          }
        ]
      },
      "editable": true,
      "fiscalYearStartMonth": 0,
      "graphTooltip": 0,
      "id": 319,
      "links": [],
      "liveNow": false,
      "panels": [
        {
          "datasource": {
            "type": "grafana-clickhouse-datasource",
            "uid": `${dashboardUID}`
          },
          "fieldConfig": {
            "defaults": {
              "color": {
                "mode": "palette-classic"
              },
              "custom": {
                "axisCenteredZero": false,
                "axisColorMode": "text",
                "axisLabel": "",
                "axisPlacement": "auto",
                "barAlignment": 0,
                "drawStyle": "line",
                "fillOpacity": 0,
                "gradientMode": "none",
                "hideFrom": {
                  "legend": false,
                  "tooltip": false,
                  "viz": false
                },
                "lineInterpolation": "linear",
                "lineWidth": 1,
                "pointSize": 5,
                "scaleDistribution": {
                  "type": "linear"
                },
                "showPoints": "auto",
                "spanNulls": false,
                "stacking": {
                  "group": "A",
                  "mode": "none"
                },
                "thresholdsStyle": {
                  "mode": "off"
                }
              },
              "mappings": [],
              "thresholds": {
                "mode": "absolute",
                "steps": [
                  {
                    "color": "green",
                    "value": null
                  },
                  {
                    "color": "red",
                    "value": 80
                  }
                ]
              }
            },
            "overrides": []
          },
          "gridPos": {
            "h": 8,
            "w": 12,
            "x": 0,
            "y": 0
          },
          "id": 1,
          "options": {
            "legend": {
              "calcs": [],
              "displayMode": "list",
              "placement": "bottom",
              "showLegend": true
            },
            "tooltip": {
              "mode": "single",
              "sort": "none"
            }
          },
          "targets": [
            {
              "builderOptions": {
                "database": "system",
                "fields": [
                  "event_time",
                  "memory_usage"
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
                "mode": "aggregate",
                "orderBy": [],
                "table": "query_log",
                "timeFieldType": "DateTime"
              },
              "datasource": {
                "type": "grafana-clickhouse-datasource",
                "uid": `${dashboardUID}`
              },
              "queryType": "builder",
              "rawSql": "SELECT event_time, memory_usage FROM system.\"query_log\" WHERE   ( event_time  >= $__fromTime AND event_time <= $__toTime ) LIMIT 100",
              "refId": "A"
            }
          ],
          "title": "Panel Title",
          "type": "timeseries"
        }
      ],
      "refresh": "",
      "schemaVersion": 38,
      "style": "dark",
      "tags": [],
      "templating": {
        "list": []
      },
      "time": {
        "from": "now-6h",
        "to": "now"
      },
      "timepicker": {},
      "timezone": "",
      "title": `${DASHBOARD_TITLE}`,
      "uid": `${dashboardUID}`,
      "version": 2,
      "weekStart": ""
    }

    const res = http.post('http://localhost:3000/api/dashboards/db/', saveDashboardData, {
      headers: { 'Content-Type': 'application/json' },
    });
    console.log('response1', res.json())

    check(res, {
      'run query returns a response of 200':
      (r) => r.status === 200
    })
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

