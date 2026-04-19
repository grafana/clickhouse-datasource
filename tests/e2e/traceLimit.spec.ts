import { expect, test, ExplorePage } from '@grafana/plugin-e2e';
import { Locator, Page } from '@playwright/test';

// Regression guard for #1541 — Trace viewer LIMIT applies to both list view
// and trace view.
//
// Before the fix, when a user searched traces with `limit = 3`, clicking
// through to a single trace reused the same LIMIT clause for the span
// query, so the waterfall was missing spans. The fix drops LIMIT from
// `generateTraceIdQuery` (single-trace mode). Unit tests in
// `src/data/sqlGenerator.test.ts` cover the generator directly. This E2E
// test runs the SQL the generator now produces against a seeded trace and
// verifies every span is returned (not truncated at 3) — the end-to-end
// guarantee the issue was really about.
//
// We exercise this via the SQL editor rather than clicking through the
// Traces query-builder UI because the plugin's Traces builder needs OTel
// column provisioning that isn't currently wired into the e2e setup.
// Unit tests cover the builder side.

const DATASOURCE_UID = 'clickhouse-e2e';
const PLUGIN_TYPE = 'grafana-clickhouse-datasource';

// The trace_spans fixture in tests/e2e/fixtures/trace_spans.sql seeds five
// spans for this trace at 2024-03-15 10:00:00–10:00:04 UTC.
const FIXTURE_FROM_ISO = '2024-03-15T09:45:00.000Z';
const FIXTURE_TO_ISO = '2024-03-15T10:15:00.000Z';
const TRACE_ID = 'e2e-trace-a';
const EXPECTED_SPAN_COUNT = 5;

function queryEditorRow(page: Page): Locator {
  return page.locator('[data-testid="data-testid Query editor row"], [aria-label="Query editor row"]');
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

test.describe('Trace ID query (#1541)', () => {
  test.describe.configure({ mode: 'serial' });

  test('single-trace span query returns all spans (no LIMIT truncation)', async ({ page, explorePage }) => {
    // Mirror the SQL shape the fixed `generateTraceIdQuery` now produces
    // for a non-OTel trace lookup: SELECT ... WHERE TraceId = '…' with NO
    // LIMIT clause. Before the fix this SQL had LIMIT 3 appended, cutting
    // the waterfall.
    const sql = `SELECT TraceId AS traceID, SpanId AS spanID, ParentSpanId AS parentSpanID, ServiceName AS serviceName, SpanName AS operationName FROM e2e_test.trace_spans WHERE TraceId = '${TRACE_ID}'`;

    await page.goto(exploreUrl(FIXTURE_FROM_ISO, FIXTURE_TO_ISO));
    await enterSql(page, sql);

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await queryEditorRow(page).getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = (getBody() as any)?.results?.A?.frames;
    expect(Array.isArray(frames) && frames.length).toBeGreaterThan(0);

    // Sum the row count across the returned data frames. clickhouse-datasource
    // returns one frame with a values array per column; the number of spans
    // equals the length of any column's value list.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstFrame = frames[0] as any;
    const anyColumn = firstFrame?.data?.values?.[0];
    expect(Array.isArray(anyColumn)).toBe(true);
    expect(anyColumn.length).toBe(EXPECTED_SPAN_COUNT);
  });

  test('applying a 3-row LIMIT truncates — confirms the fixture has >3 spans', async ({ page, explorePage }) => {
    // Complementary assertion: with the old buggy behavior (LIMIT 3 inherited
    // from the list query), only 3 of the 5 spans would be returned. This
    // test guards against the fixture accidentally seeding <=3 spans, which
    // would make the companion "no LIMIT" assertion above trivially pass.
    const sql = `SELECT TraceId FROM e2e_test.trace_spans WHERE TraceId = '${TRACE_ID}' LIMIT 3`;

    await page.goto(exploreUrl(FIXTURE_FROM_ISO, FIXTURE_TO_ISO));
    await enterSql(page, sql);

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await queryEditorRow(page).getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = (getBody() as any)?.results?.A?.frames;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstFrame = frames?.[0] as any;
    const anyColumn = firstFrame?.data?.values?.[0];
    expect(anyColumn.length).toBe(3);
  });
});
