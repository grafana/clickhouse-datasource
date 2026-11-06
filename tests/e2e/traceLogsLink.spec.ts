import { expect, test } from '@grafana/plugin-e2e';
import { Page, Response, request as apiRequest } from '@playwright/test';

// E2E guard for the trace→logs "View logs" data link.
//
// The link query built in transformQueryResponseWithTraceAndLogLinks
// (src/data/utils.ts) must:
//   1. Carry the Grafana time-range bound — without it the query scans the
//      table's full retention window and ignores the time picker (#2106)
//   2. Ship an immediately-executable rawSql: non-empty, concrete time bounds
//      (no $__fromTime/$__toTime — Grafana hides links whose serialized query
//      contains unresolvable $-tokens), and a QUOTED trace id (escapeValue
//      passes $-values through unquoted; Grafana ≤12 runs this SQL verbatim)
//   3. Drop the origin's non-time filters so the pivot shows every log row
//      for the trace
//
// Fixture: tests/fixtures/trace_links_logs.sql seeds logs correlated with
// the trace_spans fixture. Row counts disambiguate failure modes:
//   3 rows = correct | 4 rows = time bound missing | 2 rows = origin filters
//   wrongly carried over
//
// Both link-construction sites are covered: a trace-search origin (defaults
// branch) and a logs origin (copy branch). A datasource with BOTH logs and
// traces defaults is required for the links to attach on every origin type
// (canBuildLogsLink/canBuildTraceLink); it is created via the Grafana API in
// beforeAll and removed in afterAll so no provisioning changes are needed.
// If a regression reintroduces unresolvable $-tokens into the serialized link,
// Grafana suppresses the link and these tests fail at the menu-click step.

const PLUGIN_TYPE = 'grafana-clickhouse-datasource';

const isCloudRun = !!process.env.GRAFANA_URL;
const DATASOURCE_UID = 'clickhouse-e2e-trace-links';
const DATASOURCE_NAME = 'ClickHouse Trace Links (e2e)';
// Connection settings are inherited from this datasource so the spec works
// wherever the standard e2e datasource points (docker-compose, custom stacks)
const BASE_DATASOURCE_UID = process.env.DS_E2E_UID || 'clickhouse-e2e';
const BASE_URL = process.env.GRAFANA_URL || `http://localhost:${process.env.PORT || 3000}`;

async function newAdminApiContext() {
  return apiRequest.newContext({
    baseURL: BASE_URL,
    httpCredentials: {
      username: process.env.GRAFANA_ADMIN_USER || 'admin',
      password: process.env.GRAFANA_ADMIN_PASSWORD || 'admin',
    },
  });
}

async function deleteTestDataSource() {
  const ctx = await newAdminApiContext();
  // Returns 404 when absent; APIRequestContext does not throw on non-2xx
  await ctx.delete(`/api/datasources/uid/${DATASOURCE_UID}`);
  await ctx.dispose();
}

// Creates the datasource the links depend on: logs defaults make canBuildLogsLink
// pass for non-logs origins, traces defaults make canBuildTraceLink pass for
// non-traces origins. The fixture logs table follows the clickhouseexporter
// v0.151.0 layout matched by the 'latest' OTel schema entry, which also provides
// the TraceId column mapping. Connection fields (host/port/protocol/username/TLS)
// come from the base e2e datasource; a password cannot be inherited (secure
// fields are write-only), so this requires a passwordless ClickHouse like the
// local dev stack.
async function createTestDataSource() {
  const ctx = await newAdminApiContext();
  const baseRes = await ctx.get(`/api/datasources/uid/${BASE_DATASOURCE_UID}`);
  if (!baseRes.ok()) {
    throw new Error(`Failed to read base datasource ${BASE_DATASOURCE_UID}: ${baseRes.status()}`);
  }
  const baseJsonData = (await baseRes.json())?.jsonData ?? {};
  const res = await ctx.post('/api/datasources', {
    data: {
      name: DATASOURCE_NAME,
      uid: DATASOURCE_UID,
      type: PLUGIN_TYPE,
      access: 'proxy',
      jsonData: {
        ...baseJsonData,
        database: 'e2e_test',
        logs: {
          defaultDatabase: 'e2e_test',
          defaultTable: 'trace_links_logs',
          otelEnabled: true,
          otelVersion: 'latest',
        },
        traces: {
          defaultDatabase: 'e2e_test',
          defaultTable: 'trace_spans',
          traceIdColumn: 'TraceId',
          spanIdColumn: 'SpanId',
          operationNameColumn: 'SpanName',
          parentSpanIdColumn: 'ParentSpanId',
          serviceNameColumn: 'ServiceName',
          durationColumn: 'Duration',
          durationUnit: 'nanoseconds',
          startTimeColumn: 'Timestamp',
          tagsColumn: 'SpanAttributes',
          serviceTagsColumn: 'ResourceAttributes',
          kindColumn: 'SpanKind',
          statusCodeColumn: 'StatusCode',
          statusMessageColumn: 'StatusMessage',
          stateColumn: 'TraceState',
          flattenNested: false,
          traceEventsColumnPrefix: 'Events',
          traceLinksColumnPrefix: 'Links',
          otelEnabled: false,
        },
      },
    },
  });
  // 409 = already created by a parallel worker; anything else is a real failure
  if (!res.ok() && res.status() !== 409) {
    throw new Error(`Failed to create e2e datasource: ${res.status()} ${await res.text()}`);
  }
  await ctx.dispose();
}

const FIXTURE_FROM_ISO = '2024-03-15T09:45:00.000Z';
const FIXTURE_TO_ISO = '2024-03-15T10:15:00.000Z';

const TRACE_A = 'e2e-trace-a';
// In-window logs for trace-a; excludes the 2024-03-16 row and the trace-b row
const TRACE_A_IN_WINDOW_LOG_COUNT = 3;

const TRACE_LOGS_REFID = 'Trace Logs';
const LOGS_VOLUME_REFID = 'log-volume-Trace Logs';

function exploreUrl(query: Record<string, unknown>): string {
  const panes = JSON.stringify({
    explore: {
      datasource: DATASOURCE_UID,
      queries: [{ ...query, datasource: { type: PLUGIN_TYPE, uid: DATASOURCE_UID } }],
      range: { from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO },
    },
  });
  return `/explore?orgId=1&schemaVersion=1&panes=${encodeURIComponent(panes)}`;
}

// Trace-search origin: exercises the "create new query based on log defaults"
// branch of the trace→logs link construction.
function traceSearchOriginUrl(): string {
  return exploreUrl({
    refId: 'A',
    editorType: 'builder',
    pluginVersion: '',
    rawSql:
      'SELECT "TraceId" as traceID, "ServiceName" as serviceName, "SpanName" as operationName, ' +
      '"Timestamp" as startTime, "Duration" as duration FROM "e2e_test"."trace_spans" ' +
      'WHERE ( "Timestamp" >= $__fromTime AND "Timestamp" <= $__toTime ) ORDER BY "Timestamp" DESC LIMIT 1000',
    builderOptions: {
      database: 'e2e_test',
      table: 'trace_spans',
      queryType: 'traces',
      mode: 'list',
      columns: [
        { name: 'TraceId', type: 'String', hint: 'trace_id' },
        { name: 'SpanId', type: 'String', hint: 'trace_span_id' },
        { name: 'ParentSpanId', type: 'String', hint: 'trace_parent_span_id' },
        { name: 'ServiceName', type: 'LowCardinality(String)', hint: 'trace_service_name' },
        { name: 'SpanName', type: 'LowCardinality(String)', hint: 'trace_operation_name' },
        { name: 'Timestamp', type: 'DateTime64(9)', hint: 'time' },
        { name: 'Duration', type: 'Int64', hint: 'trace_duration_time' },
      ],
      meta: {},
      limit: 1000,
      filters: [],
      orderBy: [],
    },
    format: 1,
  });
}

// Logs origin with a time filter AND a ServiceName filter: exercises the
// "copy fields directly from log search" branch. The link must keep the time
// bound but drop the ServiceName filter (the 'worker' log row proves it).
// format: 1 renders the result as a table so the traceID cell is clickable
// the same way as in the trace-search test.
function logsOriginUrl(): string {
  return exploreUrl({
    refId: 'A',
    editorType: 'builder',
    pluginVersion: '',
    rawSql:
      'SELECT "Timestamp" as "timestamp", "Body" as "body", "SeverityText" as "level", "TraceId" as "traceID" ' +
      'FROM "e2e_test"."trace_links_logs" ' +
      'WHERE ( "Timestamp" >= $__fromTime AND "Timestamp" <= $__toTime ) AND ( ServiceName = \'api\' ) ' +
      'ORDER BY "Timestamp" DESC LIMIT 1000',
    builderOptions: {
      database: 'e2e_test',
      table: 'trace_links_logs',
      queryType: 'logs',
      mode: 'list',
      columns: [
        { name: 'Timestamp', type: 'DateTime64(9)', hint: 'time' },
        { name: 'Body', type: 'String', hint: 'log_message' },
        { name: 'SeverityText', type: 'LowCardinality(String)', hint: 'log_level' },
        { name: 'TraceId', type: 'String', hint: 'trace_id' },
      ],
      meta: {},
      limit: 1000,
      filters: [
        {
          type: 'datetime',
          operator: 'WITH IN DASHBOARD TIME RANGE',
          filterType: 'custom',
          key: '',
          hint: 'filter_time',
          condition: 'AND',
        },
        {
          type: 'string',
          operator: '=',
          filterType: 'custom',
          key: 'ServiceName',
          condition: 'AND',
          value: 'api',
        },
      ],
      orderBy: [],
    },
    format: 1,
  });
}

function waitForQueryWithRefId(page: Page, refId: string): Promise<Response> {
  return page.waitForResponse(
    (r) => r.url().includes('/api/ds/query') && (r.request().postData() || '').includes(`"refId":"${refId}"`)
  );
}

// Clicks the traceID cell (two data links → context menu) and follows "View logs"
async function clickViewLogs(page: Page, traceId: string): Promise<void> {
  await page.getByText(traceId, { exact: true }).first().click();
  await page
    .getByRole('menuitem', { name: 'View logs' })
    .or(page.getByText('View logs', { exact: true }))
    .first()
    .click();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowCount(body: any, refId: string): number {
  const values = body?.results?.[refId]?.frames?.[0]?.data?.values?.[0];
  return Array.isArray(values) ? values.length : 0;
}

function traceLogsRawSql(response: Response): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queries: any[] = response.request().postDataJSON()?.queries ?? [];
  return queries.find((q) => q.refId === TRACE_LOGS_REFID)?.rawSql ?? '';
}

test.describe('trace→logs "View logs" data link', () => {
  // Serial keeps both tests in one worker so the beforeAll/afterAll datasource
  // lifecycle cannot race a test running in a parallel worker
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    if (isCloudRun) {
      return;
    }
    // Recreate from scratch so a leftover datasource from an aborted run
    // (stale uid or jsonData) cannot poison this run
    await deleteTestDataSource();
    await createTestDataSource();
  });

  test.afterAll(async () => {
    if (isCloudRun) {
      return;
    }
    await deleteTestDataSource();
  });

  test.beforeEach(() => {
    test.skip(
      isCloudRun,
      'Depends on the local trace_links_logs fixture (tests/fixtures/trace_links_logs.sql) loaded via the e2e-data-loader Docker service, which is not available on Cloud.'
    );
  });

  test('from a trace search: opens a bounded logs query and loads the logs volume histogram', async ({ page }) => {
    await page.goto(traceSearchOriginUrl());
    await expect(page.getByText(TRACE_A, { exact: true }).first()).toBeVisible();

    const traceLogsResponsePromise = waitForQueryWithRefId(page, TRACE_LOGS_REFID);
    const logsVolumeResponsePromise = waitForQueryWithRefId(page, LOGS_VOLUME_REFID);
    await clickViewLogs(page, TRACE_A);

    // First auto-run must succeed (no "Empty query") and be constrained to the
    // origin pane's time range: the out-of-window trace-a row is excluded.
    const traceLogsResponse = await traceLogsResponsePromise;
    expect(traceLogsResponse.ok()).toBe(true);
    expect(rowCount(await traceLogsResponse.json(), TRACE_LOGS_REFID)).toBe(TRACE_A_IN_WINDOW_LOG_COUNT);

    // The executed SQL carries a time predicate (concrete toDateTime bounds on
    // first run, or the macro form after editor regeneration on newer Grafana)
    // and a QUOTED trace id in both cases.
    const rawSql = traceLogsRawSql(traceLogsResponse);
    expect(rawSql).toMatch(/\$__fromTime|toDateTime(64)?\(/);
    expect(rawSql).toContain(`'${TRACE_A}'`);

    // The logs volume histogram query fires and succeeds (requires the link
    // query to carry BuilderMode.List and a resolvable time column).
    const logsVolumeResponse = await logsVolumeResponsePromise;
    expect(logsVolumeResponse.ok()).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const volumeBody: any = await logsVolumeResponse.json();
    expect(Array.isArray(volumeBody?.results?.[LOGS_VOLUME_REFID]?.frames)).toBe(true);
    expect(volumeBody.results[LOGS_VOLUME_REFID].frames.length).toBeGreaterThan(0);
  });

  test('from a logs query: keeps the time bound but drops the origin non-time filters', async ({ page }) => {
    await page.goto(logsOriginUrl());
    await expect(page.getByText(TRACE_A, { exact: true }).first()).toBeVisible();

    const traceLogsResponsePromise = waitForQueryWithRefId(page, TRACE_LOGS_REFID);
    await clickViewLogs(page, TRACE_A);

    const traceLogsResponse = await traceLogsResponsePromise;
    expect(traceLogsResponse.ok()).toBe(true);

    // 3 = time bound kept (out-of-window row excluded) AND the origin's
    // ServiceName='api' filter dropped (the 'worker' row is included).
    // 4 would mean the time bound was lost; 2 would mean origin filters leaked.
    expect(rowCount(await traceLogsResponse.json(), TRACE_LOGS_REFID)).toBe(TRACE_A_IN_WINDOW_LOG_COUNT);

    const rawSql = traceLogsRawSql(traceLogsResponse);
    expect(rawSql).toMatch(/\$__fromTime|toDateTime(64)?\(/);
    expect(rawSql).toContain(`'${TRACE_A}'`);
    expect(rawSql).not.toContain('ServiceName');
  });
});
