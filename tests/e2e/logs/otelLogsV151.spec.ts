import { expect, test } from '@grafana/plugin-e2e';
import { FIXTURE_FROM_ISO, FIXTURE_TO_ISO, skipFixtureTestsOnCloud } from '../helpers/env';
import { exploreUrl } from '../helpers/explore';
import { rowCount } from '../helpers/queryResponse';
import { runSqlAndGetBody } from '../helpers/sqlEditor';

// E2E guard for #1882: opentelemetry-collector-contrib clickhouseexporter v0.151.0
// rewrote otel_logs and removed the `TimestampTime` column. The plugin's 1.3.0 OTel
// schema entry omits the FilterTime → TimestampTime mapping, so sqlGenerator falls
// back to ColumnHint.Time (`Timestamp`) for both the default time filter and the
// default ORDER BY.
//
// This test exercises the SQL the plugin generates against a real otel_logs-shaped
// table matching the v0.151.0 layout (tests/e2e/fixtures/otel_logs_v0151.sql) and
// asserts:
//   1. The query succeeds (no "Unknown identifier 'TimestampTime'" error)
//   2. Rows are returned for the seeded data
//
// SQL generation for both schema entries (1.2.9 and 1.3.0) is covered by unit tests
// in src/data/sqlGenerator.test.ts; this spec only locks in the integration path
// against a real ClickHouse instance.

// The fixture inserts exactly 5 rows into e2e_test.otel_logs_v151, all inside
// the shared fixture window.
const FIXTURE_ROW_COUNT = 5;

// SQL the plugin generates with the 1.3.0 OTel schema entry: the default Time
// filter and default ORDER BY both resolve to `Timestamp` (the FilterTime → Time
// fallback in src/data/sqlGenerator.ts).
const v151Sql = [
  `SELECT "Timestamp" as "timestamp", "Body" as "body", "SeverityText" as "level"`,
  `FROM "e2e_test"."otel_logs_v151"`,
  `WHERE ( "Timestamp" >= toDateTime64('2024-03-15 09:45:00.000', 9)`,
  `AND "Timestamp" <= toDateTime64('2024-03-15 10:15:00.000', 9) )`,
  `ORDER BY "Timestamp" DESC LIMIT 1000`,
].join(' ');

test.describe('OTel logs v0.151.0 schema (#1882)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(() => {
    skipFixtureTestsOnCloud('otel_logs_v0151.sql');
  });

  test('SQL for the 1.3.0 schema entry succeeds against an otel_logs v0.151.0 layout', async ({
    page,
    explorePage,
  }) => {
    await page.goto(exploreUrl({ from: FIXTURE_FROM_ISO, to: FIXTURE_TO_ISO }));
    const body = await runSqlAndGetBody(page, explorePage, v151Sql);
    expect(rowCount(body)).toBe(FIXTURE_ROW_COUNT);
  });
});
