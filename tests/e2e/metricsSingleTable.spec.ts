import { expect, test } from '@grafana/plugin-e2e';
import { Page } from '@playwright/test';
import { Components as Selectors } from '../../src/selectors';
import { MetricFunction, MetricSeriesAggregation, MetricType, QueryType } from '../../src/types/queryBuilder';
import { createTestDataSources, deleteTestDataSources } from './helpers/datasources';
import { FIXTURE_FROM_ISO, FIXTURE_TO_ISO, isCloudRun, skipFixtureTestsOnCloud } from './helpers/env';
import { exploreUrl } from './helpers/explore';
import { Frame, frames, QueryDataBody } from './helpers/queryResponse';

// The single-table metrics data source reads one table per point type and drives its editor with
// metadata lookups: the tables that exist, the metrics that have data in the dashboard range, and
// the labels of a picked metric. Unit tests cover the SQL of those lookups; this spec runs them
// against ClickHouse through a real data source, picks metrics of three different value layouts,
// and checks the query that runs and the values it returns.
//
// Data source: created here on the e2e connection, pointed at e2e_test with the exporter's default
// metric table names (tests/fixtures/otel_metrics.sql). Connection settings are inherited from the
// base e2e data source; a password cannot be inherited, hence the Cloud skip.

const METRICS_DATASOURCE = {
  uid: 'clickhouse-e2e-single-metrics',
  name: 'ClickHouse Single Metrics (e2e)',
};

const METRICS_JSON_DATA = {
  database: 'e2e_test',
  configMode: 'single-table',
  signalType: 'metrics',
  metrics: { defaultDatabase: 'e2e_test' },
};

// Any 4.x version keeps the URL queries out of the v3 migration, so they open in the Query Builder.
const BUILDER_PLUGIN_VERSION = '4.0.0';

// A new metrics query: no metric picked, so it generates no SQL until the editor picks one.
// Mirrors buildCompactMetricsDefaults.
const EMPTY_METRICS_QUERY = {
  database: 'e2e_test',
  table: '',
  queryType: QueryType.TimeSeries,
  metric: {
    name: '',
    type: MetricType.Gauge,
    fn: MetricFunction.Avg,
    aggregation: MetricSeriesAggregation.Avg,
    groupBy: [],
  },
  filters: [],
};

// Every metric in the fixture, one per value layout.
const GAUGE_METRIC = 'system.cpu.utilization';
const SUM_METRIC = 'container.cpu.time';
const HISTOGRAM_METRIC = 'http.server.duration';
const SUMMARY_METRIC = 'rpc.server.duration';

// One table per metric, so the table a query reads proves the metric's type was resolved.
const METRIC_TABLES = {
  [GAUGE_METRIC]: 'otel_metrics_gauge',
  [SUM_METRIC]: 'otel_metrics_sum',
  [HISTOGRAM_METRIC]: 'otel_metrics_histogram',
  [SUMMARY_METRIC]: 'otel_metrics_summary',
};

interface SentQuery {
  rawSql?: string;
}

/**
 * Resolves with the query and frames of the next completed /api/ds/query response for a metrics
 * query against `table`. The editor's metadata lookups run on the same data source, so the check
 * requires the picked metric in the query's builderOptions: those lookups send plain SQL under
 * another refId.
 */
async function waitForMetricsQuery(page: Page, table: string) {
  let query: SentQuery = {};
  let body: QueryDataBody | null = null;
  await page
    .waitForResponse(
      async (response) => {
        const request = response.request();
        if (!response.url().includes('/api/ds/query') || request.method() !== 'POST' || !response.ok()) {
          return false;
        }
        const sent = request.postDataJSON()?.queries?.[0];
        const metric = sent?.builderOptions?.metric;
        if (
          sent?.refId !== 'A' ||
          sent?.datasource?.uid !== METRICS_DATASOURCE.uid ||
          Boolean(metric?.name) === false ||
          !String(sent?.rawSql ?? '').includes(`"e2e_test"."${table}"`)
        ) {
          return false;
        }
        const received = (await response.json().catch(() => null)) as QueryDataBody | null;
        if (!Array.isArray(received?.results?.A?.frames)) {
          return false;
        }
        query = sent;
        body = received;
        return true;
      },
      { timeout: 15_000 }
    )
    .catch(() => {
      throw new Error(`No completed metrics query against e2e_test.${table}`);
    });
  return { query, body };
}

/** Opens Explore on a metrics data source with an empty metrics query. */
async function openMetricsEditor(page: Page) {
  await page.goto(
    exploreUrl({
      datasourceUid: METRICS_DATASOURCE.uid,
      from: FIXTURE_FROM_ISO,
      to: FIXTURE_TO_ISO,
      pluginVersion: BUILDER_PLUGIN_VERSION,
      builderOptions: EMPTY_METRICS_QUERY,
    })
  );
  await expect(page.getByTestId(Selectors.QueryBuilder.MetricsEditor.root)).toBeVisible();
  // The catalog lookup replaces the loading placeholder once it resolves, so waiting for the
  // count also waits for the tables and the metric list.
  await expect(page.getByPlaceholder(new RegExp(`^Search ${Object.keys(METRIC_TABLES).length} metrics$`))).toBeVisible({
    timeout: 15_000,
  });
}

const optionFor = (name: string) => new RegExp(`^${name.replace(/\./g, '\\.')}`);

/** Picks a metric in the editor's metric picker and waits for the editor to switch to it. */
async function pickMetric(page: Page, name: string) {
  const picker = page.getByTestId(Selectors.QueryBuilder.MetricsEditor.metricPicker);
  await picker.getByRole('combobox').click();
  await page
    .getByRole('option', { name: optionFor(name) })
    .first()
    .click();
  // The function picker only renders once a metric is picked.
  await expect(page.getByTestId(Selectors.QueryBuilder.MetricsEditor.functionPicker)).toBeVisible();
  await page.keyboard.press('Escape');
}

/** The values of the query's first value column, without the empty buckets. */
function values(frame: Frame | undefined): number[] {
  const series = frame?.data?.values?.[1];
  return Array.isArray(series) ? series.filter((value): value is number => typeof value === 'number') : [];
}

test.describe('Single-table metrics in Explore', () => {
  // Serial keeps every test in one worker so the beforeAll/afterAll datasource lifecycle cannot
  // race a test running in a parallel worker.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    if (isCloudRun) {
      return;
    }
    await deleteTestDataSources([METRICS_DATASOURCE]);
    await createTestDataSources([{ ...METRICS_DATASOURCE, jsonData: METRICS_JSON_DATA }]);
  });

  test.afterAll(async () => {
    if (isCloudRun) {
      return;
    }
    await deleteTestDataSources([METRICS_DATASOURCE]);
  });

  test.beforeEach(() => {
    skipFixtureTestsOnCloud('otel_metrics.sql');
  });

  test('lists the metrics that have data in the range', async ({ page }) => {
    await openMetricsEditor(page);

    // resolveMetricTables finds all five configured tables, including the empty exponential
    // histogram one, so the editor does not report missing tables.
    await expect(page.getByText('No OTel metric tables found')).toHaveCount(0);
    await expect(page.getByText('Could not list the metrics')).toHaveCount(0);

    await page.getByTestId(Selectors.QueryBuilder.MetricsEditor.metricPicker).getByRole('combobox').click();
    for (const name of Object.keys(METRIC_TABLES)) {
      await expect(page.getByRole('option', { name: optionFor(name) }).first()).toBeVisible();
    }
  });

  test('a gauge query averages the series of the metric per bucket', async ({ page }) => {
    await openMetricsEditor(page);

    const query = waitForMetricsQuery(page, METRIC_TABLES[GAUGE_METRIC]);
    await pickMetric(page, GAUGE_METRIC);
    const { body } = await query;

    const frame = frames(body)[0];
    expect(frame?.schema?.fields?.[1]?.name).toBe(GAUGE_METRIC);
    // The fixture's two series hold 0.5 and 0.25 at every timestamp, so the cross-series average
    // of the default function (and the default aggregation) is 0.375 in every bucket.
    const returned = values(frame);
    expect(returned.length).toBeGreaterThan(0);
    for (const value of returned) {
      expect(value).toBeCloseTo(0.375);
    }
  });

  test('a monotonic sum query reads its own table and returns a rate', async ({ page }) => {
    await openMetricsEditor(page);

    const query = waitForMetricsQuery(page, METRIC_TABLES[SUM_METRIC]);
    await pickMetric(page, SUM_METRIC);
    const { query: sent, body } = await query;

    // A monotonic sum is queried as a counter, which the SQL marks with its start time handling.
    expect(sent.rawSql).toContain(`MetricName = '${SUM_METRIC}'`);
    expect(sent.rawSql).toContain('StartTimeUnix');

    const frame = frames(body)[0];
    expect(frame?.schema?.fields?.[1]?.name).toBe(SUM_METRIC);
    // 60s of CPU time per minute is a rate of 1 per second at every point, so a rate that reads
    // the wrong points, or that divides by the wrong number of seconds, shows up here.
    const returned = values(frame);
    expect(returned.length).toBeGreaterThan(0);
    for (const value of returned) {
      expect(value).toBeCloseTo(1);
    }
  });

  test('a histogram query returns its default quantile', async ({ page }) => {
    await openMetricsEditor(page);

    const query = waitForMetricsQuery(page, METRIC_TABLES[HISTOGRAM_METRIC]);
    await pickMetric(page, HISTOGRAM_METRIC);
    const { query: sent, body } = await query;

    expect(sent.rawSql).toContain(`MetricName = '${HISTOGRAM_METRIC}'`);
    // Quantiles of a histogram merge the buckets of every series, so neither a group by nor an
    // aggregate is offered, and the value column is named after the quantile.
    expect(sent.rawSql).toContain('arrayPopBack');

    const frame = frames(body)[0];
    expect(frame?.schema?.fields?.[1]?.name).toBe(`${HISTOGRAM_METRIC} p95`);
    // The fixture adds 30, 15, 4 and 1 observations to the buckets bounded by 100, 250 and 500ms,
    // so p95 needs 47.5 of the 50 and interpolates inside 250-500ms: 250 + 250 * (47.5 - 45) / 4.
    const returned = values(frame);
    expect(returned.length).toBeGreaterThan(0);
    for (const value of returned) {
      expect(value).toBeCloseTo(406.25);
    }
  });

  test('a summary query returns the highest quantile the metric reports', async ({ page }) => {
    await openMetricsEditor(page);

    const query = waitForMetricsQuery(page, METRIC_TABLES[SUMMARY_METRIC]);
    await pickMetric(page, SUMMARY_METRIC);
    const { body } = await query;

    const frame = frames(body)[0];
    // The default quantile (p95) is not one the summary reports, so the editor falls back to the
    // highest reported quantile. The fixture reports p50, p90 and p99.
    expect(frame?.schema?.fields?.[1]?.name).toBe(`${SUMMARY_METRIC} p99`);
    // The fixture's p99 is 300ms at the first point and grows by 10ms per minute.
    const returned = values(frame);
    expect(returned.length).toBeGreaterThan(0);
    for (const value of returned) {
      expect(value).toBeGreaterThanOrEqual(300);
      expect(value).toBeLessThanOrEqual(390);
    }
  });
});
