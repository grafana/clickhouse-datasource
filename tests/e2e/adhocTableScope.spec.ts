import { expect, test } from '@grafana/plugin-e2e';
import { Page, Response } from '@playwright/test';
import { DATASOURCE_UID, PLUGIN_TYPE, skipFixtureTestsOnCloud } from './helpers/env';

// e2e_test.map_events has no `level` column, so a filter that reaches it fails the panel query (#2207).

const DASHBOARD_UID = 'e2e-adhoc-table-scope';
const EVENTS_SQL = 'SELECT level, count() AS c FROM e2e_test.events GROUP BY level';
const MAP_EVENTS_SQL = 'SELECT service, count() AS c FROM e2e_test.map_events GROUP BY service';

const datasource = { type: PLUGIN_TYPE, uid: DATASOURCE_UID };

const sqlPanel = (id: number, title: string, rawSql: string) => ({
  id,
  type: 'table',
  title,
  gridPos: { x: (id - 1) * 12, y: 0, w: 12, h: 8 },
  datasource,
  targets: [{ refId: 'A', datasource, editorType: 'sql', format: 1, queryType: 'table', rawSql }],
});

const dashboard = {
  uid: DASHBOARD_UID,
  title: 'E2E ad-hoc filter table scope',
  schemaVersion: 39,
  templating: {
    list: [
      { type: 'constant', name: 'clickhouse_adhoc_query', query: 'e2e_test', hide: 2 },
      {
        type: 'adhoc',
        name: 'filters',
        datasource,
        filters: [{ key: 'events.level', operator: '=', value: 'info' }],
      },
    ],
  },
  panels: [sqlPanel(1, 'events', EVENTS_SQL), sqlPanel(2, 'map_events', MAP_EVENTS_SQL)],
};

const waitForPanelQuery = (page: Page, table: string) =>
  page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.url().includes('/api/ds/query') &&
      request.method() === 'POST' &&
      (request.postData() ?? '').includes(`FROM ${table}`)
    );
  });

const sentSql = (response: Response): string => {
  const body = response.request().postDataJSON() as { queries: Array<{ rawSql: string }> };
  return body.queries[0].rawSql;
};

test.describe('Ad-hoc filters scoped to the table in the key', () => {
  test.beforeEach(async ({ request }) => {
    skipFixtureTestsOnCloud('seed.sql');
    const created = await request.post('/api/dashboards/db', { data: { dashboard, overwrite: true } });
    expect(created.ok()).toBe(true);
  });

  test.afterEach(async ({ request }) => {
    await request.delete(`/api/dashboards/uid/${DASHBOARD_UID}`);
  });

  test('a table-qualified key filters only the panel on that table', async ({ page, gotoDashboardPage }) => {
    const eventsQuery = waitForPanelQuery(page, 'e2e_test.events');
    const mapEventsQuery = waitForPanelQuery(page, 'e2e_test.map_events');
    await gotoDashboardPage({ uid: DASHBOARD_UID });
    const [events, mapEvents] = await Promise.all([eventsQuery, mapEventsQuery]);

    expect(sentSql(events)).toContain("additional_table_filters={'e2e_test.events' : ' level = \\'info\\' '}");
    expect(events.status()).toBe(200);

    expect(sentSql(mapEvents)).toBe(MAP_EVENTS_SQL);
    expect(mapEvents.status()).toBe(200);
  });
});
