import { expect, test } from '@grafana/plugin-e2e';
import { FIXTURE_FROM_ISO, FIXTURE_TO_ISO, skipFixtureTestsOnCloud } from '../helpers/env';
import { exploreUrl } from '../helpers/explore';
import { frameValues, rowCount } from '../helpers/queryResponse';
import { runSqlAndGetBody } from '../helpers/sqlEditor';

// E2E guard for the hasTraceTimestampTable optimisation and its #1842
// regression guard. The tests exercise the two SQL shapes the plugin
// generates against real ClickHouse:
//
//   Optimised  – WITH __gf_trace_id / __gf_trace_start / __gf_trace_end + Timestamp bounds
//   Fallback   – plain WHERE traceID = '<id>'
//
// Fixture: tests/fixtures/trace_id_ts.sql creates
//   e2e_test.trace_ts_spans            (5 spans for trace-a, 1 for trace-b)
//   e2e_test.trace_ts_spans_trace_id_ts (companion entry for trace-a ONLY)
//
// The missing trace-b entry in the companion reproduces the #1842 scenario:
// optimised SQL returns 0 rows because the Timestamp bounds become NULL;
// the fallback returns the span correctly.

const TRACE_A = 'e2e-ts-trace-a'; // 5 spans, companion entry present
const TRACE_B = 'e2e-ts-trace-b'; // 1 span,  NO companion entry (#1842)
const TRACE_A_SPAN_COUNT = 5;
const TRACE_B_SPAN_COUNT = 1;

// SQL the plugin generates with hasTraceTimestampTable: true
function optimisedSql(traceId: string): string {
  return [
    `WITH '${traceId}' as __gf_trace_id,`,
    `(SELECT min(Start) FROM "e2e_test"."trace_ts_spans_trace_id_ts" WHERE TraceId = __gf_trace_id) as __gf_trace_start,`,
    `(SELECT max(End) + 1 FROM "e2e_test"."trace_ts_spans_trace_id_ts" WHERE TraceId = __gf_trace_id) as __gf_trace_end`,
    `SELECT "TraceId" as traceID, "SpanId" as spanID`,
    `FROM "e2e_test"."trace_ts_spans"`,
    `WHERE traceID = __gf_trace_id`,
    `AND "Timestamp" >= __gf_trace_start`,
    `AND "Timestamp" <= __gf_trace_end`,
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

test.describe('Trace timestamp table optimisation (#1842)', () => {
  test.beforeEach(() => {
    skipFixtureTestsOnCloud('trace_id_ts.sql');
  });

  test.describe.configure({ mode: 'serial' });

  test('optimised SQL returns all spans when the companion table has an entry for the trace', async ({
    page,
    explorePage,
  }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    const body = await runSqlAndGetBody(page, explorePage, optimisedSql(TRACE_A));

    expect(rowCount(body)).toBe(TRACE_A_SPAN_COUNT);
  });

  test('optimised SQL returns no rows when the companion table has no entry for the trace (#1842 — why the guard exists)', async ({
    page,
    explorePage,
  }) => {
    // trace-b has no companion row, so min(Start)/max(End) are NULL.
    // Timestamp >= NULL is NULL (falsy), so all rows are filtered out.
    // This demonstrates the risk of shipping optimised SQL for an unverified
    // table: a real trace becomes invisible on first click.
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    const body = await runSqlAndGetBody(page, explorePage, optimisedSql(TRACE_B));

    expect(rowCount(body)).toBe(0);
  });

  test('fallback SQL returns the span even when the companion table has no entry (#1842 fix)', async ({
    page,
    explorePage,
  }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    const body = await runSqlAndGetBody(page, explorePage, fallbackSql(TRACE_B));

    expect(rowCount(body)).toBe(TRACE_B_SPAN_COUNT);
  });

  test('fallback SQL returns all spans for a trace that also has a companion entry', async ({ page, explorePage }) => {
    // Confirms the fallback is correct in all cases, not just missing-companion.
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    const body = await runSqlAndGetBody(page, explorePage, fallbackSql(TRACE_A));

    expect(rowCount(body)).toBe(TRACE_A_SPAN_COUNT);
  });

  test('SHOW TABLES FROM e2e_test includes both the spans table and its companion', async ({ page, explorePage }) => {
    // Verifies that hasTraceTimestampTable() would resolve true for this table
    // in this database: the companion exists and SHOW TABLES returns it.
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    const body = await runSqlAndGetBody(page, explorePage, 'SHOW TABLES FROM e2e_test');

    const tableNames = frameValues(body)[0] ?? [];

    expect(tableNames).toContain('trace_ts_spans');
    expect(tableNames).toContain('trace_ts_spans_trace_id_ts');
  });
});
