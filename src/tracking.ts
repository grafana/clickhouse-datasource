import { reportInteraction } from '@grafana/runtime';
import { BuilderMode, CHQuery, QueryType } from 'types';

export const trackClickhouseDashboardLoaded = (props: ClickhouseDashboardLoadedProps) => {
  reportInteraction('grafana_ds_clickhouse_dashboard_loaded', props);
};

export type ClickhouseCounters = {
  sql_queries: number;
  builder_queries: number;
  builder_table_queries: number;
  builder_aggregate_queries: number;
  builder_time_series_queries: number;
};

export interface ClickhouseDashboardLoadedProps extends ClickhouseCounters {
  clickhouse_plugin_version?: string;
  grafana_version?: string;
  dashboard_id: string;
  org_id?: number;
  [key: string]: any;
}

export const analyzeQueries = (queries: CHQuery[]): ClickhouseCounters => {
  const counters = {
    sql_queries: 0,
    builder_queries: 0,
    builder_table_queries: 0,
    builder_aggregate_queries: 0,
    builder_time_series_queries: 0,
  };

  queries.forEach((query) => {
    switch (query.queryType) {
      case QueryType.SQL:
        counters.sql_queries++;
        break;
      case QueryType.Builder:
        counters.builder_queries++;
        if (query.builderOptions.mode === BuilderMode.Aggregate) {
          counters.builder_aggregate_queries++;
        } else if (query.builderOptions.mode === BuilderMode.List) {
          counters.builder_table_queries++;
        } else if (query.builderOptions.mode === BuilderMode.Trend) {
          counters.builder_time_series_queries++;
        }
        break;
    }
  });

  return counters;
};
