import { expect, test } from '@grafana/plugin-e2e';
import type { Page, Request } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { FIXTURE_FROM_ISO, FIXTURE_TO_ISO, skipFixtureTestsOnCloud } from '../helpers/env';
import { frameValues, QueryDataBody, rowCount } from '../helpers/queryResponse';

// E2E coverage for frontend template-variable interpolation on a dashboard.
// applyTemplateVariables and applyConditionalAll in src/data/CHDatasource.ts
// are unit tested against a mocked templateSrv, but only a live dashboard
// proves that Grafana's variable system (legacy and scenes) hands the plugin
// real variable state (All, single and multi selections) and that the
// interpolated SQL both looks right on the wire and executes on ClickHouse.
// $__conditionalAll historically broke when the variable state shape changed
// (#262: empty/All values must collapse to a no-op predicate).
//
// The dashboard under test is tests/e2e/dashboards/variables-dashboard.json,
// imported fresh via the HTTP API in beforeEach so saved state from a prior
// run can never leak in. Variable values are set through the dashboard URL
// (var-service=...), which is stable across Grafana versions, rather than by
// driving the variable value picker UI.

const DASHBOARD_UID = 'e2e-variables-dash';

// Parsed once per worker. resolveJsonModule is not relied on because the
// e2e specs sit outside the tsconfig include set.
const dashboardJson = JSON.parse(
  readFileSync(join(__dirname, '..', 'dashboards', 'variables-dashboard.json'), 'utf-8')
) as Record<string, unknown>;

// Shape of the /api/ds/query POST body this spec drills into: one target per
// panel, carrying the frontend-interpolated rawSql.
interface DsQueryTarget {
  refId?: string;
  rawSql?: string;
}

interface DsQueryRequestBody {
  queries?: DsQueryTarget[];
}

/**
 * The target with the given refId from a /api/ds/query POST body, or
 * undefined when the request is not a data query or carries no such target.
 */
function targetInRequest(request: Request, refId: string): DsQueryTarget | undefined {
  if (!request.url().includes('/api/ds/query') || request.method() !== 'POST') {
    return undefined;
  }
  let parsed: DsQueryRequestBody | null = null;
  try {
    parsed = request.postDataJSON();
  } catch {
    return undefined;
  }
  return parsed?.queries?.find((query) => query.refId === refId);
}

interface CapturedPanelQuery {
  /** The interpolated rawSql the frontend posted for the panel's target. */
  rawSql: string;
  /** Whether the /api/ds/query response was HTTP OK. */
  ok: boolean;
  /** Parsed response body, for row-count and value assertions. */
  body: QueryDataBody | null;
}

/**
 * Start waiting for the dashboard panel query with the given refId. Call
 * BEFORE gotoDashboardPage so the panel query fired during navigation cannot
 * be missed; each dashboard panel posts its own /api/ds/query request.
 */
async function capturePanelQuery(page: Page, refId: string): Promise<CapturedPanelQuery> {
  const response = await page.waitForResponse((candidate) => targetInRequest(candidate.request(), refId) !== undefined);
  const target = targetInRequest(response.request(), refId);
  const body = (await response.json().catch(() => null)) as QueryDataBody | null;
  return { rawSql: target?.rawSql ?? '', ok: response.ok(), body };
}

/**
 * URL query params pinning the fixture time window and selecting the given
 * service variable values. Repeating var-service selects multiple values and
 * '$__all' selects the All option. The time window is folded into queryParams
 * (rather than passed as timeRange) because DashboardPage.goto discards
 * args.queryParams whenever timeRange is also set.
 */
function dashboardParams(...serviceValues: string[]): URLSearchParams {
  const params = new URLSearchParams();
  params.append('from', FIXTURE_FROM_ISO);
  params.append('to', FIXTURE_TO_ISO);
  for (const value of serviceValues) {
    params.append('var-service', value);
  }
  return params;
}

// Seeded service counts in e2e_test.events (tests/e2e/fixtures/seed.sql):
// api=3, worker=3, cache=1, scheduler=2, db=1; 10 rows in total.

test.describe('Dashboard variable interpolation', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    skipFixtureTestsOnCloud('seed.sql');
    // page.request carries the logged-in session cookies, so the import runs
    // as the authenticated test user without extra setup.
    const imported = await page.request.post('/api/dashboards/db', {
      data: { dashboard: dashboardJson, overwrite: true },
    });
    expect(imported.ok()).toBeTruthy();
  });

  test('All selection collapses $__conditionalAll to 1=1 and returns every seeded row (#262)', async ({
    page,
    gotoDashboardPage,
  }) => {
    const panelQuery = capturePanelQuery(page, 'A');
    const dashboardPage = await gotoDashboardPage({ uid: DASHBOARD_UID, queryParams: dashboardParams('$__all') });
    const { rawSql, ok, body } = await panelQuery;

    // The macro must be resolved on the frontend: neither it nor the
    // unexpanded variable may reach the backend.
    expect(rawSql).toContain('WHERE 1=1');
    expect(rawSql).not.toContain('$__conditionalAll');
    expect(rawSql).not.toContain('$service');

    // seed.sql inserts 10 rows across all five services; All returns them all.
    expect(ok).toBeTruthy();
    expect(rowCount(body, 'A')).toBe(10);

    // And the table panel actually renders the data without a panel error.
    const panel = dashboardPage.getPanelByTitle('Events by service');
    await expect(panel.getErrorIcon()).toBeHidden();
    await expect(panel.data.filter({ hasText: 'Service started' }).first()).toBeVisible();
  });

  test('a single concrete selection re-queries with a quoted IN filter', async ({ page, gotoDashboardPage }) => {
    const panelQuery = capturePanelQuery(page, 'A');
    const dashboardPage = await gotoDashboardPage({ uid: DASHBOARD_UID, queryParams: dashboardParams('api') });
    const { rawSql, ok, body } = await panelQuery;

    // With a concrete value selected the macro keeps its first argument and
    // $service interpolates to the quoted value (see CHDatasource.format).
    expect(rawSql).toContain("WHERE service IN ('api')");
    expect(rawSql).not.toContain('1=1');

    // seed.sql has exactly 3 api rows (10:00, 10:01, 10:02).
    expect(ok).toBeTruthy();
    expect(rowCount(body, 'A')).toBe(3);
    // Columns are timestamp, level, message, service; every row must be api.
    expect(frameValues(body, 'A')[3]).toEqual(['api', 'api', 'api']);

    // The worker-only row must not be rendered once the filter applies.
    const panel = dashboardPage.getPanelByTitle('Events by service');
    await expect(panel.data.filter({ hasText: 'Service started' }).first()).toBeVisible();
    await expect(panel.data.filter({ hasText: 'High memory usage' })).toHaveCount(0);
  });

  test('a multi-value selection interpolates a quoted IN list that executes', async ({ page, gotoDashboardPage }) => {
    const panelQuery = capturePanelQuery(page, 'A');
    const dashboardPage = await gotoDashboardPage({
      uid: DASHBOARD_UID,
      queryParams: dashboardParams('api', 'scheduler'),
    });
    const { rawSql, ok, body } = await panelQuery;

    // The datasource's default multi-value format quotes each value and joins
    // with commas, producing SQL ClickHouse accepts.
    expect(rawSql).toContain("WHERE service IN ('api','scheduler')");

    // 3 api rows + 2 scheduler rows in seed.sql, in timestamp order.
    expect(ok).toBeTruthy();
    expect(rowCount(body, 'A')).toBe(5);
    expect(frameValues(body, 'A')[3]).toEqual(['api', 'api', 'api', 'scheduler', 'scheduler']);

    const panel = dashboardPage.getPanelByTitle('Events by service');
    await expect(panel.getErrorIcon()).toBeHidden();
  });

  test('the sqlstring format specifier quotes and escapes values in the second panel', async ({
    page,
    gotoDashboardPage,
  }) => {
    const panelQuery = capturePanelQuery(page, 'B');
    const dashboardPage = await gotoDashboardPage({ uid: DASHBOARD_UID, queryParams: dashboardParams('worker', 'db') });
    const { rawSql, ok, body } = await panelQuery;

    // Grafana's sqlstring formatter single-quotes each value (doubling any
    // embedded quotes) and joins with commas. The raw ${service:sqlstring}
    // token must never reach the backend.
    expect(rawSql).toContain("WHERE service IN ('worker','db')");
    expect(rawSql).not.toContain('sqlstring');

    // 3 worker rows + 1 db row in seed.sql, in timestamp order.
    expect(ok).toBeTruthy();
    expect(rowCount(body, 'B')).toBe(4);
    expect(frameValues(body, 'B')[3]).toEqual(['worker', 'worker', 'worker', 'db']);

    const panel = dashboardPage.getPanelByTitle('Events by service (sqlstring)');
    await expect(panel.getErrorIcon()).toBeHidden();
    await expect(panel.data.filter({ hasText: 'High memory usage' }).first()).toBeVisible();
  });
});
