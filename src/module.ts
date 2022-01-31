import { DataSourcePlugin } from '@grafana/data';
import { Datasource } from './data/CHDatasource';
import { ConfigEditor } from './views/CHConfigEditor';
import { CHQueryEditor } from './views/CHQueryEditor';
import { CHQuery, CHConfig } from './types';

export const plugin = new DataSourcePlugin<Datasource, CHQuery, CHConfig>(Datasource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(CHQueryEditor);
