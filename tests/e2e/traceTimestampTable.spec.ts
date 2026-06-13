import { expect, test, ExplorePage } from '@grafana/plugin-e2e';
import { Page } from '@playwright/test';

// E2E guard for the hasTraceTimestampTable optimization and its #1842
// regression guard. The tests exercise the two SQL shapes the plugin
// generates against real ClickHouse:
//
//   Optimized  – WITH trace_id / trace_start / trace_end + Timestamp bounds
//   Fallback   – plain WHERE traceID = '<id>'
//
// Fixture: tests/e2e/fixtures/trace_id_ts.sql creates
//   e2e_test.trace_ts_spans            (5 spans for trace-a, 1 for trace-b)
//   e2e_test.trace_ts_spans_trace_id_ts (companion entry for trace-a ONLY)
//
// The missing trace-b entry in the companion reproduces the #1842 scenario:
// optimized SQL returns 0 rows because the Timestamp bounds become NULL;
// the fallback returns the span correctly.

const PLUGIN_TYPE = 'grafana-clickhouse-datasource';

const isCloudRun = !!process.env.GRAFANA_URL;

const CLOUD_DEFAULT_UID = 'clickhouse-native-ds-m';
const LOCAL_DEFAULT_UID = 'clickhouse-e2e';
const DATASOURCE_UID = process.env.DS_E2E_UID || (isCloudRun ? CLOUD_DEFAULT_UID : LOCAL_DEFAULT_UID);

const FIXTURE_FROM_ISO = '2024-03-15T09:45:00.000Z';
const FIXTURE_TO_ISO = '2024-03-15T10:15:00.000Z';

const TRACE_A = 'e2e-ts-trace-a'; // 5 spans, companion entry present
const TRACE_B = 'e2e-ts-trace-b'; // 1 span,  NO companion entry (#1842)
const TRACE_A_SPAN_COUNT = 5;
const TRACE_B_SPAN_COUNT = 1;

// SQL the plugin generates with hasTraceTimestampTable: true
function optimizedSql(traceId: string): string {
  return [
    `WITH '${traceId}' as trace_id,`,
    `(SELECT min(Start) FROM "e2e_test"."trace_ts_spans_trace_id_ts" WHERE TraceId = trace_id) as trace_start,`,
    `(SELECT max(End) + 1 FROM "e2e_test"."trace_ts_spans_trace_id_ts" WHERE TraceId = trace_id) as trace_end`,
    `SELECT "TraceId" as traceID, "SpanId" as spanID`,
    `FROM "e2e_test"."trace_ts_spans"`,
    `WHERE traceID = trace_id`,
    `AND "Timestamp" >= trace_start`,
    `AND "Timestamp" <= trace_end`,
  ].join(' ');
}

// SQL the plugin generates with hasTraceTimestampTable: false
function fallbackSql(traceId: string): string {
  return [
    `SELECT "TraceId" as traceID, "SpanId" as spanID`,
    `FROM "e2e_test"."trace_ts_spans"`,
    `WHERE traceID = '${traceId}'`,
  ].join(' ');
}

function exploreUrl(from: string, to: string): string {
  const query = {
    refId: 'A',
    datasource: { type: PLUGIN_TYPE, uid: DATASOURCE_UID },
    editorType: 'sql',
    pluginVersion: '',
    rawSql: '',
  };
  const panes = JSON.stringify({
    explore: { datasource: DATASOURCE_UID, queries: [query], range: { from, to } },
  });
  return `/explore?orgId=1&schemaVersion=1&panes=${encodeURIComponent(panes)}`;
}

async function enterSql(page: Page, sql: string) {
  const editor = page.getByRole('code');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(sql);
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

function spanCount(body: Record<string, unknown> | null): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const frames = (body as any)?.results?.A?.frames;
  if (!Array.isArray(frames) || frames.length === 0) {
    return 0;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const values = (frames[0] as any)?.data?.values?.[0];
  return Array.isArray(values) ? values.length : 0;
}

test.describe('trace timestamp table optimization (#1842)', () => {
  test.beforeEach(() => {
    test.skip(
      isCloudRun,
      'Fixture-data tests depend on the local trace_id_ts seed (tests/e2e/fixtures/trace_id_ts.sql) loaded via the e2e-data-loader Docker service, which is not available on Cloud.'
    );
  });

  test.describe.configure({ mode: 'serial' });

  test('optimized SQL returns all spans when the companion table has an entry for the trace', async ({
    page,
    explorePage,
  }) => {
    await page.goto(exploreUrl(FIXTURE_FROM_ISO, FIXTURE_TO_ISO));
    await enterSql(page, optimizedSql(TRACE_A));

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    expect(spanCount(getBody())).toBe(TRACE_A_SPAN_COUNT);
  });

  test('optimized SQL returns no rows when the companion table has no entry for the trace (#1842 — why the guard exists)', async ({
    page,
    explorePage,
  }) => {
    // trace-b has no companion row, so min(Start)/max(End) are NULL.
    // Timestamp >= NULL is NULL (falsy), so all rows are filtered out.
    // This demonstrates the risk of shipping optimized SQL for an unverified
    // table: a real trace becomes invisible on first click.
    await page.goto(exploreUrl(FIXTURE_FROM_ISO, FIXTURE_TO_ISO));
    await enterSql(page, optimizedSql(TRACE_B));

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    expect(spanCount(getBody())).toBe(0);
  });

  test('fallback SQL returns the span even when the companion table has no entry (#1842 fix)', async ({
    page,
    explorePage,
  }) => {
    await page.goto(exploreUrl(FIXTURE_FROM_ISO, FIXTURE_TO_ISO));
    await enterSql(page, fallbackSql(TRACE_B));

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    expect(spanCount(getBody())).toBe(TRACE_B_SPAN_COUNT);
  });

  test('fallback SQL returns all spans for a trace that also has a companion entry', async ({ page, explorePage }) => {
    // Confirms the fallback is correct in all cases, not just missing-companion.
    await page.goto(exploreUrl(FIXTURE_FROM_ISO, FIXTURE_TO_ISO));
    await enterSql(page, fallbackSql(TRACE_A));

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    expect(spanCount(getBody())).toBe(TRACE_A_SPAN_COUNT);
  });

  test('SHOW TABLES FROM e2e_test includes both the spans table and its companion', async ({ page, explorePage }) => {
    // Verifies that hasTraceTimestampTable() would resolve true for this table
    // in this database: the companion exists and SHOW TABLES returns it.
    await page.goto(exploreUrl(FIXTURE_FROM_ISO, FIXTURE_TO_ISO));
    await enterSql(page, 'SHOW TABLES FROM e2e_test');

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = (getBody() as any)?.results?.A?.frames;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableNames: string[] = frames?.[0]?.data?.values?.[0] ?? [];

    expect(tableNames).toContain('trace_ts_spans');
    expect(tableNames).toContain('trace_ts_spans_trace_id_ts');
  });
});
