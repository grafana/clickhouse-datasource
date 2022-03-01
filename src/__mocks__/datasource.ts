import { PluginType } from '@grafana/data';
import { CHQuery, QueryType } from '../types';
import { Datasource } from '../data/CHDatasource';

export const mockDatasource = new Datasource({
  access: 'direct',
  id: 1,
  uid: 'sap_hana_ds',
  type: 'grafana-clickhouse-datasource',
  name: 'ClickHouse',
  jsonData: {
    server: 'foo.com',
    port: 443,
    username: 'user',
    defaultDatabase: 'foo',
  },
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
export const mockQuery: CHQuery = { rawSql: 'select * from foo', refId: '', format: 1, queryType: QueryType.SQL };
