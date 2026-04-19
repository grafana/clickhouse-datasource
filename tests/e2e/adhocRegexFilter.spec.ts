import { expect, test, ExplorePage } from '@grafana/plugin-e2e';
import { Locator, Page } from '@playwright/test';

// Matches the uid set in provisioning/datasources/clickhouse.yml
const DATASOURCE_UID = 'clickhouse-e2e';
const PLUGIN_TYPE = 'grafana-clickhouse-datasource';

// Time range that fully covers the seed fixture data in tests/e2e/fixtures/seed.sql
const FIXTURE_FROM_ISO = '2024-03-15T09:45:00.000Z';
const FIXTURE_TO_ISO = '2024-03-15T10:15:00.000Z';

function queryEditorRow(page: Page): Locator {
  return page.locator('[data-testid="data-testid Query editor row"], [aria-label="Query editor row"]');
}

function exploreUrl(from = FIXTURE_FROM_ISO, to = FIXTURE_TO_ISO): string {
  const query = {
    refId: 'A',
    datasource: { type: PLUGIN_TYPE, uid: DATASOURCE_UID },
    editorType: 'sql',
    pluginVersion: '',
    rawSql: '',
  };
  const panes = JSON.stringify({
    explore: {
      datasource: DATASOURCE_UID,
      queries: [query],
      range: { from, to },
    },
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

// ---------------------------------------------------------------------------
// Ad-hoc regex-operator filter regression guards (#1443)
//
// Unit tests in src/data/adHocFilter.test.ts cover the JS-level mapping of
// Grafana's `=~` / `!~` operators to ClickHouse `REGEXP` / `NOT REGEXP`
// and the exact `additional_table_filters={...}` shape AdHocFilter.apply()
// produces. Those tests can't confirm that ClickHouse actually accepts
// `REGEXP` and `NOT REGEXP` as a filter operator — only E2E can.
//
// Each test below runs a plain `WHERE ... REGEXP ...` query against the
// fixture to verify ClickHouse accepts the operator. If a future refactor
// silently reintroduces ILIKE (which is a LIKE pattern, not a regex), the
// third test — which uses a regex-only pattern that matches nothing as a
// LIKE — will fail.
//
// We deliberately avoid typing the full `SETTINGS additional_table_filters={...}`
// shape through the Monaco editor because Monaco auto-closes `{`, which
// mangles that syntax on keystroke entry. The unit tests cover the exact
// shape; the E2E tests cover the operator semantics.
// ---------------------------------------------------------------------------

test.describe('Ad-hoc regex operator filters', () => {
  test.describe.configure({ mode: 'serial' });

  test('REGEXP returns matching rows', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    // The fixture has exactly two messages that start with "Request":
    // "Request received" and "Request processed".
    await enterSql(
      page,
      "SELECT timestamp, message FROM e2e_test.events WHERE message REGEXP '^Request' ORDER BY timestamp"
    );

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await queryEditorRow(page).getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = (getBody() as any)?.results?.A?.frames;
    expect(frames?.length).toBeGreaterThan(0);
    const messages = frames[0]?.data?.values?.[1];
    expect(messages).toEqual(['Request received', 'Request processed']);
  });

  test('NOT REGEXP returns the complement', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    // 10 rows in the fixture, 2 start with "Request", so 8 remain.
    await enterSql(
      page,
      "SELECT timestamp, message FROM e2e_test.events WHERE message NOT REGEXP '^Request' ORDER BY timestamp"
    );

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await queryEditorRow(page).getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = (getBody() as any)?.results?.A?.frames;
    expect(frames?.length).toBeGreaterThan(0);
    const messages = frames[0]?.data?.values?.[1];
    expect(messages?.length).toBe(8);
    // None of the remaining rows should start with "Request".
    expect(messages?.every((m: string) => !m.startsWith('Request'))).toBe(true);
  });

  test('REGEXP treats the pattern as a regex, not a LIKE pattern', async ({ page, explorePage }) => {
    await page.goto(exploreUrl());
    // This test exists specifically to guard against a regression back to
    // ILIKE. The pattern `^(info|warn)$` is a regex that matches "info" or
    // "warn" exactly. As an ILIKE pattern it would match nothing (the
    // characters `^`, `(`, `|`, `)`, `$` are not wildcards in LIKE, and
    // there is no level literally equal to `^(info|warn)$`). If this test
    // ever sees zero rows, ILIKE is back.
    await enterSql(
      page,
      "SELECT level FROM e2e_test.events WHERE level REGEXP '^(info|warn)$' ORDER BY timestamp"
    );

    const { responsePromise, getBody } = await waitForQueryDataResponseWithBody(explorePage);
    await queryEditorRow(page).getByRole('button', { name: 'Run Query' }).click();
    await responsePromise;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames = (getBody() as any)?.results?.A?.frames;
    expect(frames?.length).toBeGreaterThan(0);
    const levels: string[] = frames[0]?.data?.values?.[0] ?? [];
    // Fixture has 5 "info" rows and 1 "warn" row.
    expect(levels.length).toBe(6);
    expect(levels.every((l) => l === 'info' || l === 'warn')).toBe(true);
  });
});
