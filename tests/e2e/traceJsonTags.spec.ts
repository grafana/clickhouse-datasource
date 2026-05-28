import { expect, test, ExplorePage } from '@grafana/plugin-e2e';
import { Page } from '@playwright/test';

// E2E regression guard for the JSON-type trace attribute feature.
//
// Background: ClickHouse 26+ uses a native JSON type for span/resource/event/link
// attribute columns (SpanAttributes, ResourceAttributes, Events.Attributes,
// Links.Attributes) instead of Map(String,String).  mapKeys() does not work on
// JSON type; the plugin auto-detects JSON columns and uses JSONAllPaths +
// JSONExtractString (with splitByChar dot-path traversal) instead.
//
// These tests verify the full stack:
//   A. SQL query with JSON attribute columns executes without a mapKeys error
//      and returns the correct number of rows.
//   B. The tags/serviceTags values in the response body are non-null JSON
//      objects (confirming ClickHouse returned JSON data, not an error).
//
// Fixture data is in tests/e2e/fixtures/trace_spans_json.sql (3 spans for
// trace 'e2e-json-trace-a').  The provisioned datasource uid
// 'clickhouse-e2e-json-tags' points at the local ClickHouse instance.

const PLUGIN_TYPE = 'grafana-clickhouse-datasource';
const DATASOURCE_UID = 'clickhouse-e2e-json-tags';

const FIXTURE_FROM_ISO = '2024-03-15T09:45:00.000Z';
const FIXTURE_TO_ISO = '2024-03-15T10:15:00.000Z';
const TRACE_ID = 'e2e-json-trace-a';
const EXPECTED_SPAN_COUNT = 3;

const isCloudRun = !!process.env.GRAFANA_URL;

// Simplified SQL that exercises JSON-typed attribute columns without mapKeys.
// The real generated SQL uses JSONAllPaths + JSONExtractString; this raw query
// validates that the backend returns JSON column data without errors.
const TRACE_SQL = [
  `SELECT TraceId as traceID, SpanId as spanID, ParentSpanId as parentSpanID,`,
  `ServiceName as serviceName, SpanName as operationName,`,
  `SpanAttributes as tags, ResourceAttributes as serviceTags`,
  `FROM e2e_test.trace_spans_json`,
  `WHERE TraceId = '${TRACE_ID}'`,
].join(' ');

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

test.describe('JSON-typed trace attribute columns', () => {
  test.describe.configure({ mode: 'serial' });

  test('(fixture) SQL with JSON column references returns all spans', async ({ page, explorePage }) => {
    test.skip(
      isCloudRun,
      'Fixture-data tests depend on trace_spans_json seeded via tests/e2e/fixtures/trace_spans_json.sql, which is not available on Cloud.'
    );
    // Selects SpanAttributes/ResourceAttributes as raw JSON (no mapKeys).
    // Must succeed and return all 3 seeded spans.
    await page.goto(exploreUrl(FIXTURE_FROM_ISO, FIXTURE_TO_ISO));
    await enterSql(page, TRACE_SQL);

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = (getBody() as any)?.results?.A?.frames;
    expect(Array.isArray(frames) && frames.length).toBeGreaterThan(0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstFrame = frames[0] as any;
    const anyColumn = firstFrame?.data?.values?.[0];
    expect(Array.isArray(anyColumn)).toBe(true);
    expect(anyColumn.length).toBe(EXPECTED_SPAN_COUNT);
  });

  test('(fixture) tags and serviceTags fields carry non-null JSON data', async ({ page, explorePage }) => {
    // Verifies the Go backend passes JSON column data through correctly.
    test.skip(
      isCloudRun,
      'Fixture-data tests depend on trace_spans_json seeded via tests/e2e/fixtures/trace_spans_json.sql, which is not available on Cloud.'
    );

    await page.goto(exploreUrl(FIXTURE_FROM_ISO, FIXTURE_TO_ISO));
    await enterSql(page, TRACE_SQL);

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = (getBody() as any)?.results?.A?.frames;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstFrame = frames?.[0] as any;

    // Find the index of the 'tags' field by name in the frame schema.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schemaFields: Array<{ name: string }> = firstFrame?.schema?.fields ?? [];
    const tagsIdx = schemaFields.findIndex((f) => f.name === 'tags');
    const serviceTagsIdx = schemaFields.findIndex((f) => f.name === 'serviceTags');
    expect(tagsIdx).toBeGreaterThanOrEqual(0);
    expect(serviceTagsIdx).toBeGreaterThanOrEqual(0);

    const tagsValues: unknown[] = firstFrame?.data?.values?.[tagsIdx] ?? [];
    const serviceTagsValues: unknown[] = firstFrame?.data?.values?.[serviceTagsIdx] ?? [];

    // Every row must have a non-null, non-empty object for tags and serviceTags.
    // A null or missing value would indicate the JSON column was not returned;
    // a plain string would indicate mapKeys failed and the error propagated.
    expect(tagsValues.length).toBe(EXPECTED_SPAN_COUNT);
    for (const v of tagsValues) {
      expect(v).not.toBeNull();
      expect(typeof v).toBe('object');
      expect(Object.keys(v as object).length).toBeGreaterThan(0);
    }

    expect(serviceTagsValues.length).toBe(EXPECTED_SPAN_COUNT);
    for (const v of serviceTagsValues) {
      expect(v).not.toBeNull();
      expect(typeof v).toBe('object');
    }
  });
});
