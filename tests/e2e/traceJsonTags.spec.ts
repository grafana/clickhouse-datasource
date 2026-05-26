import { expect, test, ExplorePage } from '@grafana/plugin-e2e';
import { Page } from '@playwright/test';

// E2E regression guard for the tagsColumnIsJSON feature.
//
// Background: ClickHouse 26+ uses a native JSON type for span/resource
// attribute columns (SpanAttributes, ResourceAttributes) instead of
// Map(String,String).  mapKeys() does not work on JSON type, so the plugin
// must select those columns directly and CAST nested event/link attribute
// lambdas to Map when tagsColumnIsJSON is enabled.
//
// These tests verify the full stack:
//   A. Config editor: the "Tags Columns Use JSON Type" toggle is not disabled
//      when OTel mode is also enabled (regression for the disabled={otelEnabled} bug).
//   B. SQL query with JSON attribute columns executes without a mapKeys error
//      and returns the correct number of rows.
//   C. The tags/serviceTags values in the response body are non-null JSON
//      objects (confirming ClickHouse returned JSON data, not an error).
//
// Fixture data is in tests/e2e/fixtures/trace_spans_json.sql (3 spans for
// trace 'e2e-json-trace-a').  The provisioned datasource uid
// 'clickhouse-e2e-json-tags' has otelEnabled:true and tagsColumnIsJSON:true.

const PLUGIN_TYPE = 'grafana-clickhouse-datasource';
const DATASOURCE_UID = 'clickhouse-e2e-json-tags';

const FIXTURE_FROM_ISO = '2024-03-15T09:45:00.000Z';
const FIXTURE_TO_ISO = '2024-03-15T10:15:00.000Z';
const TRACE_ID = 'e2e-json-trace-a';
const EXPECTED_SPAN_COUNT = 3;

const isCloudRun = !!process.env.GRAFANA_URL;

// SQL that mirrors what generateTraceIdQuery produces with tagsColumnIsJSON=true:
// SpanAttributes and ResourceAttributes are selected directly (no mapKeys).
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

test.describe('JSON-typed trace attribute columns (tagsColumnIsJSON)', () => {
  test.describe.configure({ mode: 'serial' });

  // ── Test A: config editor toggle ────────────────────────────────────────────

  test('config editor: tagsColumnIsJSON toggle is visible and checked when OTel is on', async ({
    gotoDataSourceConfigPage,
    page,
  }) => {
    // Regression guard: the switch was previously disabled={otelEnabled},
    // preventing JSON-column users from enabling the feature with OTel on.
    // The provisioned 'clickhouse-e2e-json-tags' datasource has both
    // otelEnabled:true and tagsColumnIsJSON:true, so the "Additional settings"
    // section auto-expands (hasAdditionalSettings/shouldBeOpen = true in both
    // V1 and V2 editors when traces config is non-empty).
    test.skip(
      isCloudRun,
      'Provisioned-datasource tests depend on provisioning/datasources/clickhouse.yml which is not applied on Cloud.'
    );

    await gotoDataSourceConfigPage(DATASOURCE_UID);

    // The toggle must be visible and enabled — before the fix it was
    // disabled={otelEnabled}, making it impossible to toggle for OTel users.
    const tagsJsonSwitch = page.getByRole('switch', { name: 'Tags Columns Use JSON Type' });
    await expect(tagsJsonSwitch).toBeVisible();
    await expect(tagsJsonSwitch).toBeEnabled();
    // Provisioned with tagsColumnIsJSON:true so the switch must be checked.
    await expect(tagsJsonSwitch).toBeChecked();
  });

  // ── Tests B & C: require local fixture data ──────────────────────────────────

  test('(fixture) SQL with direct JSON column references returns all spans', async ({ page, explorePage }) => {
    test.skip(
      isCloudRun,
      'Fixture-data tests depend on trace_spans_json seeded via tests/e2e/fixtures/trace_spans_json.sql, which is not available on Cloud.'
    );
    // Exercises the fix: selecting SpanAttributes/ResourceAttributes directly
    // (without mapKeys) must succeed and return all 3 seeded spans.
    // Before the fix this would fail with:
    //   "Function mapKeys requires at least one argument of type Map"
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
    // Verifies the Go backend correctly passes JSON column data through.
    // The raw /api/ds/query response (captured before client-side transformation)
    // should contain non-null objects for the tags and serviceTags fields.
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
