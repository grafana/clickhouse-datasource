import { DataSourcePlugin, DashboardLoadedEvent, FeatureToggles } from '@grafana/data';
import { Datasource } from './data/CHDatasource';
import { ConfigEditor as ConfigEditorV1 } from './views/CHConfigEditor';
import { ConfigEditor as ConfigEditorV2 } from './views/config-v2/CHConfigEditor';
import { CHQueryEditor } from './views/CHQueryEditor';
import { CHConfig } from 'types/config';
import { CHQuery } from 'types/sql';
import { config, getAppEvents } from '@grafana/runtime';
import { analyzeQueries, trackClickhouseDashboardLoaded } from 'tracking';
import pluginJson from './plugin.json';
import clickhouseVersion from '../package.json';

// ConfigEditorV2 is the new design for the ClickHouse configuration page
const configEditor = config.featureToggles['newClickhouseConfigPageDesign' as keyof FeatureToggles]
  ? ConfigEditorV2
  : ConfigEditorV1;

export const plugin = new DataSourcePlugin<Datasource, CHQuery, CHConfig>(Datasource)
  .setConfigEditor(configEditor)
  .setQueryEditor(CHQueryEditor);

// Track dashboard loads to RudderStack
getAppEvents().subscribe<DashboardLoadedEvent<CHQuery>>(
  DashboardLoadedEvent,
  ({ payload: { dashboardId, orgId, grafanaVersion, queries } }) => {
    const clickhouseQueries = queries[pluginJson.id]?.filter((q) => !q.hide);
    if (!clickhouseQueries?.length) {
      return;
    }

    trackClickhouseDashboardLoaded({
      clickhouse_plugin_version: clickhouseVersion.version,
      grafana_version: grafanaVersion,
      dashboard_id: dashboardId,
      org_id: orgId,
      ...analyzeQueries(clickhouseQueries),
    });
  }
);
