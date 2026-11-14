import { useEffect, useState } from 'react';
import { Datasource } from 'data/CHDatasource';
import { MetricCatalogEntry, MetricHealth, MetricTables } from 'data/metrics';
import { MetricLabel, MetricQuery } from 'types/queryBuilder';

interface AsyncState<T> {
  value: T;
  loading: boolean;
  error?: string;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'Request failed';

/**
 * Runs `load` whenever `key` changes and keeps the latest result. A stale response, from a key
 * that has since changed, is dropped. An empty key skips loading and resets to `initial`.
 */
const useAsync = <T>(key: string, initial: T, load: () => Promise<T>): AsyncState<T> => {
  const [state, setState] = useState<AsyncState<T>>({ value: initial, loading: Boolean(key) });

  useEffect(() => {
    if (!key) {
      setState({ value: initial, loading: false });
      return;
    }

    let cancelled = false;
    setState((previous) => ({ value: previous.value, loading: true }));
    load().then(
      (value) => !cancelled && setState({ value, loading: false }),
      (error: unknown) => !cancelled && setState({ value: initial, loading: false, error: errorMessage(error) })
    );
    return () => {
      cancelled = true;
    };
    // `load` and `initial` are recreated each render; `key` captures what they depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
};

const emptyTables: MetricTables = {};
const emptyCatalog: MetricCatalogEntry[] = [];
const emptyLabels: MetricLabel[] = [];
const emptyQuantiles: number[] = [];

/** The metric tables that exist in the configured metrics database. */
export const useMetricTables = (datasource: Datasource) =>
  useAsync(`${datasource.uid}`, emptyTables, () => datasource.resolveMetricTables());

/**
 * The metrics with data in the dashboard time range. `rangeKey` reloads the list when the time
 * range changes, so the browser follows the dashboard.
 */
export const useMetricCatalog = (datasource: Datasource, rangeKey: string, reloadKey: number) =>
  useAsync(`${datasource.uid}:${rangeKey}:${reloadKey}`, emptyCatalog, () => datasource.fetchMetricCatalog());

/** The attribute keys of the picked metric. */
export const useMetricLabelKeys = (
  datasource: Datasource,
  database: string,
  table: string,
  metricName: string,
  jsonAttributes: boolean | undefined,
  rangeKey: string
) =>
  useAsync(
    metricName && table ? `${database}.${table}:${metricName}:${Boolean(jsonAttributes)}:${rangeKey}` : '',
    emptyLabels,
    () => datasource.fetchMetricLabelKeys(database, table, metricName, jsonAttributes)
  );

/** The quantiles a summary metric reports. */
export const useSummaryQuantiles = (
  datasource: Datasource,
  database: string,
  table: string,
  metricName: string,
  enabled: boolean
) =>
  useAsync(enabled && metricName && table ? `${database}.${table}:${metricName}` : '', emptyQuantiles, () =>
    datasource.fetchSummaryQuantiles(database, table, metricName)
  );

const noHealth: MetricHealth = { sharedSeries: 0, series: 0 };

/** Export interval and shared series of the picked metric over the last 15 minutes. */
export const useMetricHealth = (datasource: Datasource, database: string, table: string, metric?: MetricQuery) => {
  const features = { jsonAttributes: metric?.jsonAttributes };
  return useAsync(
    metric?.name && table ? `${database}.${table}:${metric.type}:${metric.name}:${JSON.stringify(features)}` : '',
    noHealth,
    () => datasource.fetchMetricHealth(database, table, metric!.name, metric!.type, features)
  );
};
