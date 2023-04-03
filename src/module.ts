import { DataSourcePlugin, DashboardLoadedEvent } from '@grafana/data';
import { Datasource } from './data/CHDatasource';
import { ConfigEditor } from './views/CHConfigEditor';
import { CHQueryEditor } from './views/CHQueryEditor';
import { CHQuery, CHConfig } from './types';
import { getAppEvents } from '@grafana/runtime';
import { trackClickhouseMonitorDashboardLoaded } from 'tracking';
import pluginJson from './plugin.json';

export const plugin = new DataSourcePlugin<Datasource, CHQuery, CHConfig>(Datasource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(CHQueryEditor);

  // Track dashboard loads to RudderStack
getAppEvents().subscribe<DashboardLoadedEvent<CHQuery>>(
  DashboardLoadedEvent,
  ({ payload: { dashboardId, orgId, grafanaVersion, queries } }) => {
    
    const clickhouseQueries = queries[pluginJson.id]?.filter((q) => !q.hide);
    if (!clickhouseQueries?.length) {
      return;
    }
    const counters = {
      sql_queries: 0,
      builder_queries: 0,
    };
    clickhouseQueries.forEach((query) => {
      switch (query.queryType) {
        case 'sql':
          counters.sql_queries++;
          break;
        case 'builder':
          counters.builder_queries++;
          break;
      }
      // query.rawSql ? counters.raw_queries++ : counters.query_builder_queries++;
    });

    trackClickhouseMonitorDashboardLoaded({
      clickhouse_plugin_version: pluginJson.info.version,
      grafana_version: grafanaVersion,
      dashboard_id: dashboardId,
      org_id: orgId,
      ...counters,
    });
  }
);
