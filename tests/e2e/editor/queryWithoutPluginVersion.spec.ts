// E2E coverage for v4 queries without a pluginVersion, such as provisioned and hand-authored
// queries or programmatic Explore URLs (#2119). The query editor runs migrateCHQuery on every
// render, and the SQL editor saves format from the query type it shows. Unit tests in
// src/data/migration.test.ts cover the migration itself. Only E2E shows which editor Grafana opens
// such a query in, and the format that the query runs in after its first edit.

import { expect, test } from '@grafana/plugin-e2e';
import { BuilderMode, ColumnHint, QueryType } from '../../../src/types/queryBuilder';
import { Components as Selectors } from '../../../src/selectors';
import { builderFieldRow, queryTypeRadioLabel } from '../helpers/builder';
import { isCloudRun, skipFixtureTestsOnCloud } from '../helpers/env';
import { exploreUrl } from '../helpers/explore';
import { enterSql, runQuery } from '../helpers/sqlEditor';

// The Grafana format for time series (mapQueryTypeToGrafanaFormat). Table is 1.
const TIME_SERIES_FORMAT = 0;

// A Logs query on e2e_test.events from tests/fixtures/seed.sql, with every column role set.
const LOGS_BUILDER_OPTIONS = {
  database: 'e2e_test',
  table: 'events',
  queryType: QueryType.Logs,
  mode: BuilderMode.List,
  columns: [
    { name: 'timestamp', type: 'DateTime', hint: ColumnHint.Time },
    { name: 'level', type: 'LowCardinality(String)', hint: ColumnHint.LogLevel },
    { name: 'message', type: 'String', hint: ColumnHint.LogMessage },
  ],
  filters: [],
  orderBy: [],
  limit: 25,
};

test.describe('Queries without pluginVersion', () => {
  test('a SQL query keeps its query type and runs in that format after the first edit', async ({
    page,
    explorePage,
  }) => {
    test.skip(isCloudRun, 'Waits for /api/ds/query, which Cloud stacks replace with the query service API.');

    await page.goto(exploreUrl({ queryType: QueryType.TimeSeries, rawSql: 'SELECT now() AS time, 1 AS value' }));
    const timeSeries = page
      .locator('.query-editor-row')
      .getByRole('radio', { name: queryTypeRadioLabel(QueryType.TimeSeries), exact: true });
    await expect(timeSeries).toBeChecked();

    // The Run Query click blurs the SQL editor, which saves format from the query type it shows.
    const editedSql = 'SELECT now() AS time, 2 AS value';
    const responsePromise = explorePage.waitForQueryDataResponse((r) =>
      String(r.request().postDataJSON()?.queries?.[0]?.rawSql ?? '').includes(editedSql)
    );
    await enterSql(page, editedSql);
    await runQuery(page);
    const response = await responsePromise;

    expect(response.ok()).toBe(true);
    const sent = response.request().postDataJSON()?.queries?.[0];
    expect(sent?.queryType).toBe(QueryType.TimeSeries);
    expect(sent?.format).toBe(TIME_SERIES_FORMAT);
    await expect(timeSeries).toBeChecked();
  });

  test('a builder query opens in the Query Builder with its options', async ({ page }) => {
    skipFixtureTestsOnCloud('seed.sql');

    await page.goto(exploreUrl({ builderOptions: LOGS_BUILDER_OPTIONS }));

    // Scoped to the editor row, because the Logs panel in Explore has a Logs radio too.
    const editorRow = page.locator('.query-editor-row');
    await expect(editorRow.getByRole('radio', { name: 'Query Builder' })).toBeChecked();
    await expect(
      editorRow.getByRole('radio', { name: queryTypeRadioLabel(QueryType.Logs), exact: true })
    ).toBeChecked();
    await expect(builderFieldRow(page, 'Database')).toContainText('e2e_test');
    await expect(builderFieldRow(page, 'Table')).toContainText('events');
    await expect(builderFieldRow(page, 'Time')).toContainText('timestamp');
    await expect(builderFieldRow(page, 'Log Level')).toContainText('level');
    await expect(builderFieldRow(page, 'Message')).toContainText('message');
    await expect(page.getByTestId(Selectors.QueryBuilder.LimitEditor.input)).toHaveValue('25');
  });
});
