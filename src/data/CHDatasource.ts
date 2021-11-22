import { DataFrame, DataQueryRequest, DataQueryResponse, DataSourceInstanceSettings, vectorator } from '@grafana/data';
import { DataSourceWithBackend } from '@grafana/runtime';
import { CHConfig, CHQuery } from '../types';

export class Datasource extends DataSourceWithBackend<CHQuery, CHConfig> {
  settings: DataSourceInstanceSettings<CHConfig>;

  constructor(instanceSettings: DataSourceInstanceSettings<CHConfig>) {
    super(instanceSettings);
    this.settings = instanceSettings;
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
    return new Promise(resolve => {
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
    return vectorator(frame?.fields[0]?.values).map(text => text);
  }
}
