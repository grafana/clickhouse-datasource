import { expect, test, ExplorePage } from '@grafana/plugin-e2e';
import { Page, request as apiRequest } from '@playwright/test';

// E2E guard for the logs "Columns" datasource setting (HDX-5008).
//
// A column listed in a datasource's logs.additionalColumns is projected into
// every logs query, then folded into the frame's `labels` field by
// foldDiscoveredLogFieldsIntoLabels (src/data/utils.ts) and removed as a
// standalone field. That is what turns it from a plain grid column into a
// browsable, filterable field in the expanded log row. The fold runs in
// Datasource.query() on the frame the backend returns, only for builder-mode
// logs queries, so:
//   * it is invisible in the raw /api/ds/query HTTP response (it happens client
//     side, after the response), and
//   * SQL-mode queries skip it entirely.
// That is why the unit tests over synthetic frames (src/data/utils.test.ts)
// cannot catch a regression that only appears once Grafana renders the frame.
//
// This spec drives the setting end to end on both a non-OTel logs table
// (e2e_test.events) and an OTel logs table (e2e_test.otel_logs_v151), which
// exercise the two fold paths: events has no attribute maps so the backend
// returns no `labels` and the fold creates one as an object; otel_logs_v151 has
// the OTel attribute maps so the backend returns `labels` as a JSON string and
// the fold merges into it. Fixtures come from the e2e-data-loader service
// (tests/e2e/fixtures/seed.sql and otel_logs_v0151.sql).
//
// The datasources are single-source logs datasources created via the Grafana
// API in beforeAll and removed in afterAll, so no provisioning changes are
// needed. Connection fields are inherited from the base e2e datasource; a
// password cannot be inherited (secure fields are write-only), so this needs a
// passwordless ClickHouse like the local dev stack, hence the isCloudRun skip.

const PLUGIN_TYPE = 'grafana-clickhouse-datasource';

const isCloudRun = !!process.env.GRAFANA_URL;

// Connection settings are inherited from this datasource so the spec works
// wherever the standard e2e datasource points (docker-compose, custom stacks).
const BASE_DATASOURCE_UID = process.env.DS_E2E_UID || 'clickhouse-e2e';
const BASE_URL = process.env.GRAFANA_URL || `http://localhost:${process.env.PORT || 3000}`;

// Window covering both fixtures (2024-03-15 ~10:00 UTC), matching the range the
// sibling fixture specs use.
const FIXTURE_FROM_ISO = '2024-03-15T09:45:00.000Z';
const FIXTURE_TO_ISO = '2024-03-15T10:15:00.000Z';

interface LogsColumnsCase {
  title: string;
  uid: string;
  name: string;
  table: string;
  otelEnabled: boolean;
  otelVersion?: string;
  // Role columns for the non-OTel table. Omitted for OTel, where the schema
  // supplies the roles via the 'latest' OTel version.
  timeColumn?: string;
  levelColumn?: string;
  messageColumn?: string;
  // The datasource's configured extra column: the field this spec expects to be
  // folded into `labels` and become filterable in the expanded log row. Its
  // literal `service` / `ServiceName` text only ever renders as the field name
  // in the expanded row (the compact editor shows no column list), never as a
  // log-line value, so it is safe to locate by exact text.
  additionalColumn: string;
}

const CASES: LogsColumnsCase[] = [
  {
    title: 'non-OTel logs table (e2e_test.events)',
    uid: 'clickhouse-e2e-logs-columns-non-otel',
    name: 'ClickHouse Logs Columns non-OTel (e2e)',
    table: 'events',
    otelEnabled: false,
    timeColumn: 'timestamp',
    levelColumn: 'level',
    messageColumn: 'message',
    additionalColumn: 'service',
  },
  {
    title: 'OTel logs table (e2e_test.otel_logs_v151)',
    uid: 'clickhouse-e2e-logs-columns-otel',
    name: 'ClickHouse Logs Columns OTel (e2e)',
    table: 'otel_logs_v151',
    otelEnabled: true,
    otelVersion: 'latest',
    additionalColumn: 'ServiceName',
  },
];

async function newAdminApiContext() {
  return apiRequest.newContext({
    baseURL: BASE_URL,
    httpCredentials: {
      username: process.env.GRAFANA_ADMIN_USER || 'admin',
      password: process.env.GRAFANA_ADMIN_PASSWORD || 'admin',
    },
  });
}

async function deleteTestDataSources() {
  const ctx = await newAdminApiContext();
  for (const c of CASES) {
    // Returns 404 when absent; APIRequestContext does not throw on non-2xx.
    await ctx.delete(`/api/datasources/uid/${c.uid}`);
  }
  await ctx.dispose();
}

// Creates one single-source logs datasource per case, configured with the extra
// column via logs.additionalColumns. Connection fields (host/port/protocol/TLS)
// come from the base e2e datasource.
async function createTestDataSources() {
  const ctx = await newAdminApiContext();
  const baseRes = await ctx.get(`/api/datasources/uid/${BASE_DATASOURCE_UID}`);
  if (!baseRes.ok()) {
    throw new Error(`Failed to read base datasource ${BASE_DATASOURCE_UID}: ${baseRes.status()}`);
  }
  const baseJsonData = (await baseRes.json())?.jsonData ?? {};

  for (const c of CASES) {
    const logs: Record<string, unknown> = {
      defaultDatabase: 'e2e_test',
      defaultTable: c.table,
      otelEnabled: c.otelEnabled,
      additionalColumns: [c.additionalColumn],
    };
    if (c.otelVersion) {
      logs.otelVersion = c.otelVersion;
    }
    if (c.timeColumn) {
      logs.filterTimeColumn = c.timeColumn;
      logs.timeColumn = c.timeColumn;
    }
    if (c.levelColumn) {
      logs.levelColumn = c.levelColumn;
    }
    if (c.messageColumn) {
      logs.messageColumn = c.messageColumn;
    }

    const res = await ctx.post('/api/datasources', {
      data: {
        name: c.name,
        uid: c.uid,
        type: PLUGIN_TYPE,
        access: 'proxy',
        jsonData: {
          ...baseJsonData,
          database: 'e2e_test',
          configMode: 'single-table',
          signalType: 'logs',
          logs,
        },
      },
    });
    // 409 = already created by a parallel worker; anything else is a real failure.
    if (!res.ok() && res.status() !== 409) {
      throw new Error(`Failed to create e2e datasource ${c.uid}: ${res.status()} ${await res.text()}`);
    }
  }
  await ctx.dispose();
}

function exploreUrl(datasourceUid: string): string {
  const query = {
    refId: 'A',
    datasource: { type: PLUGIN_TYPE, uid: datasourceUid },
    editorType: 'sql',
    pluginVersion: '',
    rawSql: '',
  };
  const panes = JSON.stringify({
    explore: {
      datasource: datasourceUid,
      queries: [query],
      range: { from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO },
    },
  });
  return `/explore?orgId=1&schemaVersion=1&panes=${encodeURIComponent(panes)}`;
}

async function waitForQueryDataResponseWithBody(explorePage: ExplorePage) {
  let body: Record<string, unknown> | null = null;
  const responsePromise = explorePage.waitForQueryDataResponse(async (r) => {
    if (!r.ok()) {
      return false;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = await r.json().catch(() => null);
    if (!Array.isArray(b?.results?.A?.frames)) {
      return false;
    }
    body = b as Record<string, unknown>;
    return true;
  });
  return { responsePromise, getBody: () => body };
}

function rowCount(body: Record<string, unknown> | null): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const frames = (body as any)?.results?.A?.frames;
  if (!Array.isArray(frames) || frames.length === 0) {
    return 0;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const values = (frames[0] as any)?.data?.values?.[0];
  return Array.isArray(values) ? values.length : 0;
}

// Switch a single-source datasource's editor into the compact logs view, which
// builds a builder-mode logs query from the datasource config (roles plus the
// configured additionalColumns), then run it and wait for rows. The response
// wait is armed before the switch so it also catches an auto-run. The run is
// triggered from the Explore toolbar: the compact bar replaces the in-row Run
// Query button, and this RefreshPicker testid is stable across the CI Grafana
// matrix.
async function runCompactLogsQuery(page: Page, explorePage: ExplorePage) {
  const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);

  await page.getByRole('button', { name: 'Switch to compact view' }).click();
  await expect(page.locator('[data-testid="compact-filter-bar"]')).toBeVisible();

  await page.locator('[data-testid="data-testid RefreshPicker run button"]').click();

  await responsePromise;
  return { getBody };
}

// ---------------------------------------------------------------------------
// The expanded-row helpers below are the version-agnostic pattern from
// toggleableFilters.spec.ts (proven across the CI Grafana matrix). Two
// structurally different logs-panel DOMs exist (legacy <tr> rows vs the new
// LogList <div> rows), so `openFirstLogRowDetails` probes both.
// ---------------------------------------------------------------------------

const LOGS_PANEL_LOCATORS = {
  legacyRowAriaLabel: /^See log details/i,
  newPanelMenuLabel: /^Log menu$/i,
  newPanelShowDetailsLabel: /^Show log details$/i,
  filterForLabel: /Filter for value/i,
};

async function openFirstLogRowDetails(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {});

  const legacyRow = page.getByRole('row', { name: LOGS_PANEL_LOCATORS.legacyRowAriaLabel }).first();
  if (await legacyRow.isVisible({ timeout: 2000 }).catch(() => false)) {
    const detailsButton = legacyRow.getByRole('button', { name: 'See log details' });
    await expect(detailsButton).toBeVisible();
    const expanded = (await detailsButton.getAttribute('aria-expanded')) === 'true';
    if (!expanded) {
      await detailsButton.click();
    }
    return;
  }

  // New panel/LogList (Grafana >=12.4, newLogsPanel GA + default on).
  const firstLogMenu = page.getByRole('button', { name: LOGS_PANEL_LOCATORS.newPanelMenuLabel }).first();
  await expect(firstLogMenu).toBeVisible();
  await firstLogMenu.click();
  const showDetails = page.getByRole('menuitem', { name: LOGS_PANEL_LOCATORS.newPanelShowDetailsLabel });
  await expect(showDetails).toBeVisible();
  await showDetails.click();
}

// The + "Filter for value" button that sits on the expanded-row line for a
// specific detail field. `openFirstLogRowDetails` exposes several such buttons
// (one per filterable field); scope to the closest ancestor of the field name
// that also contains a Filter-for button so we click the folded column's row,
// not another field's. Element-agnostic (works for both the <tr> and <div>
// panel DOMs).
function filterForButtonForField(page: Page, fieldName: string) {
  return page
    .getByText(fieldName, { exact: true })
    .locator('xpath=ancestor-or-self::*[.//button[contains(@aria-label, "Filter for value")]][1]')
    .getByRole('button', { name: LOGS_PANEL_LOCATORS.filterForLabel })
    .first();
}

async function waitForNextQueryRequestBody(page: Page): Promise<any> {
  const requestPromise = page.waitForRequest((r) => r.url().includes('/api/ds/query') && r.method() === 'POST');
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/ds/query') && r.request().method() === 'POST' && r.ok()
  );
  const [req] = await Promise.all([requestPromise, responsePromise]);
  return JSON.parse(req.postData() || '{}');
}

function firstQueryFromBody(body: any): any {
  const queries = body?.queries;
  return Array.isArray(queries) ? queries[0] : undefined;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Logs Columns datasource setting (HDX-5008)', () => {
  // Serial keeps every test in one worker so the beforeAll/afterAll datasource
  // lifecycle cannot race a test running in a parallel worker.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    if (isCloudRun) {
      return;
    }
    // Recreate from scratch so a leftover datasource from an aborted run cannot
    // poison this run.
    await deleteTestDataSources();
    await createTestDataSources();
  });

  test.afterAll(async () => {
    if (isCloudRun) {
      return;
    }
    await deleteTestDataSources();
  });

  test.beforeEach(() => {
    test.skip(
      isCloudRun,
      'Depends on the local e2e_test fixtures (tests/e2e/fixtures/seed.sql and otel_logs_v0151.sql) loaded via the e2e-data-loader Docker service, which is not available on Cloud.'
    );
  });

  for (const c of CASES) {
    test(`folds the configured column into a filterable log field: ${c.title}`, async ({ page, explorePage }) => {
      await page.goto(exploreUrl(c.uid));

      // The compact logs query projects roles plus the configured
      // additionalColumns and returns rows; a fold that threw on the real frame
      // would surface as a panel error / zero rows here.
      const { getBody } = await runCompactLogsQuery(page, explorePage);
      expect(rowCount(getBody())).toBeGreaterThan(0);

      // Once Grafana renders the frame, the folded column is a field in the
      // expanded log row. Without the fold it is a standalone frame field, not
      // a browsable/filterable detail field.
      await openFirstLogRowDetails(page);
      await expect(page.getByText(c.additionalColumn, { exact: true }).first()).toBeVisible();

      // Filter-for on the folded field must regenerate the builder query with a
      // WHERE on the real column name. The fold folds under the real name (not
      // an alias) precisely so filter-for resolves in both the main and
      // logs-volume queries; the regenerated rawSql is the definitive proof.
      const requestPromise = waitForNextQueryRequestBody(page);
      await filterForButtonForField(page, c.additionalColumn).click();
      const body = await requestPromise;

      const q = firstQueryFromBody(body);
      expect(q?.editorType).toBe('builder');
      expect(String(q?.rawSql ?? '')).toMatch(new RegExp(`${c.additionalColumn}\\s*=\\s*'`));
    });
  }
});
