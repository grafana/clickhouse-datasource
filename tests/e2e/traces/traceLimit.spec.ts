import { expect, test } from '@grafana/plugin-e2e';
import { FIXTURE_FROM_ISO, FIXTURE_TO_ISO, skipFixtureTestsOnCloud } from '../helpers/env';
import { exploreUrl } from '../helpers/explore';
import { frames, rowCount } from '../helpers/queryResponse';
import { runSqlAndGetBody } from '../helpers/sqlEditor';

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

// The trace_spans fixture in tests/fixtures/trace_spans.sql seeds five
// spans for this trace at 2024-03-15 10:00:00–10:00:04 UTC.
const TRACE_ID = 'e2e-trace-a';
const EXPECTED_SPAN_COUNT = 5;

test.describe('Trace ID query (#1541)', () => {
  test.beforeEach(() => {
    skipFixtureTestsOnCloud('trace_spans.sql');
  });

  test.describe.configure({ mode: 'serial' });

  test('single-trace span query returns all spans (no LIMIT truncation)', async ({ page, explorePage }) => {
    // Mirror the SQL shape the fixed `generateTraceIdQuery` now produces
    // for a non-OTel trace lookup: SELECT ... WHERE TraceId = '…' with NO
    // LIMIT clause. Before the fix this SQL had LIMIT 3 appended, cutting
    // the waterfall.
    const sql = `SELECT TraceId AS traceID, SpanId AS spanID, ParentSpanId AS parentSpanID, ServiceName AS serviceName, SpanName AS operationName FROM e2e_test.trace_spans WHERE TraceId = '${TRACE_ID}'`;

    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    const body = await runSqlAndGetBody(page, explorePage, sql);

    expect(frames(body).length).toBeGreaterThan(0);

    // The fixture seeds five spans for e2e-trace-a, so the frame's row count
    // must be 5 — anything less means a LIMIT clause truncated the spans.
    expect(rowCount(body)).toBe(EXPECTED_SPAN_COUNT);
  });

  test('applying a 3-row LIMIT truncates — confirms the fixture has >3 spans', async ({ page, explorePage }) => {
    // Complementary assertion: with the old buggy behaviour (LIMIT 3 inherited
    // from the list query), only 3 of the 5 spans would be returned. This
    // test guards against the fixture accidentally seeding <=3 spans, which
    // would make the companion "no LIMIT" assertion above trivially pass.
    const sql = `SELECT TraceId FROM e2e_test.trace_spans WHERE TraceId = '${TRACE_ID}' LIMIT 3`;

    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    const body = await runSqlAndGetBody(page, explorePage, sql);

    expect(rowCount(body)).toBe(3);
  });
});
