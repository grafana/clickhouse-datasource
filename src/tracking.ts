import { reportInteraction } from '@grafana/runtime';
import { CHQuery, EditorType, QueryType } from 'types/sql';
import { BuilderMode } from 'types/queryBuilder';

// TODO: v4, determine new/updated fields to track

export const trackClickhouseDashboardLoaded = (props: ClickhouseDashboardLoadedProps) => {
  reportInteraction('grafana_ds_clickhouse_dashboard_loaded', props);
};

export type ClickhouseCounters = {
  sql_queries: number;
  sql_query_format_table: number;
  sql_query_format_logs: number;
  sql_query_format_time_series: number;
  sql_query_format_trace: number;
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
    sql_query_format_table: 0,
    sql_query_format_logs: 0,
    sql_query_format_time_series: 0,
    sql_query_format_trace: 0,
    builder_queries: 0,
    builder_table_queries: 0,
    builder_aggregate_queries: 0,
    builder_time_series_queries: 0,
  };

  queries.forEach(query => {
    switch (query.editorType) {
      case EditorType.SQL:
        counters.sql_queries++;
        if (query.queryType === QueryType.Table) {
          counters.sql_query_format_table++;
        } else if (query.queryType === QueryType.Logs) {
          counters.sql_query_format_logs++;
        } else if (query.queryType === QueryType.TimeSeries) {
          counters.sql_query_format_time_series++;
        } else if (query.queryType === QueryType.Traces) {
          counters.sql_query_format_trace++;
        }
        break;
      case EditorType.Builder:
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
