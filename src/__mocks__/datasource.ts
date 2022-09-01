import { PluginType } from '@grafana/data';
import { CHQuery, Protocol, QueryType } from '../types';
import { Datasource } from '../data/CHDatasource';

export const mockDatasource = new Datasource({
  id: 1,
  uid: 'sap_hana_ds',
  type: 'grafana-clickhouse-datasource',
  name: 'ClickHouse',
  jsonData: {
    server: 'foo.com',
    port: 443,
    username: 'user',
    defaultDatabase: 'foo',
    protocol: Protocol.NATIVE,
  },
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
export const mockQuery: CHQuery = { rawSql: 'select * from foo', refId: '', format: 1, queryType: QueryType.SQL };
