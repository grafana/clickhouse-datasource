import { expect, test } from '@grafana/plugin-e2e';
import { Page, Request, Response } from '@playwright/test';

// Runs the generated log volume SQL (src/data/logsVolumeSql.ts) against a server.
//
// Fixture e2e_test.events (tests/e2e/fixtures/seed.sql): 10 rows one per minute 10:00-10:09 UTC
// on 2024-03-15, levels info x5, debug x2, error x2, warn x1.
//   10 = correct | 3 = the query's LIMIT survived into the derived table

const PLUGIN_TYPE = 'grafana-clickhouse-datasource';
const DATASOURCE_UID = 'clickhouse-e2e-logs-defaults';

const isCloudRun = !!process.env.GRAFANA_URL;

const FIXTURE_FROM_ISO = '2024-03-15T09:45:00.000Z';
const FIXTURE_TO_ISO = '2024-03-15T10:15:00.000Z';

const MAIN_REFID = 'A';
const VOLUME_REFID = 'log-volume-A';

const FIXTURE_ROW_COUNT = 10;
const QUERY_LIMIT = 3;
const LEVEL_COUNTS: Record<string, number> = {
  info: 5,
  error: 2,
  debug: 2,
  warn: 1,
  critical: 0,
  trace: 0,
  unknown: 0,
};

const LOGS_SQL = `SELECT timestamp, level, message FROM e2e_test.events ORDER BY timestamp DESC LIMIT ${QUERY_LIMIT}`;

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

function declaredLogsTarget(rawSql: string = LOGS_SQL): Record<string, unknown> {
  return { refId: MAIN_REFID, editorType: 'sql', pluginVersion: '', queryType: 'logs', format: 2, rawSql };
}

function hasRefId(request: Request, refId: string): boolean {
  return (request.postData() || '').includes(`"refId":"${refId}"`);
}

function waitForQueryWithRefId(page: Page, refId: string): Promise<Response> {
  return page.waitForResponse((r) => r.url().includes('/api/ds/query') && hasRefId(r.request(), refId));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function requestedSql(response: Response, refId: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queries: any[] = response.request().postDataJSON()?.queries ?? [];
  return queries.find((q) => q.refId === refId)?.rawSql ?? '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function requestedQuery(response: Response, refId: string): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queries: any[] = response.request().postDataJSON()?.queries ?? [];
  return queries.find((q) => q.refId === refId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowCount(body: any, refId: string): number {
  const values = body?.results?.[refId]?.frames?.[0]?.data?.values?.[0];
  return Array.isArray(values) ? values.length : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function volumeTotals(body: any, refId: string): { total: number; byLevel: Record<string, number> } {
  const byLevel: Record<string, number> = {};
  let total = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const frame of body?.results?.[refId]?.frames ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (frame.schema?.fields ?? []).forEach((field: any, index: number) => {
      if (field.name === 'time' || field.type === 'time') {
        return;
      }
      const sum = (frame.data?.values?.[index] ?? []).reduce((a: number, b: number) => a + (b || 0), 0);
      byLevel[field.name] = (byLevel[field.name] ?? 0) + sum;
      total += sum;
    });
  }
  return { total, byLevel };
}

test.describe('SQL editor aggregated log volume', () => {
  test.beforeEach(() => {
    test.skip(
      isCloudRun,
      'Depends on the e2e_test.events fixture (tests/e2e/fixtures/seed.sql) and the provisioned ClickHouse Logs Defaults data source, neither of which exists on Cloud.'
    );
  });

  test('aggregates the whole range, not the page of rows', async ({ page }) => {
    const mainPromise = waitForQueryWithRefId(page, MAIN_REFID);
    const volumePromise = waitForQueryWithRefId(page, VOLUME_REFID);
    await page.goto(exploreUrl(declaredLogsTarget()));

    const mainResponse = await mainPromise;
    expect(mainResponse.ok()).toBe(true);
    expect(rowCount(await mainResponse.json(), MAIN_REFID)).toBe(QUERY_LIMIT);

    const volumeResponse = await volumePromise;
    const volumeQuery = requestedQuery(volumeResponse, VOLUME_REFID);
    expect(volumeQuery?.format).toBe(0);

    const sql = requestedSql(volumeResponse, VOLUME_REFID);
    expect(sql).toContain('FROM (');
    expect(sql).toContain('GROUP BY "time"');
    expect(sql).toContain('toDateTime(src."timestamp")');
    expect(sql).toContain('$__fromTime');
    expect(sql).not.toContain(`LIMIT ${QUERY_LIMIT}`);
    expect(sql).not.toContain('ORDER BY timestamp DESC');

    expect(volumeResponse.ok()).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const volumeBody: any = await volumeResponse.json();
    expect(volumeBody?.results?.[VOLUME_REFID]?.error).toBeUndefined();
    expect((volumeBody?.results?.[VOLUME_REFID]?.frames ?? []).length).toBeGreaterThan(0);

    // 3 would mean the LIMIT survived into the derived table.
    expect(volumeTotals(volumeBody, VOLUME_REFID).total).toBe(FIXTURE_ROW_COUNT);
  });

  test('attributes each row to the band the log list shows', async ({ page }) => {
    const volumePromise = waitForQueryWithRefId(page, VOLUME_REFID);
    await page.goto(exploreUrl(declaredLogsTarget()));

    const volumeResponse = await volumePromise;
    expect(volumeResponse.ok()).toBe(true);
    const { total, byLevel } = volumeTotals(await volumeResponse.json(), VOLUME_REFID);

    for (const [level, expected] of Object.entries(LEVEL_COUNTS)) {
      expect({ level, count: byLevel[level] ?? 0 }).toEqual({ level, count: expected });
    }
    expect(total).toBe(FIXTURE_ROW_COUNT);
  });

  test('declines a query it cannot aggregate', async ({ page }) => {
    // Grafana's fallback DOM is version-dependent, so this asserts only that we never asked.
    const volumeRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/ds/query') && hasRefId(request, VOLUME_REFID)) {
        volumeRequests.push(request.url());
      }
    });

    const mainPromise = waitForQueryWithRefId(page, MAIN_REFID);
    await page.goto(exploreUrl(declaredLogsTarget(`${LOGS_SQL} SETTINGS max_threads = 4`)));

    const mainResponse = await mainPromise;
    expect(mainResponse.ok()).toBe(true);
    expect(rowCount(await mainResponse.json(), MAIN_REFID)).toBe(QUERY_LIMIT);

    expect(volumeRequests).toEqual([]);
  });

  test('admits a SQL target that declares no query type', async ({ page }) => {
    const volumePromise = waitForQueryWithRefId(page, VOLUME_REFID);
    await page.goto(exploreUrl({ refId: MAIN_REFID, editorType: 'sql', pluginVersion: '', rawSql: LOGS_SQL }));

    const volumeResponse = await volumePromise;
    expect(volumeResponse.ok()).toBe(true);
    expect(volumeTotals(await volumeResponse.json(), VOLUME_REFID).total).toBe(FIXTURE_ROW_COUNT);
  });
});
