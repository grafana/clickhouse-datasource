import {
  DataFrame,
  DataFrameView,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  DataSourceWithSupplementaryQueriesSupport,
  getTimeZone,
  getTimeZoneInfo,
  MetricFindValue,
  ScopedVars,
  SupplementaryQueryType,
  TypedVariableModel,
  vectorator,
} from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv } from '@grafana/runtime';
import { Observable } from 'rxjs';
import {
  BuilderMetricField,
  BuilderMetricFieldAggregation,
  BuilderMode,
  CHConfig,
  CHQuery,
  Format,
  FullField,
  OrderByDirection,
  QueryType,
  SqlBuilderOptionsAggregate,
} from '../types';
import { AdHocFilter } from './adHocFilter';
import { cloneDeep, isEmpty, isString } from 'lodash';
import {
  DEFAULT_LOGS_ALIAS,
  getIntervalInfo,
  getTimeFieldRoundingClause,
  LOG_LEVEL_TO_IN_CLAUSE,
  queryLogsVolume,
  TIME_FIELD_ALIAS,
} from './logs';
import { getSQLFromQueryOptions } from '../components/queryBuilder/utils';

export class Datasource
  extends DataSourceWithBackend<CHQuery, CHConfig>
  implements DataSourceWithSupplementaryQueriesSupport<CHQuery>
{
  // This enables default annotation support for 7.2+
  annotations = {};
  settings: DataSourceInstanceSettings<CHConfig>;
  adHocFilter: AdHocFilter;
  skipAdHocFilter = false; // don't apply adhoc filters to the query
  adHocFiltersStatus = AdHocFilterStatus.none; // ad hoc filters only work with CH 22.7+
  adHocCHVerReq = { major: 22, minor: 7 };

  constructor(instanceSettings: DataSourceInstanceSettings<CHConfig>) {
    super(instanceSettings);
    this.settings = instanceSettings;
    this.adHocFilter = new AdHocFilter();
  }

  getDataProvider(
    type: SupplementaryQueryType,
    request: DataQueryRequest<CHQuery>
  ): Observable<DataQueryResponse> | undefined {
    if (!this.getSupportedSupplementaryQueryTypes().includes(type)) {
      return undefined;
    }
    switch (type) {
      case SupplementaryQueryType.LogsVolume:
        const logsVolumeRequest = cloneDeep(request);

        const timespanMs = logsVolumeRequest.range.to.valueOf() - logsVolumeRequest.range.from.valueOf();
        const intervalInfo = getIntervalInfo(logsVolumeRequest.scopedVars, timespanMs);

        logsVolumeRequest.interval = intervalInfo.interval;
        logsVolumeRequest.scopedVars.__interval = { value: intervalInfo.interval, text: intervalInfo.interval };

        if (intervalInfo.intervalMs !== undefined) {
          logsVolumeRequest.intervalMs = intervalInfo.intervalMs;
          logsVolumeRequest.scopedVars.__interval_ms = {
            value: intervalInfo.intervalMs,
            text: intervalInfo.intervalMs,
          };
        }

        logsVolumeRequest.hideFromInspector = true;

        const targets: CHQuery[] = [];
        logsVolumeRequest.targets.forEach((target) => {
          const supplementaryQuery = this.getSupplementaryLogsVolumeQuery(logsVolumeRequest, target, timespanMs);
          if (supplementaryQuery !== undefined) {
            targets.push(supplementaryQuery);
          }
        });

        if (!targets.length) {
          return undefined;
        }

        return queryLogsVolume(
          this,
          { ...request, targets },
          {
            range: request.range,
            targets: request.targets,
          }
        );
      default:
        return undefined;
    }
  }

  getSupportedSupplementaryQueryTypes(): SupplementaryQueryType[] {
    return [SupplementaryQueryType.LogsVolume];
  }

  private getSupplementaryLogsVolumeQuery(
    logsVolumeRequest: DataQueryRequest<CHQuery>,
    query: CHQuery,
    timespanMs: number
  ): CHQuery | undefined {
    if (
      query.format !== Format.LOGS ||
      query.queryType !== QueryType.Builder ||
      query.builderOptions.mode !== BuilderMode.List ||
      query.builderOptions.timeField === undefined ||
      query.builderOptions.database === undefined ||
      query.builderOptions.table === undefined
    ) {
      return undefined;
    }

    const timeFieldRoundingClause = getTimeFieldRoundingClause(
      logsVolumeRequest.scopedVars,
      timespanMs,
      query.builderOptions.timeField
    );
    const fields: string[] = [];
    const metrics: BuilderMetricField[] = [];
    // could be undefined or an empty string (if user deselects the field)
    if (query.builderOptions.logLevelField) {
      // Generate "fields" like
      // sum(toString("log_level") IN ('dbug', 'debug', 'DBUG', 'DEBUG', 'Dbug', 'Debug')) AS debug
      const llf = `toString("${query.builderOptions.logLevelField}")`;
      let level: keyof typeof LOG_LEVEL_TO_IN_CLAUSE;
      for (level in LOG_LEVEL_TO_IN_CLAUSE) {
        fields.push(`sum(${llf} ${LOG_LEVEL_TO_IN_CLAUSE[level]}) AS ${level}`)
      }
    } else {
      metrics.push({
        aggregation: BuilderMetricFieldAggregation.Count,
        alias: DEFAULT_LOGS_ALIAS,
        field: '*',
      });
    }

    const logVolumeSqlBuilderOptions: SqlBuilderOptionsAggregate = {
      mode: BuilderMode.Aggregate,
      database: query.builderOptions.database,
      table: query.builderOptions.table,
      filters: query.builderOptions.filters,
      fields,
      metrics,
      groupBy: [`${timeFieldRoundingClause} AS ${TIME_FIELD_ALIAS}`],
      orderBy: [
        {
          name: TIME_FIELD_ALIAS,
          dir: OrderByDirection.ASC,
        },
      ],
    };

    const logVolumeSupplementaryQuery = getSQLFromQueryOptions(logVolumeSqlBuilderOptions);
    return {
      format: Format.AUTO,
      queryType: QueryType.SQL,
      rawSql: logVolumeSupplementaryQuery,
      refId: '',
      selectedFormat: Format.AUTO,
    };
  }

  getSupplementaryQuery(type: SupplementaryQueryType, query: CHQuery): CHQuery | undefined {
    return undefined;
  }

  async metricFindQuery(query: CHQuery | string, options: any) {
    if (this.adHocFiltersStatus === AdHocFilterStatus.none) {
      this.adHocFiltersStatus = await this.canUseAdhocFilters();
    }
    const chQuery = isString(query) ? { rawSql: query, queryType: QueryType.SQL } : query;

    if (!(chQuery.queryType === QueryType.SQL || chQuery.queryType === QueryType.Builder || !chQuery.queryType)) {
      return [];
    }

    if (!chQuery.rawSql) {
      return [];
    }
    const q = { ...chQuery, queryType: chQuery.queryType || QueryType.SQL };
    const frame = await this.runQuery(q, options);
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
    const templateSrv = getTemplateSrv();
    if (!this.skipAdHocFilter) {
      const adHocFilters = (templateSrv as any)?.getAdhocFilters(this.name);
      if (this.adHocFiltersStatus === AdHocFilterStatus.disabled && adHocFilters?.length > 0) {
        throw new Error(
          `Unable to apply ad hoc filters. Upgrade ClickHouse to >=${this.adHocCHVerReq.major}.${this.adHocCHVerReq.minor} or remove ad hoc filters for the dashboard.`
        );
      }
      rawQuery = this.adHocFilter.apply(rawQuery, adHocFilters);
    }
    this.skipAdHocFilter = false;
    rawQuery = this.applyConditionalAll(rawQuery, getTemplateSrv().getVariables());
    return {
      ...query,
      rawSql: this.replace(rawQuery, scoped) || '',
    };
  }

  applyConditionalAll(rawQuery: string, templateVars: TypedVariableModel[]): string {
    if (!rawQuery) {
      return rawQuery;
    }
    const macro = '$__conditionalAll(';
    let macroIndex = rawQuery.lastIndexOf(macro);

    while (macroIndex !== -1) {
      const params = this.getMacroArgs(rawQuery, macroIndex + macro.length - 1);
      if (params.length !== 2) {
        return rawQuery;
      }
      const templateVar = params[1].trim();
      const key = templateVars.find((x) => x.name === templateVar.substring(1, templateVar.length)) as any;
      let phrase = params[0];
      let value = key?.current.value.toString();
      if (value === '' || value === '$__all') {
        phrase = '1=1';
      }
      rawQuery = rawQuery.replace(`${macro}${params[0]},${params[1]})`, phrase);
      macroIndex = rawQuery.lastIndexOf(macro);
    }
    return rawQuery;
  }

  private getMacroArgs(query: string, argsIndex: number): string[] {
    const args = [] as string[];
    const re = /\(|\)|,/g;
    let bracketCount = 0;
    let lastArgEndIndex = 1;
    let regExpArray: RegExpExecArray | null;
    const argsSubstr = query.substring(argsIndex, query.length);
    while ((regExpArray = re.exec(argsSubstr)) !== null) {
      const foundNode = regExpArray[0];
      if (foundNode === '(') {
        bracketCount++;
      } else if (foundNode === ')') {
        bracketCount--;
      }
      if (foundNode === ',' && bracketCount === 1) {
        args.push(argsSubstr.substring(lastArgEndIndex, re.lastIndex - 1));
        lastArgEndIndex = re.lastIndex;
      }
      if (bracketCount === 0) {
        args.push(argsSubstr.substring(lastArgEndIndex, re.lastIndex - 1));
        return args;
      }
    }
    return [];
  }

  private replace(value?: string, scopedVars?: ScopedVars) {
    if (value !== undefined) {
      return getTemplateSrv().replace(value, scopedVars, this.format);
    }
    return value;
  }

  private format(value: any) {
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

  async fetchEntities() {
    return this.fetchTables();
  }

  async fetchFields(database: string, table: string): Promise<string[]> {
    return this.fetchData(`DESC TABLE ${database}."${table}"`);
  }

  async fetchFieldsFull(database: string | undefined, table: string): Promise<FullField[]> {
    const prefix = Boolean(database) ? `${database}.` : '';
    const rawSql = `DESC TABLE ${prefix}"${table}"`;
    const frame = await this.runQuery({ rawSql });
    if (frame.fields?.length === 0) {
      return [];
    }
    const view = new DataFrameView(frame);
    return view.map((item) => ({
      name: item[0],
      type: item[1],
      label: item[0],
      picklistValues: [],
    }));
  }

  private async fetchData(rawSql: string) {
    const frame = await this.runQuery({ rawSql });
    return this.values(frame);
  }

  private getTimezone(request: DataQueryRequest<CHQuery>): string | undefined {
    // timezone specified in the time picker
    if (request.timezone && request.timezone !== 'browser') {
      return request.timezone;
    }
    // fall back to the local timezone
    const localTimezoneInfo = getTimeZoneInfo(getTimeZone(), Date.now());
    return localTimezoneInfo?.ianaName;
  }

  query(request: DataQueryRequest<CHQuery>): Observable<DataQueryResponse> {
    const targets = request.targets
      // filters out queries disabled in UI
      .filter((t) => t.hide !== true)
      // attach timezone information
      .map((t) => {
        return {
          ...t,
          meta: {
            ...t.meta,
            timezone: this.getTimezone(request),
          },
        };
      });

    return super.query({
      ...request,
      targets,
    });
  }

  private runQuery(request: Partial<CHQuery>, options?: any): Promise<DataFrame> {
    return new Promise((resolve) => {
      const req = {
        targets: [{ ...request, refId: String(Math.random()) }],
        range: options ? options.range : (getTemplateSrv() as any).timeRange,
      } as DataQueryRequest<CHQuery>;
      this.query(req).subscribe((res: DataQueryResponse) => {
        resolve(res.data[0] || { fields: [] });
      });
    });
  }

  private values(frame: DataFrame) {
    if (frame.fields?.length === 0) {
      return [];
    }
    return vectorator(frame?.fields[0]?.values).map((text) => text);
  }

  async getTagKeys(): Promise<MetricFindValue[]> {
    if (this.adHocFiltersStatus === AdHocFilterStatus.disabled || this.adHocFiltersStatus === AdHocFilterStatus.none) {
      this.adHocFiltersStatus = await this.canUseAdhocFilters();
      if (this.adHocFiltersStatus === AdHocFilterStatus.disabled) {
        return {} as MetricFindValue[];
      }
    }
    const { type, frame } = await this.fetchTags();
    if (type === TagType.query) {
      return frame.fields.map((f) => ({ text: f.name }));
    }
    const view = new DataFrameView(frame);
    return view.map((item) => ({
      text: `${item[2]}.${item[0]}`,
    }));
  }

  async getTagValues({ key }: any): Promise<MetricFindValue[]> {
    const { type } = this.getTagSource();
    this.skipAdHocFilter = true;
    if (type === TagType.query) {
      return this.fetchTagValuesFromQuery(key);
    }
    return this.fetchTagValuesFromSchema(key);
  }

  private async fetchTagValuesFromSchema(key: string): Promise<MetricFindValue[]> {
    const { from } = this.getTagSource();
    const [table, col] = key.split('.');
    const source = from?.includes('.') ? `${from.split('.')[0]}.${table}` : table;
    const rawSql = `select distinct ${col} from ${source} limit 1000`;
    const frame = await this.runQuery({ rawSql });
    if (frame.fields?.length === 0) {
      return [];
    }
    const field = frame.fields[0];
    // Convert to string to avoid https://github.com/grafana/grafana/issues/12209
    return vectorator(field.values)
      .filter((value) => value !== null)
      .map((value) => {
        return { text: String(value) };
      });
  }

  private async fetchTagValuesFromQuery(key: string): Promise<MetricFindValue[]> {
    const { frame } = await this.fetchTags();
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

  private async fetchTags(): Promise<Tags> {
    const tagSource = this.getTagSource();
    this.skipAdHocFilter = true;

    if (tagSource.source === undefined) {
      this.adHocFilter.setTargetTable('default');
      const rawSql = 'SELECT name, type, table FROM system.columns';
      const results = await this.runQuery({ rawSql });
      return { type: TagType.schema, frame: results };
    }

    if (tagSource.type === TagType.query) {
      this.adHocFilter.setTargetTableFromQuery(tagSource.source);
    } else {
      let table = tagSource.from;
      if (table?.includes('.')) {
        table = table.split('.')[1];
      }
      this.adHocFilter.setTargetTable(table || '');
    }

    const results = await this.runQuery({ rawSql: tagSource.source });
    return { type: tagSource.type, frame: results };
  }

  private getTagSource() {
    // @todo https://github.com/grafana/grafana/issues/13109
    const ADHOC_VAR = '$clickhouse_adhoc_query';
    const defaultDatabase = this.getDefaultDatabase();
    let source = getTemplateSrv().replace(ADHOC_VAR);
    if (source === ADHOC_VAR && isEmpty(defaultDatabase)) {
      return { type: TagType.schema, source: undefined };
    }
    source = source === ADHOC_VAR ? defaultDatabase! : source;
    if (source.toLowerCase().startsWith('select')) {
      return { type: TagType.query, source };
    }
    if (!source.includes('.')) {
      const sql = `SELECT name, type, table FROM system.columns WHERE database IN ('${source}')`;
      return { type: TagType.schema, source: sql, from: source };
    }
    const [db, table] = source.split('.');
    const sql = `SELECT name, type, table FROM system.columns WHERE database IN ('${db}') AND table = '${table}'`;
    return { type: TagType.schema, source: sql, from: source };
  }

  // Returns true if ClickHouse's version is greater than or equal to 22.7
  // 22.7 added 'settings additional_table_filters' which is used for ad hoc filters
  private async canUseAdhocFilters(): Promise<AdHocFilterStatus> {
    this.skipAdHocFilter = true;
    const data = await this.fetchData(`SELECT version()`);
    try {
      const verString = (data[0] as unknown as string).split('.');
      const ver = { major: Number.parseInt(verString[0], 10), minor: Number.parseInt(verString[1], 10) };
      return ver.major > this.adHocCHVerReq.major ||
        (ver.major === this.adHocCHVerReq.major && ver.minor >= this.adHocCHVerReq.minor)
        ? AdHocFilterStatus.enabled
        : AdHocFilterStatus.disabled;
    } catch (err) {
      console.error(`Unable to parse ClickHouse version: ${err}`);
      throw err;
    }
  }
}

enum TagType {
  query,
  schema,
}

enum AdHocFilterStatus {
  none = 0,
  enabled,
  disabled,
}

interface Tags {
  type?: TagType;
  frame: DataFrame;
}
