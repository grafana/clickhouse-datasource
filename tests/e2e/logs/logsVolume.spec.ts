import { expect, test, ExplorePage } from '@grafana/plugin-e2e';
import type { Page, Request } from '@playwright/test';
import { QueryType } from '../../../src/types/queryBuilder';
import { FIXTURE_FROM_ISO, FIXTURE_TO_ISO, skipFixtureTestsOnCloud } from '../helpers/env';
import { exploreUrl } from '../helpers/explore';
import { pickBuilderSelect, switchToBuilderMode } from '../helpers/builder';
import { frameFields, frames, frameValues, rowCount, waitForQueryDataResponseWithBody } from '../helpers/queryResponse';
import { enterSql, runQuery } from '../helpers/sqlEditor';

// ---------------------------------------------------------------------------
// Logs volume histogram supplementary query (#352, #480)
//
// Unit tests in src/data/CHDatasource.test.ts cover getSupplementaryRequest
// and getSupplementaryLogsVolumeQuery at the JS level. Only E2E can confirm
// the full Explore wiring: Grafana asking the datasource for a supplementary
// request when a builder-mode Logs query runs, the generated histogram SQL
// actually executing on ClickHouse, per-level counts arriving in the real
// response (the grouping regression in #363), and the builder-mode-only gate
// in getSupportedSupplementaryQueryTypes suppressing the histogram for
// SQL-mode queries. The feature has been rebuilt twice, so these tests lock
// in the externally observable contract rather than the implementation.
//
// Driving path: the classic datasource with switchToBuilderMode plus explicit
// column picks. The compact single-logs editor is also builder-backed, but
// the classic builder flow is already proven by the columnAutodetect and
// toggleableFilters specs and does not depend on the compact-view toggle.
// ---------------------------------------------------------------------------

// Mirrors Datasource.logVolumePrefix in src/data/CHDatasource.ts. The primary
// Explore query keeps refId 'A', so its volume counterpart is 'log-volume-A'.
const LOG_VOLUME_PREFIX = 'log-volume-';
const VOLUME_REF_ID = `${LOG_VOLUME_PREFIX}A`;

// Minimal typed view of the /api/ds/query request body the assertions read.
interface QueryRequestBody {
  queries?: Array<{ refId?: string; rawSql?: string }>;
}

/** True when a request is an /api/ds/query POST carrying a log-volume refId. */
function isLogVolumeRequest(request: Request): boolean {
  if (!request.url().includes('/api/ds/query') || request.method() !== 'POST') {
    return false;
  }
  let body: QueryRequestBody;
  try {
    body = JSON.parse(request.postData() ?? '{}') as QueryRequestBody;
  } catch {
    return false;
  }
  return (body.queries ?? []).some((q) => q.refId?.startsWith(LOG_VOLUME_PREFIX) === true);
}

/**
 * Point the Logs builder at the seed fixture: e2e_test.events with
 * timestamp/message/level mapped to Time/Message/Log Level. The Log Level
 * pick is what makes getSupplementaryLogsVolumeQuery emit one sum() per
 * canonical level instead of the count(*) fallback, so the picks double as
 * the precondition for the grouping assertions.
 */
async function configureLogsBuilderAgainstFixture(page: Page) {
  await pickBuilderSelect(page, 'Database', 'e2e_test');
  await pickBuilderSelect(page, 'Table', 'events');
  await pickBuilderSelect(page, 'Time', 'timestamp', { allowAutoPopulated: true });
  await pickBuilderSelect(page, 'Message', 'message', { allowAutoPopulated: true });
  await pickBuilderSelect(page, 'Log Level', 'level', { allowAutoPopulated: true });
}

/**
 * Run the builder query and capture both /api/ds/query exchanges. Both
 * waiters are registered before the run because Explore dispatches the
 * supplementary volume request alongside the primary one, so the two
 * responses can land in either order. Each waiter only resolves for an OK
 * response carrying frames for its refId, so a resolved volume promise
 * already proves the supplementary query succeeded.
 */
async function runLogsQueryAndCaptureVolume(page: Page, explorePage: ExplorePage) {
  const primary = await waitForQueryDataResponseWithBody(explorePage, 'A');
  const volume = await waitForQueryDataResponseWithBody(explorePage, VOLUME_REF_ID);
  await runQuery(page);
  const [, volumeResponse] = await Promise.all([primary.responsePromise, volume.responsePromise]);
  return { volumeResponse, primaryBody: primary.getBody(), volumeBody: volume.getBody() };
}

/**
 * Sum a named level column across all time buckets of the volume frame.
 * The bucket interval depends on Explore's viewport width, but the per-level
 * totals are invariant to it, which keeps the assertions deterministic.
 */
function levelTotal(fieldNames: string[], values: unknown[][], level: string): number {
  const index = fieldNames.indexOf(level);
  if (index === -1) {
    throw new Error(`expected a '${level}' column in the volume frame, got: ${fieldNames.join(', ')}`);
  }
  const column = values[index] ?? [];
  return column.reduce((total: number, value) => total + Number(value), 0);
}

test.describe('Logs volume histogram supplementary query (#352, #480)', () => {
  // Local runs are fullyParallel against a single ClickHouse instance.
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => {
    skipFixtureTestsOnCloud('seed.sql');
  });

  test.describe('Builder mode (Logs)', () => {
    // The explorePage fixture navigates to a bare /explore during its setup.
    // It must be requested here, not only in the test bodies: fixtures
    // initialize immediately before the first function that declares them,
    // so requesting it only in a test would run that navigation AFTER this
    // hook and wipe the builder state it configures (the query editor and
    // time range reset to defaults, and the run then never produces frames).
    test.beforeEach(async ({ page, explorePage }) => {
      void explorePage;
      await page.goto(exploreUrl({ queryType: QueryType.Logs, from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
      await switchToBuilderMode(page, QueryType.Logs);
      await configureLogsBuilderAgainstFixture(page);
    });

    test('running a Logs query fires a successful log-volume request and renders the histogram', async ({
      page,
      explorePage,
    }) => {
      const { volumeResponse, primaryBody, volumeBody } = await runLogsQueryAndCaptureVolume(page, explorePage);

      // The primary query returned log rows (seed.sql has 10 rows in the
      // pinned window), and the volume exchange is a second, separate
      // request: its body carries only 'log-volume-' refIds.
      expect(frames(primaryBody).length).toBeGreaterThan(0);
      const volumeRequestBody = JSON.parse(volumeResponse.request().postData() ?? '{}') as QueryRequestBody;
      const volumeQueries = volumeRequestBody.queries ?? [];
      expect(volumeQueries.length).toBeGreaterThan(0);
      expect(volumeQueries.every((q) => q.refId?.startsWith(LOG_VOLUME_PREFIX) === true)).toBe(true);
      // The supplementary SQL is a real histogram query against the fixture table.
      expect(volumeQueries[0]?.rawSql ?? '').toContain('"e2e_test"."events"');

      // The volume response succeeded with data (the waiter already required
      // an OK response with a frames array for 'log-volume-A').
      expect(frames(volumeBody, VOLUME_REF_ID).length).toBeGreaterThan(0);
      expect(rowCount(volumeBody, VOLUME_REF_ID)).toBeGreaterThan(0);

      // The histogram section renders above the log rows. We assert layout
      // order via bounding boxes rather than sampling chart pixels; the
      // 'Logs volume' text is the Explore panel header for the histogram and
      // 'Database connection failed' is the newest seeded log message.
      const volumeTitle = page.getByText('Logs volume', { exact: true }).first();
      await expect(volumeTitle).toBeVisible();
      const newestLogRow = page.getByText('Database connection failed').first();
      await expect(newestLogRow).toBeVisible();
      const titleBox = await volumeTitle.boundingBox();
      const rowBox = await newestLogRow.boundingBox();
      if (titleBox === null || rowBox === null) {
        throw new Error('expected both the volume histogram header and a log row to be laid out');
      }
      expect(titleBox.y).toBeLessThan(rowBox.y);
    });

    test('volume response groups counts by the seeded level values (#363)', async ({ page, explorePage }) => {
      const { volumeBody } = await runLogsQueryAndCaptureVolume(page, explorePage);

      // The frame carries one time column plus one aggregate per canonical
      // level. The #363 regression lost the level grouping, which in the
      // current implementation surfaces as the catch-all 'logs' count(*)
      // alias instead of the per-level columns.
      const fieldNames = frameFields(volumeBody, VOLUME_REF_ID).map((f) => f.name);
      expect(fieldNames).toContain('time');
      for (const level of ['debug', 'info', 'warn', 'error']) {
        expect(fieldNames).toContain(level);
      }
      expect(fieldNames).not.toContain('logs');

      // seed.sql inserts exactly 5 info, 2 debug, 1 warn and 2 error rows
      // (10 total) inside the pinned range. Summing each level column across
      // time buckets must reproduce those counts exactly.
      const values = frameValues(volumeBody, VOLUME_REF_ID);
      expect(levelTotal(fieldNames, values, 'info')).toBe(5);
      expect(levelTotal(fieldNames, values, 'debug')).toBe(2);
      expect(levelTotal(fieldNames, values, 'warn')).toBe(1);
      expect(levelTotal(fieldNames, values, 'error')).toBe(2);
      // Levels absent from the fixture must total zero rather than absorb
      // rows from other levels.
      expect(levelTotal(fieldNames, values, 'critical')).toBe(0);
      expect(levelTotal(fieldNames, values, 'trace')).toBe(0);
    });
  });

  test.describe('SQL mode', () => {
    test('a SQL-mode logs query fires no log-volume request', async ({ page, explorePage }) => {
      await page.goto(exploreUrl({ queryType: QueryType.Logs, from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
      // Make it a logs-shaped query: select the Logs query type so Grafana
      // renders a Logs panel, the exact surface where the histogram would
      // appear if the builder-mode-only gate ever regressed.
      await page.getByRole('radio', { name: 'Logs', exact: true }).click();
      await expect(page.getByRole('radio', { name: 'Logs', exact: true })).toBeChecked();

      // Count every volume-shaped dispatch from before the run onwards.
      const volumeRequests: Request[] = [];
      page.on('request', (request) => {
        if (isLogVolumeRequest(request)) {
          volumeRequests.push(request);
        }
      });

      await enterSql(page, 'SELECT timestamp, level, message FROM e2e_test.events ORDER BY timestamp');
      const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage, 'A');
      await runQuery(page);
      await responsePromise;

      // The primary query itself worked: seed.sql inserts exactly 10 rows.
      expect(rowCount(getBody())).toBe(10);

      // A missing request cannot be awaited. Explore dispatches supplementary
      // queries alongside the primary run, so any volume request would be in
      // flight by the time the primary response lands; hold a short grace
      // window for a stray late dispatch to surface before asserting.
      await page.waitForTimeout(1500);
      expect(volumeRequests).toHaveLength(0);
    });
  });
});
