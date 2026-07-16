import { expect, test, ExplorePage } from '@grafana/plugin-e2e';
import { Page } from '@playwright/test';

// Regression guard for the Traces query-builder crash on older Grafana
// (reproduced on the >=11.6 floor, worked on 13.x).
//
// Running a Traces query in Explore attaches "View trace" / "View logs" data
// links to the traceID field. The link's internal query embedded the live
// Datasource instance, which is circular (datasource.variables.datasource ===
// datasource, introduced with CustomVariableSupport). Grafana's Explore link
// scanner (getStringsFromObject in explore/utils/links.ts) walks the internal
// query with no cycle guard, so on Grafana versions without the upstream guard
// it recursed forever and threw "RangeError: Maximum call stack size exceeded",
// blanking the results panel. The fix embeds a plain { uid, type } ref instead
// (src/data/utils.ts); unit coverage lives in src/data/utils.test.ts.
//
// This test is intentionally generic: it fails on ANY uncaught exception or
// fatal console error while a Traces query renders, so future regressions in
// the trace render/transform path (stack overflows, React "Maximum update
// depth" render loops, etc.) are caught here too — not just this exact bug.
// Its value is the cross-version matrix: the reusable plugin CI runs Playwright
// against the grafanaDependency floor, where this class of crash manifests.

const PLUGIN_TYPE = 'grafana-clickhouse-datasource';

const isCloudRun = !!process.env.GRAFANA_URL;

const CLOUD_DEFAULT_UID = 'clickhouse-native-ds-m';
const LOCAL_DEFAULT_UID = 'clickhouse-e2e';
const DATASOURCE_UID = process.env.DS_E2E_UID || (isCloudRun ? CLOUD_DEFAULT_UID : LOCAL_DEFAULT_UID);

// trace_spans (tests/e2e/fixtures/trace_spans.sql) seeds spans for e2e-trace-a
// and e2e-trace-b between 2024-03-15 10:00:00 and 10:00:10 UTC.
const FIXTURE_FROM_ISO = '2024-03-15T09:45:00.000Z';
const FIXTURE_TO_ISO = '2024-03-15T10:15:00.000Z';

// Fatal client-side error signatures. Matching any of these means a render or
// transform blew up rather than failing gracefully.
const FATAL_ERROR_PATTERNS = [
  /maximum call stack size exceeded/i, // infinite recursion (this bug)
  /too much recursion/i, // same, Firefox wording
  /maximum update depth exceeded/i, // React #185 render loop
];

function isFatal(text: string): boolean {
  return FATAL_ERROR_PATTERNS.some((re) => re.test(text));
}

/**
 * Attaches listeners that record uncaught page exceptions and fatal console
 * errors for the lifetime of the test. Returns a getter for the collected
 * messages so the test can assert on them after the query has rendered.
 */
function collectClientErrors(page: Page): { getErrors: () => string[] } {
  const errors: string[] = [];
  // Uncaught exceptions that escape to the window.
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  // Errors logged to the console (React error boundaries and Grafana's query
  // runner report crashes here rather than as uncaught page errors).
  page.on('console', (msg) => {
    if (msg.type() === 'error' && isFatal(msg.text())) {
      errors.push(`console.error: ${msg.text()}`);
    }
  });
  return { getErrors: () => errors };
}

/**
 * Builds an Explore URL for a Traces query-builder query against trace_spans.
 * A builder query (queryType=traces) is used deliberately: it always attaches
 * the View trace / View logs data links — the exact path that crashed — without
 * needing datasource-level trace defaults.
 */
function traceExploreUrl(): string {
  const builderOptions = {
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
  };

  const query = {
    refId: 'A',
    datasource: { type: PLUGIN_TYPE, uid: DATASOURCE_UID },
    editorType: 'builder',
    pluginVersion: '',
    // The builder normally generates this; supply it so the query runs
    // deterministically on load without depending on editor re-generation.
    rawSql:
      'SELECT "TraceId" as traceID, "ServiceName" as serviceName, "SpanName" as operationName, ' +
      '"Timestamp" as startTime, "Duration" as duration FROM "e2e_test"."trace_spans" ' +
      'WHERE ( "Timestamp" >= $__fromTime AND "Timestamp" <= $__toTime ) ORDER BY "Timestamp" DESC LIMIT 1000',
    builderOptions,
    format: 1,
  };

  const panes = JSON.stringify({
    explore: {
      datasource: DATASOURCE_UID,
      queries: [query],
      range: { from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO },
    },
  });
  return `/explore?orgId=1&schemaVersion=1&panes=${encodeURIComponent(panes)}`;
}

test.describe('Traces query renders without crashing', () => {
  test.beforeEach(() => {
    test.skip(
      isCloudRun,
      'Fixture-data tests depend on the local trace_spans seed (tests/e2e/fixtures/trace_spans.sql) loaded via the e2e-data-loader Docker service, which is not available on Cloud.'
    );
  });

  test('a Traces query with rendered trace-detail links throws no uncaught/fatal client errors', async ({
    page,
    explorePage,
  }: {
    page: Page;
    explorePage: ExplorePage;
  }) => {
    const { getErrors } = collectClientErrors(page);

    const responsePromise = explorePage.waitForQueryDataResponse();
    await page.goto(traceExploreUrl());
    await responsePromise;

    // Let the results panel render and any deferred link scan run. The crash
    // surfaces here (during render), after the data response resolves.
    await page.waitForTimeout(2000);

    // Primary, descriptive guard: no stack overflow / render-loop crash. Checked
    // first so a regression reports the actual fatal message rather than a
    // downstream "element not found" once the crash has blanked the panel.
    expect(getErrors(), `Unexpected fatal client errors:\n${getErrors().join('\n')}`).toEqual([]);

    // Secondary: the link-bearing traceID field actually rendered, so the clean
    // error log above is meaningful rather than vacuous. The "View trace" link
    // is exactly what Grafana's scanner walks (and what used to crash it).
    await expect(page.getByRole('link', { name: 'e2e-trace-a' }).first()).toBeVisible();
  });
});
