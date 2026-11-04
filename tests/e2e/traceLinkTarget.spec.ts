import { expect, test } from '@grafana/plugin-e2e';
import { Page, request as apiRequest } from '@playwright/test';
import {
  DATASOURCE_UID as BASE_DATASOURCE_UID,
  FIXTURE_FROM_ISO,
  FIXTURE_TO_ISO,
  isCloudRun,
  PLUGIN_TYPE,
  skipFixtureTestsOnCloud,
} from './helpers/env';

// The specs read the "View trace" link URL, so the Tempo data source needs no running Tempo server.

const TEMPO_UID = 'tempo-e2e-trace-link-target';
const DATASOURCE_UID = 'clickhouse-e2e-trace-link-target';
const BASE_URL = process.env.GRAFANA_URL || `http://localhost:${process.env.PORT || 3000}`;
const TRACE_A = 'e2e-trace-a';

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
  await ctx.delete(`/api/datasources/uid/${DATASOURCE_UID}`);
  await ctx.delete(`/api/datasources/uid/${TEMPO_UID}`);
  await ctx.dispose();
}

async function createDataSource(ctx: Awaited<ReturnType<typeof newAdminApiContext>>, data: Record<string, unknown>) {
  const res = await ctx.post('/api/datasources', { data });
  // 409 = already created by a parallel worker
  if (!res.ok() && res.status() !== 409) {
    throw new Error(`Failed to create e2e datasource ${data.uid}: ${res.status()} ${await res.text()}`);
  }
}

// Secure fields cannot be inherited from the base data source, so this needs a passwordless ClickHouse.
async function createTestDataSources() {
  const ctx = await newAdminApiContext();
  const baseRes = await ctx.get(`/api/datasources/uid/${BASE_DATASOURCE_UID}`);
  if (!baseRes.ok()) {
    throw new Error(`Failed to read base datasource ${BASE_DATASOURCE_UID}: ${baseRes.status()}`);
  }
  const baseJsonData = (await baseRes.json())?.jsonData ?? {};
  await createDataSource(ctx, {
    name: 'Tempo Trace Link Target (e2e)',
    uid: TEMPO_UID,
    type: 'tempo',
    access: 'proxy',
    url: 'http://tempo:3200',
  });
  await createDataSource(ctx, {
    name: 'ClickHouse Trace Link Target (e2e)',
    uid: DATASOURCE_UID,
    type: PLUGIN_TYPE,
    access: 'proxy',
    jsonData: {
      ...baseJsonData,
      logs: {
        defaultDatabase: 'e2e_test',
        defaultTable: 'trace_links_logs',
        otelEnabled: true,
        otelVersion: 'latest',
        traceLinkDatasourceUid: TEMPO_UID,
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
  });
  await ctx.dispose();
}

function exploreUrl(query: Record<string, unknown>): string {
  const panes = JSON.stringify({
    explore: {
      datasource: DATASOURCE_UID,
      queries: [
        { refId: 'A', pluginVersion: '', format: 1, ...query, datasource: { type: PLUGIN_TYPE, uid: DATASOURCE_UID } },
      ],
      range: { from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO },
    },
  });
  return `/explore?orgId=1&schemaVersion=1&panes=${encodeURIComponent(panes)}`;
}

const logsBuilderQuery = {
  editorType: 'builder',
  rawSql:
    'SELECT "Timestamp" as "timestamp", "Body" as "body", "TraceId" as "traceID" FROM "e2e_test"."trace_links_logs" ' +
    'WHERE ( "Timestamp" >= $__fromTime AND "Timestamp" <= $__toTime ) ORDER BY "Timestamp" DESC LIMIT 1000',
  builderOptions: {
    database: 'e2e_test',
    table: 'trace_links_logs',
    queryType: 'logs',
    mode: 'list',
    columns: [
      { name: 'Timestamp', type: 'DateTime64(9)', hint: 'time' },
      { name: 'Body', type: 'String', hint: 'log_message' },
      { name: 'TraceId', type: 'String', hint: 'trace_id' },
    ],
    meta: {},
    limit: 1000,
    filters: [],
    orderBy: [],
  },
};

const sqlEditorQuery = {
  editorType: 'sql',
  queryType: 'table',
  rawSql:
    'SELECT Timestamp, Body, TraceId AS traceID FROM e2e_test.trace_links_logs ' +
    'WHERE $__timeFilter(Timestamp) ORDER BY Timestamp DESC',
};

const tracesBuilderQuery = {
  editorType: 'builder',
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
};

const tableBuilderTracesTableQuery = {
  editorType: 'builder',
  rawSql: 'SELECT "TraceId", "SpanName", "Timestamp" FROM "e2e_test"."trace_spans" LIMIT 1000',
  builderOptions: {
    database: 'e2e_test',
    table: 'trace_spans',
    queryType: 'table',
    mode: 'list',
    columns: [{ name: 'TraceId' }, { name: 'SpanName' }, { name: 'Timestamp' }],
    meta: {},
    limit: 1000,
    filters: [],
    orderBy: [],
  },
};

interface LinkQuery {
  datasource?: { uid?: string; type?: string };
  queryType?: string;
}

async function viewTraceQuery(page: Page, traceId: string): Promise<LinkQuery> {
  await page.getByText(traceId, { exact: true }).first().click();
  const link = page
    .getByRole('menuitem', { name: 'View trace' })
    .or(page.getByRole('link', { name: 'View trace', exact: true }))
    .first();
  const href = (await link.getAttribute('href')) ?? '';
  const left = new URLSearchParams(href.split('?')[1]).get('left') ?? '{}';
  return JSON.parse(left).queries?.[0] ?? {};
}

const tempoTraceQuery = {
  refId: 'Trace ID',
  datasource: { uid: TEMPO_UID, type: 'tempo' },
  queryType: 'traceql',
  query: TRACE_A,
};

test.describe('"View trace" data source', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    if (isCloudRun) {
      return;
    }
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
    skipFixtureTestsOnCloud('trace_links_logs.sql');
  });

  test('a logs builder query links to Tempo with a TraceQL query', async ({ page }) => {
    await page.goto(exploreUrl(logsBuilderQuery));
    expect(await viewTraceQuery(page, TRACE_A)).toEqual(tempoTraceQuery);
  });

  test('an SQL editor query links to Tempo with a TraceQL query', async ({ page }) => {
    await page.goto(exploreUrl(sqlEditorQuery));
    expect(await viewTraceQuery(page, TRACE_A)).toEqual(tempoTraceQuery);
  });

  for (const [name, query] of [
    ['a traces builder query', tracesBuilderQuery],
    ['a table builder query on the traces table', tableBuilderTracesTableQuery],
  ] as const) {
    test(`${name} keeps the ClickHouse link`, async ({ page }) => {
      await page.goto(exploreUrl(query));
      const linkQuery = await viewTraceQuery(page, TRACE_A);

      expect(linkQuery.datasource).toEqual({ uid: DATASOURCE_UID, type: PLUGIN_TYPE });
      expect(linkQuery.queryType).toBeUndefined();
    });
  }
});
