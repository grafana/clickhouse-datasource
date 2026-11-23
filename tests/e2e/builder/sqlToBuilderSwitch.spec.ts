// E2E coverage for switching a query from the SQL Editor to the Query Builder.
// Unit tests in src/components/queryBuilder/utils.test.ts cover how the SQL
// parses into builder options; only E2E confirms Explore completes the switch
// and the builder renders the converted filter.

import { expect, test } from '@grafana/plugin-e2e';
import { builderFieldRow } from '../helpers/builder';
import { skipFixtureTestsOnCloud } from '../helpers/env';
import { exploreUrl } from '../helpers/explore';
import { enterSql } from '../helpers/sqlEditor';
import { QueryType } from '../../../src/types/queryBuilder';

// Every ClickHouse server has system.databases, so the spec needs no fixture data.
const SINGLE_VALUE_IN_SQL = "SELECT name FROM system.databases WHERE name IN ('default')";

// The trace_spans fixture has the OTel column names, which mix upper and lower case.
const OTEL_CASED_SQL =
  'SELECT TraceId, ServiceName FROM e2e_test.trace_spans WHERE SpanName IS NOT NULL ORDER BY Timestamp DESC LIMIT 10';

// A time series query as the builder makes it: bucketed by the time column, counted, and grouped.
const TIME_SERIES_BUILDER = {
  database: 'e2e_test',
  table: 'trace_spans',
  queryType: 'timeseries',
  mode: 'trend',
  columns: [{ name: 'Timestamp', type: 'DateTime64(9)', hint: 'time' }],
  aggregates: [{ aggregateType: 'count', column: '*' }],
  groupBy: ['ServiceName'],
  filters: [],
  orderBy: [{ name: 'time', dir: 'ASC' }],
  meta: {},
};

test.describe('Switching from the SQL Editor to the Query Builder', () => {
  test('keeps a single-value IN filter', async ({ page }) => {
    await page.goto(exploreUrl());
    await enterSql(page, SINGLE_VALUE_IN_SQL);

    // The SQL converts to builder options, so the switch asks for confirmation. With a single-value
    // IN list, Continue used to throw before closing this dialog, leaving the SQL Editor selected (#2226).
    await page.getByRole('radio', { name: 'Query Builder' }).click();
    // Grafana 12.3 and earlier give this modal no accessible name, so match the dialog by its text.
    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Are you sure?' });
    await confirmDialog.getByRole('button', { name: 'Continue' }).click();
    await expect(confirmDialog).toBeHidden();
    await expect(page.getByRole('radio', { name: 'Query Builder' })).toBeChecked();

    // The first filter row holds the column and operator comboboxes, then the value picker, which
    // shows each value of the IN list as a pill.
    const filterRow = builderFieldRow(page, 'Filters');
    await expect(filterRow.getByRole('combobox').nth(0)).toHaveValue('name');
    await expect(filterRow.getByRole('combobox').nth(1)).toHaveValue('IN');
    await expect(filterRow.getByTestId('query-builder-filters-multi-string-value-container')).toHaveText('default');
    await expect(builderFieldRow(page, 'SQL Preview')).toContainText("name IN ('default')");
  });

  test('keeps the letter case of column names and an IS NOT NULL filter', async ({ page }) => {
    skipFixtureTestsOnCloud('trace_spans.sql');
    await page.goto(exploreUrl());
    await enterSql(page, OTEL_CASED_SQL);

    await page.getByRole('radio', { name: 'Query Builder' }).click();
    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Are you sure?' });
    await confirmDialog.getByRole('button', { name: 'Continue' }).click();
    await expect(confirmDialog).toBeHidden();

    // The IS NOT NULL filter used to arrive without a type, and the builder failed to load.
    await expect(page.getByText('ClickHouse query editor failed to load')).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Query Builder' })).toBeChecked();
    const filterRow = builderFieldRow(page, 'Filters');
    await expect(filterRow.getByRole('combobox').nth(0)).toHaveValue('SpanName');
    await expect(filterRow.getByRole('combobox').nth(1)).toHaveValue('IS NOT NULL');
    // ClickHouse names are case-sensitive: `timestamp` would not resolve against `Timestamp`.
    const preview = builderFieldRow(page, 'SQL Preview');
    await expect(preview).toContainText('SELECT TraceId, ServiceName FROM');
    await expect(preview).toContainText('SpanName IS NOT NULL');
    await expect(preview).toContainText('ORDER BY Timestamp DESC');
  });

  test('brings a time series query back with its bucketing and grouping', async ({ page }) => {
    skipFixtureTestsOnCloud('trace_spans.sql');
    await page.goto(
      exploreUrl({ queryType: QueryType.TimeSeries, pluginVersion: '4.23.0', builderOptions: TIME_SERIES_BUILDER })
    );
    const preview = builderFieldRow(page, 'SQL Preview');
    await expect(preview).toContainText('$__timeInterval_ms(Timestamp) as "time"');
    const before = (await preview.textContent()) ?? '';

    await page.getByRole('radio', { name: 'SQL Editor' }).click();
    await page.getByRole('radio', { name: 'Query Builder' }).click();
    const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Are you sure?' });
    await confirmDialog.getByRole('button', { name: 'Continue' }).click();
    await expect(confirmDialog).toBeHidden();

    // The query used to come back without its buckets (`Timestamp as "time"`), grouped by `time` twice.
    await expect(preview).toHaveText(before);
  });
});
