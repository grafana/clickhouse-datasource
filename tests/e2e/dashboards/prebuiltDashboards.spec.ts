// E2E smoke coverage for the dashboards bundled with the plugin
// (src/dashboards/*.json, listed under `includes` in src/plugin.json). The
// dashboards are pure JSON carrying hand-written ClickHouse SQL against
// system.* tables, so no unit test can catch a rawSql that ClickHouse rejects
// (#535) or a datasource reference that breaks on import (#1896); both have
// shipped broken before. Each test imports a dashboard through Grafana's
// plugin dashboard import API, opens it, waits for every panel query to
// complete and asserts the dashboard renders with zero panel errors.
//
// The dashboards keep their shipped relative time ranges (now-24h / now-6h),
// which is correct here: they query wall-clock system tables, not the seeded
// e2e_test fixture tables, so the pinned fixture window does not apply.

import { expect, test, type DashboardPage } from '@grafana/plugin-e2e';
import type { Page } from '@playwright/test';
import { isCloudRun, PLUGIN_TYPE } from '../helpers/env';

// Minimal slice of the plugin dashboard import response (Grafana's dashboard
// import service ImportDashboardResponse): the saved dashboard uid plus the
// imported flag.
interface ImportDashboardResponse {
  uid: string;
  imported: boolean;
  title: string;
}

// Minimal slice of the /api/ds/query response: per-refId results with an
// optional error string. Complements tests/e2e/helpers/queryResponse.ts,
// which models the frames side of the same body.
interface QueryDataResults {
  results?: Record<string, { error?: string } | undefined>;
}

interface QueryErrorCollector {
  /** Waits for all in-flight body parses, then returns the collected errors. */
  flush(): Promise<string[]>;
  /** Milliseconds since the last /api/ds/query request, response or abort. */
  msSinceLastQueryActivity(): number;
}

/**
 * Imports one of the plugin's bundled dashboards via Grafana's plugin
 * dashboard import API and returns the saved dashboard uid.
 */
async function importPluginDashboard(page: Page, fileName: string): Promise<string> {
  const response = await page.request.post('/api/dashboards/import', {
    data: {
      pluginId: PLUGIN_TYPE,
      // Must match the dashboard's `path` under `includes` in src/plugin.json.
      path: `dashboards/${fileName}`,
      // Re-runs and retries update the already-imported dashboard rather than
      // failing on the name/uid collision.
      overwrite: true,
      // None of the bundled dashboards declare __inputs entries (data-analysis
      // omits the block entirely, the other two ship an empty array). Since
      // #1896 they bind to a datasource through the `datasource` template
      // variable at load time instead of a ${DS_*} __inputs mapping, so the
      // import needs no input values. If an unmapped __inputs reference were
      // ever reintroduced, the affected panels would fail to resolve their
      // datasource and the zero-panel-errors assertion would catch it.
      inputs: [],
    },
  });
  expect(response.ok(), `importing ${fileName} returned HTTP ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as ImportDashboardResponse;
  expect(body.imported, `Grafana did not report ${fileName} as imported`).toBe(true);
  return body.uid;
}

/**
 * Records every /api/ds/query response issued while the dashboard loads
 * (panel queries and template-variable queries alike) and collects any
 * failure: a non-2xx status or a per-refId error in the body. Attach before
 * navigating so the initial variable queries are seen too.
 */
function collectDataSourceQueryErrors(page: Page): QueryErrorCollector {
  const errors: string[] = [];
  const parsing: Array<Promise<void>> = [];
  // Grafana 12.4+ Scenes cancels in-flight panel queries when a lazily
  // rendered panel scrolls back out of the viewport. An aborted request never
  // emits a response event, only requestfailed, so anything that pairs
  // requests with responses (like plugin-e2e's pendingQueryCount) wedges
  // permanently once a cancellation happens. Track last-activity time across
  // all three event types instead, and let callers wait for quiescence.
  let lastActivity = Date.now();
  page.on('request', (request) => {
    if (request.url().includes('/api/ds/query')) {
      lastActivity = Date.now();
    }
  });
  page.on('requestfailed', (request) => {
    if (request.url().includes('/api/ds/query')) {
      lastActivity = Date.now();
    }
  });
  page.on('response', (response) => {
    if (!response.url().includes('/api/ds/query')) {
      return;
    }
    lastActivity = Date.now();
    if (!response.ok()) {
      errors.push(`HTTP ${response.status()} from ${response.url()}`);
    }
    parsing.push(
      response
        .json()
        .then((body: unknown) => {
          const results = (body as QueryDataResults).results ?? {};
          for (const [refId, result] of Object.entries(results)) {
            if (result?.error) {
              errors.push(`refId ${refId}: ${result.error}`);
            }
          }
        })
        .catch(() => {
          // Body was not JSON or was disposed before parsing; the HTTP status
          // check above still covers the failure.
        })
    );
  });
  return {
    flush: async () => {
      await Promise.all(parsing);
      return errors;
    },
    msSinceLastQueryActivity: () => Date.now() - lastActivity,
  };
}

/**
 * Scroll the dashboard viewport-by-viewport so Scenes' IntersectionObserver
 * mounts every lazily rendered row and its panels fire their queries. The
 * 500ms pause per step gives the observer time to fire before moving on.
 */
async function scrollToRevealAllPanels(page: Page): Promise<void> {
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  let scrollY = 0;
  for (;;) {
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    if (scrollY >= scrollHeight) {
      break;
    }
    scrollY = Math.min(scrollY + viewportHeight, scrollHeight);
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await page.waitForTimeout(500);
  }
}

/**
 * Wait until no /api/ds/query activity (request, response or abort) has been
 * observed for a settle window. Unlike request/response pairing this cannot
 * wedge on queries Scenes cancels mid-flight.
 */
async function waitForQueryQuiescence(queryErrors: QueryErrorCollector, timeout = 60_000): Promise<void> {
  await expect
    .poll(() => queryErrors.msSinceLastQueryActivity() >= 1_500, {
      timeout,
      message: 'expected /api/ds/query traffic to go quiet after revealing all panels',
    })
    .toBe(true);
}

/**
 * Shared assertion for an imported dashboard: every query the dashboard
 * issued succeeded, the body rendered, and no panel shows an error status.
 */
async function assertAllPanelsHealthy(
  page: Page,
  dashboardPage: DashboardPage,
  queryErrors: QueryErrorCollector,
  anchorPanelTitle: string
): Promise<void> {
  // Scenes lazy-renders below-fold panels, and all three dashboards are
  // several screens tall; scrolling reveals every row so each panel's query
  // fires. Quiescence (rather than plugin-e2e's request/response pairing,
  // which wedges when 12.4+ cancels queries on panel unmount) then tells us
  // the dashboard has finished querying.
  await scrollToRevealAllPanels(page);
  await waitForQueryQuiescence(queryErrors);

  // Backend truth first: every /api/ds/query must have come back error-free.
  // A regressed bundled rawSql (#535) fails here with the offending refId and
  // the ClickHouse error text, which is far more diagnosable than an error
  // icon count.
  expect(await queryErrors.flush()).toEqual([]);

  // UI truth second: no panel shows the error status indicator. This also
  // catches frontend-only failures that never issue a query at all, such as a
  // panel pointing at an unresolvable datasource after import (#1896).
  // Scenes unmounts panels that leave the viewport, so the matcher only sees
  // the panels currently mounted; check here at the bottom (where scrollAll
  // left us, with the below-fold rows mounted) and again at the top below.
  await expect(dashboardPage).toHavePanelErrors(0);

  // scrollAll finishes with the viewport at the bottom of the dashboard and
  // Scenes has unmounted the above-fold rows, so scroll back to the top to
  // remount them before asserting on the anchor panel. Remounting re-fires
  // those panels' queries, so wait for quiet again and re-flush the collector
  // before the final error assertions.
  await page.evaluate(() => window.scrollTo(0, 0));
  await waitForQueryQuiescence(queryErrors);
  expect(await queryErrors.flush()).toEqual([]);

  // A known above-the-fold panel being visible proves the dashboard body
  // actually rendered, so the zero-error counts cannot pass vacuously
  // against a blank or missing dashboard.
  await expect(dashboardPage.getPanelByTitle(anchorPanelTitle).locator).toBeVisible();
  await expect(dashboardPage).toHavePanelErrors(0);
}

test.describe('Pre-built dashboards (#535, #1896)', () => {
  test.skip(
    isCloudRun,
    'Imports the plugin-bundled dashboards against the locally provisioned datasource; the Cloud instance manages its own plugin install and datasources, so the import path differs there.'
  );

  // These are the heaviest tests in the suite: each imports a dashboard and
  // fully renders several screens of panels, so under fully-parallel local
  // runs the default budget is marginal. slow() triples the timeout.
  test.beforeEach(() => {
    test.slow();
  });

  test('Data Analysis dashboard imports and renders without panel errors', async ({ page, gotoDashboardPage }) => {
    // Queries system.databases/tables/columns/parts/disks/dictionaries/
    // detached_parts, all of which exist on any ClickHouse server. The
    // database and table template variables resolve on load, so their
    // queries are covered by the error collector too.
    const uid = await importPluginDashboard(page, 'data-analysis.json');
    const queryErrors = collectDataSourceQueryErrors(page);
    const dashboardPage = await gotoDashboardPage({ uid });
    await assertAllPanelsHealthy(page, dashboardPage, queryErrors, 'Disk usage');
  });

  test('Query Analysis dashboard imports and renders without panel errors', async ({ page, gotoDashboardPage }) => {
    // Every panel and template variable queries system.query_log. ClickHouse
    // creates that table lazily on the first logged query, but by the time
    // this test runs the e2e-data-loader (and Grafana's own health checks and
    // variable queries) have long since populated it, so the queries both
    // parse and return rows within the dashboard's now-24h window.
    const uid = await importPluginDashboard(page, 'query-analysis.json');
    const queryErrors = collectDataSourceQueryErrors(page);
    const dashboardPage = await gotoDashboardPage({ uid });
    await assertAllPanelsHealthy(page, dashboardPage, queryErrors, 'Query time distribution');
  });

  test('Cluster Analysis dashboard imports and renders without panel errors', async ({ page, gotoDashboardPage }) => {
    // The cluster-specific tables this dashboard queries (system.clusters,
    // system.merges, system.mutations, system.replicas) all exist on a
    // single-node ClickHouse; on the local test server they are simply empty
    // or near-empty, which renders as "No data" rather than a panel error.
    // Zero panel errors is therefore the correct expectation here too; no
    // panel needs a tolerated failure state. The dashboard also ships an ad
    // hoc filter variable pinned to a stale datasource uid (y-Ka8y37k), but
    // with no filters set it contributes nothing to the panel queries and
    // surfaces no panel error.
    const uid = await importPluginDashboard(page, 'cluster-analysis.json');
    const queryErrors = collectDataSourceQueryErrors(page);
    const dashboardPage = await gotoDashboardPage({ uid });
    await assertAllPanelsHealthy(page, dashboardPage, queryErrors, 'Cluster Overview');
  });
});
