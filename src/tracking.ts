import { reportInteraction } from '@grafana/runtime';
import { CHQuery, EditorType } from 'types/sql';
import { QueryType, BuilderMode } from 'types/queryBuilder';

export const trackClickhouseDashboardLoaded = (props: ClickhouseDashboardLoadedProps) => {
  reportInteraction('grafana_ds_clickhouse_dashboard_loaded', props);
};

export type ClickhouseCounters = {
  sql_queries: number;
  sql_query_type_table: number;
  sql_query_type_logs: number;
  sql_query_type_timeseries: number;
  sql_query_type_traces: number;

  builder_queries: number;
  builder_query_type_table: number;
  builder_query_type_table_simple: number;
  builder_query_type_table_aggregate: number;
  builder_query_type_logs: number;
  builder_query_type_timeseries: number;
  builder_query_type_timeseries_simple: number;
  builder_query_type_timeseries_aggregate: number;
  builder_query_type_traces: number;
  builder_query_type_traces_search: number;
  builder_query_type_traces_id: number;
  builder_minimized_queries: number;
  builder_otel_queries: number;
};

export interface ClickhouseDashboardLoadedProps extends ClickhouseCounters {
  clickhouse_plugin_version?: string;
  grafana_version?: string;
  dashboard_id: string;
  org_id?: number;
  [key: string]: any;
}

export const analyzeQueries = (queries: CHQuery[]): ClickhouseCounters => {
  const c: ClickhouseCounters = {
    sql_queries: 0,
    sql_query_type_table: 0,
    sql_query_type_logs: 0,
    sql_query_type_timeseries: 0,
    sql_query_type_traces: 0,

    builder_queries: 0,
    builder_query_type_table: 0,
    builder_query_type_table_simple: 0,
    builder_query_type_table_aggregate: 0,
    builder_query_type_logs: 0,
    builder_query_type_timeseries: 0,
    builder_query_type_timeseries_simple: 0,
    builder_query_type_timeseries_aggregate: 0,
    builder_query_type_traces: 0,
    builder_query_type_traces_search: 0,
    builder_query_type_traces_id: 0,
    builder_minimized_queries: 0,
    builder_otel_queries: 0
  };

  queries.forEach(q => {
    if (q.editorType === EditorType.SQL) {
      c.sql_queries++;

      if (q.queryType === QueryType.Table) {
        c.sql_query_type_table++;
      } else if (q.queryType === QueryType.Logs) {
        c.sql_query_type_logs++;
      } else if (q.queryType === QueryType.TimeSeries) {
        c.sql_query_type_timeseries++;
      } else if (q.queryType === QueryType.Traces) {
        c.sql_query_type_traces++;
      }
    } else if (q.editorType === EditorType.Builder) {
      c.builder_queries++;

      if (!q.builderOptions) {
        return;
      }

      if (q.builderOptions.queryType === QueryType.Table) {
        c.builder_query_type_table++;

        if (q.builderOptions.mode === BuilderMode.Aggregate) {
          c.builder_query_type_table_aggregate++;
        } else {
          c.builder_query_type_table_simple++;
        }
      } else if (q.builderOptions.queryType === QueryType.Logs) {
        c.builder_query_type_logs++;
      } else if (q.builderOptions.queryType === QueryType.TimeSeries) {
        c.builder_query_type_timeseries++;

        if (q.builderOptions.mode === BuilderMode.Trend) {
          c.builder_query_type_timeseries_aggregate++;
        } else {
          c.builder_query_type_timeseries_simple++;
        }
      } else if (q.builderOptions.queryType === QueryType.Traces) {
        c.builder_query_type_traces++;

        if (q.builderOptions.meta?.isTraceIdMode) {
          c.builder_query_type_traces_id++;
        } else {
          c.builder_query_type_traces_search++;
        }
      }

      if (q.builderOptions.meta?.minimized) {
        c.builder_minimized_queries++;
      }

      if (q.builderOptions.meta?.otelEnabled) {
        c.builder_otel_queries++;
      }
    }
  });

  return c;
};
