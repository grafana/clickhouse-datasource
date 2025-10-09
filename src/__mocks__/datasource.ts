import { PluginType } from '@grafana/data';
import { Protocol } from 'types/config';
import { CHQuery, EditorType } from 'types/sql';
import { QueryType } from 'types/queryBuilder';
import { Datasource } from '../data/CHDatasource';
import { pluginVersion } from 'utils/version';

export const newMockDatasource = (): Datasource => {
  const mockDatasource = new Datasource({
    id: 1,
    uid: 'clickhouse_ds',
    type: 'grafana-clickhouse-datasource',
    name: 'ClickHouse',
    jsonData: {
      version: pluginVersion,
      host: 'foo.com',
      port: 443,
      path: '',
      username: 'user',
      defaultDatabase: 'foo',
      defaultTable: 'bar',
      aliasTables: [],
      protocol: Protocol.Native,
    },
    readOnly: true,
    access: 'direct',
    meta: {
      id: 'grafana-clickhouse-datasource',
      name: 'ClickHouse',
      type: PluginType.datasource,
      module: '',
      baseUrl: '',
      info: {
        description: '',
        screenshots: [],
        updated: '',
        version: '',
        logos: {
          small: '',
          large: '',
        },
        author: {
          name: '',
        },
        links: [],
      },
    },
  });

  mockDatasource.adHocFiltersStatus = 1; // most tests should skip checking the CH version. We will set ad hoc filters to enabled to avoid running the CH version check
  return mockDatasource;
};

export const mockDatasource = newMockDatasource();

export const mockQuery: CHQuery = {
  pluginVersion: '',
  rawSql: 'select * from foo',
  refId: '',
  editorType: EditorType.SQL,
  queryType: QueryType.Table,
};
