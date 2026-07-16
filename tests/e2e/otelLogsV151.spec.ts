import { expect, test, ExplorePage } from '@grafana/plugin-e2e';
import { Page } from '@playwright/test';

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

const PLUGIN_TYPE = 'grafana-clickhouse-datasource';

const isCloudRun = !!process.env.GRAFANA_URL;

const CLOUD_DEFAULT_UID = 'clickhouse-native-ds-m';
const LOCAL_DEFAULT_UID = 'clickhouse-e2e';
const DATASOURCE_UID = process.env.DS_E2E_UID || (isCloudRun ? CLOUD_DEFAULT_UID : LOCAL_DEFAULT_UID);

const FIXTURE_FROM_ISO = '2024-03-15T09:45:00.000Z';
const FIXTURE_TO_ISO = '2024-03-15T10:15:00.000Z';
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
    if (!b?.results?.A) {
      return false;
    }
    body = b as Record<string, unknown>;
    return true;
  });
  return { responsePromise, getBody: () => body };
}

function rowCount(body: Record<string, unknown> | null): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const frames = (body as any)?.results?.A?.frames;
  if (!Array.isArray(frames) || frames.length === 0) {
    return 0;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const values = (frames[0] as any)?.data?.values?.[0];
  return Array.isArray(values) ? values.length : 0;
}

test.describe('otel_logs v0.151.0 schema (#1882)', () => {
  test.beforeEach(() => {
    test.skip(
      isCloudRun,
      'Fixture-data tests depend on the local otel_logs_v151 seed (tests/e2e/fixtures/otel_logs_v0151.sql) loaded via the e2e-data-loader Docker service, which is not available on Cloud.'
    );
  });

  test('SQL for the 1.3.0 schema entry succeeds against an otel_logs v0.151.0 layout', async ({
    page,
    explorePage,
  }) => {
    await page.goto(exploreUrl(FIXTURE_FROM_ISO, FIXTURE_TO_ISO));
    await enterSql(page, v151Sql);

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await page.locator('.query-editor-row').getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    expect(rowCount(getBody())).toBe(FIXTURE_ROW_COUNT);
  });
});
