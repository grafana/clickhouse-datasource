import { reportInteraction } from '@grafana/runtime';

export const trackClickhouseMonitorDashboardLoaded = (props: ClickhouseMonitorDashboardLoadedProps) => {
  console.log('props', props)
  reportInteraction('grafana_ds_clickhouse_dashboard_loaded', props);
};

export type ClickhouseMonitorDashboardLoadedProps = {
  clickhouse_plugin_version?: string;
  grafana_version?: string;
  dashboard_id: string;
  org_id?: number;
  /** number of queries using the SQL query editor  */
  sql_queries: number;
  /** number of queries using the Query Builder  */
  builder_queries: number;
  /** number of queries using the "Table" format in the Query Builder  */
  builder_table_queries: number;
  /** number of queries using the "Aggregate" format in the Query Builder */
  builder_aggregate_queries: number;
  /** number of queries using the "Time Series" format in the Query Builder */
  builder_time_series_queries: number;
};
