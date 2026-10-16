import { expect, test } from '@grafana/plugin-e2e';
import { Page, Request } from '@playwright/test';
import { createTestDataSources, deleteTestDataSources } from './helpers/datasources';
import {
  FIXTURE_FROM_ISO,
  FIXTURE_TO_ISO,
  isCloudRun,
  SINGLE_LOGS_DATASOURCE_UID,
  SINGLE_TRACES_DATASOURCE_UID,
  skipFixtureTestsOnCloud,
} from './helpers/env';
import { exploreUrl, ExploreUrlOptions } from './helpers/explore';
import { QueryDataBody, rowCount } from './helpers/queryResponse';

// When the user switches between two data sources of the same plugin in Explore, Grafana keeps
// the query as it is and runs it against the new data source. A single-table data source must
// convert that query for its own table: its compact defaults, plus the carried filters that still
// fit. This spec drives the switch through the real data source picker, which unit tests cannot,
// and checks the query that runs afterwards.
//
// Data sources: the provisioned single-table logs (e2e_test.events) and traces
// (e2e_test.trace_spans) ones, plus an OTel logs one on e2e_test.trace_links_logs created here.
// trace_links_logs and trace_spans share ServiceName values, which is what makes a carried
// ServiceName filter observable in the results. Connection fields are inherited from the base e2e
// data source; a password cannot be inherited, hence the Cloud skip.

const OTEL_LOGS_DATASOURCE = {
  uid: 'clickhouse-e2e-single-otel-logs',
  name: 'ClickHouse Single OTel Logs (e2e)',
};
const SINGLE_TRACES_NAME = 'ClickHouse Single Traces';
// Any 4.x version keeps the URL queries out of the v3 migration, so they open in the Query Builder.
const BUILDER_PLUGIN_VERSION = '4.0.0';

const OTEL_LOGS_JSON_DATA = {
  configMode: 'single-table',
  signalType: 'logs',
  logs: { defaultDatabase: 'e2e_test', defaultTable: 'trace_links_logs', otelEnabled: true, otelVersion: 'latest' },
};

const timeRangeFilter = (hint: string) => ({
  filterType: 'custom',
  key: '',
  type: 'datetime',
  operator: 'WITH IN DASHBOARD TIME RANGE',
  condition: 'AND',
  hint,
});

const equalsFilter = (key: string, value: string) => ({
  filterType: 'custom',
  key,
  type: 'LowCardinality(String)',
  operator: '=',
  value,
  condition: 'AND',
});

interface SentQuery {
  rawSql?: string;
  builderOptions?: { queryType?: string };
}

/**
 * Resolves with the query and frames of the next completed /api/ds/query response for the given
 * data source and table. Grafana first runs the carried-over query unchanged, so the table check
 * skips it. A new run in the Explore pane cancels a request that is still in flight, so only a
 * completed response that carries frames counts, never a cancelled request. Without the conversion
 * no such response arrives.
 */
async function waitForQueryOn(page: Page, datasourceUid: string, table: string) {
  let query: SentQuery = {};
  let body: QueryDataBody | null = null;
  await page
    .waitForResponse(
      async (response) => {
        const request = response.request();
        if (!response.url().includes('/api/ds/query') || request.method() !== 'POST' || !response.ok()) {
          return false;
        }
        const sent = request.postDataJSON()?.queries?.[0];
        if (
          sent?.refId !== 'A' ||
          sent?.datasource?.uid !== datasourceUid ||
          !String(sent?.rawSql ?? '').includes(`"e2e_test"."${table}"`)
        ) {
          return false;
        }
        const received = (await response.json().catch(() => null)) as QueryDataBody | null;
        if (!Array.isArray(received?.results?.A?.frames)) {
          return false;
        }
        query = sent;
        body = received;
        return true;
      },
      { timeout: 15_000 }
    )
    .catch(() => {
      throw new Error(`No completed query against e2e_test.${table} on ${datasourceUid}`);
    });
  return { query, body };
}

async function expectCompactEditor(page: Page) {
  await expect(page.locator('[data-testid="compact-filter-bar"]')).toBeVisible();
  // The classic builder's Query Type row is what showed up before this was fixed.
  await expect(page.getByText('Query Type', { exact: true })).toHaveCount(0);
}

// How long no query may run before the first query counts as finished.
const QUIET_MS = 500;

/**
 * Opens Explore and waits until its first query has finished, including the follow-up queries the
 * plugin runs after the response to build trace links. When that processing finishes, Grafana
 * cancels the query still running in the pane, so switching data sources earlier can cancel the
 * converted query.
 */
async function openExplore(page: Page, options: ExploreUrlOptions) {
  const pending = new Set<Request>();
  let lastActivity = Date.now();
  const started = (request: Request) => {
    if (request.url().includes('/api/ds/query')) {
      pending.add(request);
      lastActivity = Date.now();
    }
  };
  const ended = (request: Request) => {
    if (pending.delete(request)) {
      lastActivity = Date.now();
    }
  };
  // Playwright's request lifecycle events. cspell:ignore requestfinished requestfailed
  page.on('request', started);
  page.on('requestfinished', ended);
  page.on('requestfailed', ended);
  // Reports what is still running, so a timeout names the query that never settled.
  const state = () => {
    if (pending.size > 0) {
      return [...pending]
        .map((request) => String(request.postDataJSON()?.queries?.[0]?.rawSql).slice(0, 80))
        .join(' | ');
    }
    return Date.now() - lastActivity >= QUIET_MS ? 'settled' : 'settling';
  };
  try {
    const firstQuery = waitForQueryOn(page, String(options.datasourceUid), String(options.builderOptions?.table));
    await page.goto(exploreUrl(options));
    await firstQuery;
    await expect.poll(state, { timeout: 15_000 }).toBe('settled');
  } finally {
    page.off('request', started);
    page.off('requestfinished', ended);
    page.off('requestfailed', ended);
  }
  await expectCompactEditor(page);
}

test.describe('Switching between single-table data sources in Explore', () => {
  // Serial keeps every test in one worker so the beforeAll/afterAll datasource lifecycle cannot
  // race a test running in a parallel worker.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    if (isCloudRun) {
      return;
    }
    await deleteTestDataSources([OTEL_LOGS_DATASOURCE]);
    await createTestDataSources([{ ...OTEL_LOGS_DATASOURCE, jsonData: OTEL_LOGS_JSON_DATA }]);
  });

  test.afterAll(async () => {
    if (isCloudRun) {
      return;
    }
    await deleteTestDataSources([OTEL_LOGS_DATASOURCE]);
  });

  test.beforeEach(() => {
    skipFixtureTestsOnCloud('trace_links_logs.sql and trace_spans.sql');
  });

  test('logs to traces keeps the ServiceName filter and drops the logs-only one', async ({ page, explorePage }) => {
    await openExplore(page, {
      datasourceUid: OTEL_LOGS_DATASOURCE.uid,
      from: FIXTURE_FROM_ISO,
      to: FIXTURE_TO_ISO,
      pluginVersion: BUILDER_PLUGIN_VERSION,
      builderOptions: {
        database: 'e2e_test',
        table: 'trace_links_logs',
        queryType: 'logs',
        mode: 'list',
        columns: [
          { name: 'Timestamp', hint: 'time' },
          { name: 'Body', hint: 'log_message' },
          { name: 'SeverityText', hint: 'log_level' },
        ],
        filters: [timeRangeFilter('time'), equalsFilter('ServiceName', 'api'), equalsFilter('SeverityText', 'INFO')],
        orderBy: [{ name: '', hint: 'time', dir: 'DESC' }],
        limit: 1000,
        meta: { otelEnabled: true, otelVersion: 'latest' },
      },
    });

    const converted = waitForQueryOn(page, SINGLE_TRACES_DATASOURCE_UID, 'trace_spans');
    await explorePage.datasource.set(SINGLE_TRACES_NAME);
    const { query, body } = await converted;

    await expectCompactEditor(page);
    expect(query.builderOptions?.queryType).toBe('traces');
    expect(query.rawSql).toContain(`ServiceName = 'api'`);
    expect(query.rawSql).not.toContain('SeverityText');
    expect(rowCount(body)).toBeGreaterThan(0);
  });

  test('traces to logs keeps the ServiceName filter and drops the traces-only one', async ({ page, explorePage }) => {
    await openExplore(page, {
      datasourceUid: SINGLE_TRACES_DATASOURCE_UID,
      from: FIXTURE_FROM_ISO,
      to: FIXTURE_TO_ISO,
      pluginVersion: BUILDER_PLUGIN_VERSION,
      builderOptions: {
        database: 'e2e_test',
        table: 'trace_spans',
        queryType: 'traces',
        columns: [
          { name: 'Timestamp', hint: 'time' },
          { name: 'TraceId', hint: 'trace_id' },
          { name: 'ServiceName', hint: 'trace_service_name' },
          { name: 'SpanName', hint: 'trace_operation_name' },
        ],
        filters: [timeRangeFilter('time'), equalsFilter('ServiceName', 'api'), equalsFilter('SpanName', 'HTTP GET /')],
        orderBy: [{ name: '', hint: 'time', dir: 'DESC' }],
        limit: 1000,
        meta: { traceDurationUnit: 'nanoseconds' },
      },
    });

    const converted = waitForQueryOn(page, OTEL_LOGS_DATASOURCE.uid, 'trace_links_logs');
    await explorePage.datasource.set(OTEL_LOGS_DATASOURCE.name);
    const { query, body } = await converted;

    await expectCompactEditor(page);
    expect(query.builderOptions?.queryType).toBe('logs');
    expect(query.rawSql).toContain(`ServiceName = 'api'`);
    expect(query.rawSql).not.toContain('SpanName');
    // The fixture window holds three api log rows and one worker row: three rows means the
    // ServiceName filter carried over, four would mean it was dropped.
    expect(rowCount(body)).toBe(3);
  });

  test('logs to logs keeps the search text and drops a filter on a column the new table lacks', async ({
    page,
    explorePage,
  }) => {
    await openExplore(page, {
      datasourceUid: SINGLE_LOGS_DATASOURCE_UID,
      from: FIXTURE_FROM_ISO,
      to: FIXTURE_TO_ISO,
      pluginVersion: BUILDER_PLUGIN_VERSION,
      builderOptions: {
        database: 'e2e_test',
        table: 'events',
        queryType: 'logs',
        mode: 'list',
        columns: [
          { name: 'timestamp', hint: 'time' },
          { name: 'message', hint: 'log_message' },
          { name: 'level', hint: 'log_level' },
        ],
        filters: [timeRangeFilter('time'), equalsFilter('service', 'worker')],
        orderBy: [{ name: '', hint: 'time', dir: 'DESC' }],
        limit: 1000,
        meta: { otelEnabled: false, logMessageLike: 'timeout' },
      },
    });

    const converted = waitForQueryOn(page, OTEL_LOGS_DATASOURCE.uid, 'trace_links_logs');
    await explorePage.datasource.set(OTEL_LOGS_DATASOURCE.name);
    const { query, body } = await converted;

    await expectCompactEditor(page);
    await expect(page.getByPlaceholder('Search log body text...')).toHaveValue('timeout');
    expect(query.rawSql).toContain('timeout');
    // trace_links_logs has ServiceName but no `service` column, so that filter cannot carry over.
    expect(query.rawSql).not.toMatch(/\bservice\s*=/);
    // One row in the window mentions a timeout ("downstream timeout").
    expect(rowCount(body)).toBe(1);
  });
});
