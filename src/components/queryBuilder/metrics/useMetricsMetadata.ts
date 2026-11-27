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

interface Settled<T> {
  key: string;
  value: T;
  error?: string;
}

/**
 * Runs `load` whenever `key` changes and keeps the latest result. A stale response, from a key
 * that has since changed, is dropped. An empty key skips loading and resets to `initial`. While a
 * new key loads, the previous key's value stays, marked as loading.
 */
const useAsync = <T>(key: string, initial: T, load: () => Promise<T>): AsyncState<T> => {
  // The last settled result, tagged with the key it was loaded for, so loading and the reset are
  // derived during render rather than set from the Effect.
  const [settled, setSettled] = useState<Settled<T>>();
  if (!key && settled) {
    setSettled(undefined);
  }

  useEffect(() => {
    if (!key) {
      return;
    }

    let cancelled = false;
    load().then(
      (value) => !cancelled && setSettled({ key, value }),
      (error: unknown) => !cancelled && setSettled({ key, value: initial, error: errorMessage(error) })
    );
    return () => {
      cancelled = true;
    };
    // `load` and `initial` are recreated each render; `key` captures what they depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!key) {
    return { value: initial, loading: false };
  }
  if (settled?.key === key) {
    return { value: settled.value, loading: false, error: settled.error };
  }
  return { value: settled ? settled.value : initial, loading: true };
};

const emptyTables: MetricTables = {};
const emptyCatalog: MetricCatalogEntry[] = [];
const emptyLabels: MetricLabel[] = [];
const emptyQuantiles: number[] = [];

/** The metric tables that exist in the configured metrics database. */
export const useMetricTables = (datasource: Datasource, reloadKey: number) =>
  useAsync(`${datasource.uid}:${reloadKey}`, emptyTables, () => datasource.resolveMetricTables());

/**
 * The metrics with data in the last 6 hours of the dashboard time range, so a long range does not
 * read every metric table to fill the list. `rangeKey` reloads the list when the time range
 * changes, so the browser follows the dashboard.
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
