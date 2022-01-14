import {
  ArrayDataFrame,
  DataFrame,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  MetricFindValue,
  ScopedVars,
  vectorator,
} from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv, TemplateSrv } from '@grafana/runtime';
import { CHConfig, CHQuery } from '../types';
import { AdHocFilter } from './adHocFilter';
import { isString } from 'lodash';

export class Datasource extends DataSourceWithBackend<CHQuery, CHConfig> {
  // This enables default annotation support for 7.2+
  annotations = {};
  settings: DataSourceInstanceSettings<CHConfig>;
  templateSrv: TemplateSrv;
  adHocFilter: AdHocFilter;
  skipAdHocFilter = false;

  constructor(instanceSettings: DataSourceInstanceSettings<CHConfig>) {
    super(instanceSettings);
    this.settings = instanceSettings;
    this.templateSrv = getTemplateSrv();
    this.adHocFilter = new AdHocFilter();
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
    let rawQuery = query.rawSql || '';
    // we want to skip applying ad hoc filters when we are getting values for ad hoc filters
    if (!this.skipAdHocFilter) {
      rawQuery = this.adHocFilter.apply(rawQuery, (this.templateSrv as any)?.getAdhocFilters(this.name));
    }
    this.skipAdHocFilter = false;
    return {
      ...query,
      rawSql: this.replace(rawQuery, scoped) || '',
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

  async getTagKeys(): Promise<MetricFindValue[]> {
    const frame = await this.fetchTags();
    return frame.fields.map((f) => ({ text: f.name }));
  }

  async getTagValues({ key }: any): Promise<MetricFindValue[]> {
    const frame = await this.fetchTags();
    const field = frame.fields.find((f) => f.name === key);
    if (field) {
      // Convert to string to avoid https://github.com/grafana/grafana/issues/12209
      return vectorator(field.values)
        .filter((value) => value !== null)
        .map((value) => {
          return { text: String(value) };
        });
    }
    return [];
  }

  async fetchTags(): Promise<DataFrame> {
    // @todo https://github.com/grafana/grafana/issues/13109
    const rawSql = this.templateSrv.replace('$clickhouse_adhoc_query');
    if (rawSql === '$clickhouse_adhoc_query') {
      return new ArrayDataFrame([]);
    } else {
      this.skipAdHocFilter = true;
      this.adHocFilter.setTargetTable(rawSql);
      return await this.runQuery({ rawSql });
    }
  }
}
