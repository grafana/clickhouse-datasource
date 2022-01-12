import {
  DataFrame,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  ScopedVars,
  vectorator,
} from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv } from '@grafana/runtime';
import { CHConfig, CHQuery } from '../types';
import { isString } from 'lodash';

export class Datasource extends DataSourceWithBackend<CHQuery, CHConfig> {
  // This enables default annotation support for 7.2+
  annotations = {};
  settings: DataSourceInstanceSettings<CHConfig>;

  constructor(instanceSettings: DataSourceInstanceSettings<CHConfig>) {
    super(instanceSettings);
    this.settings = instanceSettings;
  }

  async metricFindQuery(query: CHQuery | string) {
    const chQuery = isString(query) ? { rawSql: query } : query;
    if (!chQuery.rawSql) {
      return [];
    }
    const frame = await this.runQuery(chQuery);
    if (frame.fields?.length === 0) {
      return [];
    }
    if (frame?.fields?.length === 1) {
      return vectorator(frame?.fields[0]?.values).map((text) => ({ text, value: text }));
    }
    // convention - assume the first field is an id field
    const ids = frame?.fields[0]?.values;
    return vectorator(frame?.fields[1]?.values).map((text, i) => ({ text, value: ids.get(i) }));
  }

  applyTemplateVariables(query: CHQuery, scoped: ScopedVars): CHQuery {
    return {
      ...query,
      rawSql: this.replace(query.rawSql || '') || '',
    };
  }

  replace(value?: string, scopedVars?: ScopedVars) {
    if (value !== undefined) {
      return getTemplateSrv().replace(value, scopedVars, this.format);
    }
    return value;
  }

  format(value: any) {
    if (Array.isArray(value)) {
      return `'${value.join("','")}'`;
    }
    return value;
  }

  getDefaultDatabase() {
    return this.settings.jsonData.defaultDatabase;
  }

  async fetchDatabases(): Promise<string[]> {
    return this.fetchData('SHOW DATABASES');
  }

  async fetchTables(db?: string): Promise<string[]> {
    const rawSql = db ? `SHOW TABLES FROM ${db}` : 'SHOW TABLES';
    return this.fetchData(rawSql);
  }

  async fetchFields(table: string): Promise<string[]> {
    return this.fetchData(`DESC TABLE ${table}`);
  }

  async fetchData(rawSql: string) {
    const frame = await this.runQuery({ rawSql });
    return this.values(frame);
  }

  runQuery(request: Partial<CHQuery>): Promise<DataFrame> {
    return new Promise((resolve) => {
      const req = {
        targets: [{ ...request, refId: String(Math.random()) }],
      } as DataQueryRequest<CHQuery>;
      this.query(req).subscribe((res: DataQueryResponse) => {
        resolve(res.data[0] || { fields: [] });
      });
    });
  }

  values(frame: DataFrame) {
    if (frame.fields?.length === 0) {
      return [];
    }
    return vectorator(frame?.fields[0]?.values).map((text) => text);
  }
}
