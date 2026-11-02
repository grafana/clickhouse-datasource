import { expect, test } from '@grafana/plugin-e2e';
import { Page, Response } from '@playwright/test';
import { pluginVersion } from '../../src/utils/version';
import { DATASOURCE_UID, PLUGIN_TYPE, skipFixtureTestsOnCloud } from './helpers/env';
import { frames, QueryDataBody, rowCount } from './helpers/queryResponse';

// Fixture e2e_test.events (tests/e2e/fixtures/seed.sql): 10 rows, one per minute 10:00-10:09 UTC on 2024-03-15.
// The 1h min interval puts every row in the 10:00 bucket, so each range cuts that bucket.

const MAIN_REFID = 'A';
const VOLUME_REFID = 'log-volume-A';

const RANGES = [
  { name: 'starts inside a bucket', from: '2024-03-15T10:02:30.000Z', to: '2024-03-15T10:15:00.000Z', rows: 7 },
  { name: 'ends inside a bucket', from: '2024-03-15T09:45:00.000Z', to: '2024-03-15T10:04:30.000Z', rows: 5 },
];

const builderLogsTarget = {
  refId: MAIN_REFID,
  datasource: { type: PLUGIN_TYPE, uid: DATASOURCE_UID },
  editorType: 'builder',
  pluginVersion,
  format: 2,
  minInterval: '1h',
  rawSql:
    'SELECT timestamp, message as "body", level FROM "e2e_test"."events" ' +
    'WHERE ( timestamp >= $__fromTime AND timestamp <= $__toTime ) ORDER BY timestamp DESC LIMIT 1000',
  builderOptions: {
    database: 'e2e_test',
    table: 'events',
    queryType: 'logs',
    mode: 'list',
    columns: [
      { name: 'timestamp', type: 'DateTime', hint: 'time' },
      { name: 'message', type: 'String', hint: 'log_message' },
      { name: 'level', type: 'LowCardinality(String)', hint: 'log_level' },
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
    ],
    orderBy: [{ name: '', hint: 'time', dir: 'DESC', default: true }],
  },
};

function exploreUrl(from: string, to: string): string {
  const panes = JSON.stringify({
    explore: { datasource: DATASOURCE_UID, queries: [builderLogsTarget], range: { from, to } },
  });
  return `/explore?orgId=1&schemaVersion=1&panes=${encodeURIComponent(panes)}`;
}

function waitForQueryWithRefId(page: Page, refId: string): Promise<Response> {
  return page.waitForResponse(
    (r) => r.url().includes('/api/ds/query') && (r.request().postData() || '').includes(`"refId":"${refId}"`)
  );
}

interface RequestedQuery {
  refId?: string;
  editorType?: string;
  rawSql?: string;
}

function requestedQuery(response: Response, refId: string): RequestedQuery | undefined {
  const queries: RequestedQuery[] = response.request().postDataJSON()?.queries ?? [];
  return queries.find((q) => q.refId === refId);
}

function volumeTotal(body: QueryDataBody): number {
  return frames(body, VOLUME_REFID)
    .flatMap((frame) =>
      (frame.schema?.fields ?? []).flatMap((field, index) =>
        field.name === 'time' || field.type === 'time' ? [] : (frame.data?.values?.[index] ?? [])
      )
    )
    .reduce<number>((sum, value) => sum + Number(value ?? 0), 0);
}

test.describe('Query builder log volume', () => {
  test.beforeEach(() => {
    skipFixtureTestsOnCloud('seed.sql');
  });

  for (const { name, from, to, rows } of RANGES) {
    test(`counts the same rows as the logs query for a range that ${name}`, async ({ page }) => {
      const mainPromise = waitForQueryWithRefId(page, MAIN_REFID);
      const volumePromise = waitForQueryWithRefId(page, VOLUME_REFID);
      await page.goto(exploreUrl(from, to));

      const mainResponse = await mainPromise;
      expect(mainResponse.ok()).toBe(true);
      expect(rowCount(await mainResponse.json(), MAIN_REFID)).toBe(rows);

      const volumeResponse = await volumePromise;
      expect(volumeResponse.ok()).toBe(true);
      const volumeQuery = requestedQuery(volumeResponse, VOLUME_REFID);
      expect(volumeQuery?.editorType).toBe('builder');
      expect(volumeQuery?.rawSql).toContain('INTERVAL 1 HOUR');
      expect(volumeTotal(await volumeResponse.json())).toBe(rows);
    });
  }
});
