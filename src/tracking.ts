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
  /** number of queries using the "Table" format  */
  builder_queries: number;
  // /** number of queries using the "Aggregate" format  */
  // aggregate_queries: number;
  // /** number of queries using the "Time Series" format  */
  // time_series_queries: number;
  // /** number of queries using the query builder  */
  // query_builder_queries: number;
};
