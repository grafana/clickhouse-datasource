import { DataSourcePlugin } from '@grafana/data';
import { Datasource } from './data/CHDatasource';
import { ConfigEditor } from './views/CHConfigEditor';
import { QueryEditor } from './views/CHQueryEditor';
import { CHQuery, CHConfig } from './types';

export const plugin = new DataSourcePlugin<Datasource, CHQuery, CHConfig>(Datasource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor);
