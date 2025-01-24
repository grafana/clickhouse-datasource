import {
  DataFrame,
  DataFrameView,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  DataSourceWithLogsContextSupport,
  DataSourceWithSupplementaryQueriesSupport,
  getTimeZone,
  getTimeZoneInfo,
  LogRowContextOptions,
  LogRowContextQueryDirection,
  LogRowModel,
  MetricFindValue,
  QueryFixAction,
  ScopedVars,
  SupplementaryQueryOptions,
  SupplementaryQueryType,
  TypedVariableModel,
} from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv } from '@grafana/runtime';
import { Observable, map, firstValueFrom } from 'rxjs';
import { CHConfig } from 'types/config';
import { EditorType, CHQuery } from 'types/sql';
import {
  QueryType,
  AggregateColumn,
  AggregateType,
  BuilderMode,
  Filter,
  FilterOperator,
  TableColumn,
  OrderByDirection,
  QueryBuilderOptions,
  ColumnHint,
  TimeUnit,
  SelectedColumn,
} from 'types/queryBuilder';
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
import { generateSql, getColumnByHint, logAliasToColumnHints } from './sqlGenerator';
import otel from 'otel';
import { createElement as createReactElement, ReactNode } from 'react';
import { dataFrameHasLogLabelWithName, transformQueryResponseWithTraceAndLogLinks } from './utils';
import { pluginVersion } from 'utils/version';
import LogsContextPanel from 'components/LogsContextPanel';

export class Datasource
  extends DataSourceWithBackend<CHQuery, CHConfig>
  implements DataSourceWithSupplementaryQueriesSupport<CHQuery>,
  DataSourceWithLogsContextSupport<CHQuery>
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

        const intervalInfo = getIntervalInfo(logsVolumeRequest.scopedVars);
        logsVolumeRequest.interval = intervalInfo.interval;
        logsVolumeRequest.scopedVars.__interval = { value: intervalInfo.interval, text: intervalInfo.interval };
        logsVolumeRequest.hideFromInspector = true;
        if (intervalInfo.intervalMs !== undefined) {
          logsVolumeRequest.intervalMs = intervalInfo.intervalMs;
          logsVolumeRequest.scopedVars.__interval_ms = {
            value: intervalInfo.intervalMs,
            text: intervalInfo.intervalMs,
          };
        }

        const targets: CHQuery[] = [];
        logsVolumeRequest.targets.forEach((target) => {
          const supplementaryQuery = this.getSupplementaryLogsVolumeQuery(logsVolumeRequest, target);
          if (supplementaryQuery !== undefined) {
            targets.push(supplementaryQuery);
          }
        });

        if (!targets.length) {
          return undefined;
        }

        return queryLogsVolume(
          this,
          { ...logsVolumeRequest, targets },
          {
            range: logsVolumeRequest.range,
            targets: logsVolumeRequest.targets,
          }
        );
      default:
        return undefined;
    }
  }

  getSupportedSupplementaryQueryTypes(): SupplementaryQueryType[] {
    return [SupplementaryQueryType.LogsVolume];
  }

  getSupplementaryLogsVolumeQuery(logsVolumeRequest: DataQueryRequest<CHQuery>, query: CHQuery): CHQuery | undefined {
    if (
      query.editorType !== EditorType.Builder ||
      query.builderOptions.queryType !== QueryType.Logs ||
      query.builderOptions.mode !== BuilderMode.List ||
      query.builderOptions.database === '' ||
      query.builderOptions.table === ''
    ) {
      return undefined;
    }

    

    const timeColumn = getColumnByHint(query.builderOptions, ColumnHint.Time);
    if (timeColumn === undefined) {
      return undefined;
    }

    const columns: SelectedColumn[] = [];
    const aggregates: AggregateColumn[] = [];
    columns.push({
      name: getTimeFieldRoundingClause(logsVolumeRequest.scopedVars, timeColumn.name),
      alias: TIME_FIELD_ALIAS,
      hint: ColumnHint.Time
    });

    const logLevelColumn = getColumnByHint(query.builderOptions, ColumnHint.LogLevel);
    if (logLevelColumn) {
      // Generates aggregates like
      // sum(toString("log_level") IN ('dbug', 'debug', 'DBUG', 'DEBUG', 'Dbug', 'Debug')) AS debug
      const llf = `toString("${logLevelColumn.name}")`;
      let level: keyof typeof LOG_LEVEL_TO_IN_CLAUSE;
      for (level in LOG_LEVEL_TO_IN_CLAUSE) {
        aggregates.push({ aggregateType: AggregateType.Sum, column: `multiSearchAny(${llf}, [${LOG_LEVEL_TO_IN_CLAUSE[level]}])`, alias: level });
      }
    } else {
      // Count all logs if level column isn't selected
      aggregates.push({
        aggregateType: AggregateType.Count,
        column: '*',
        alias: DEFAULT_LOGS_ALIAS,
      });
    }

    const filters = (query.builderOptions.filters?.slice() || []).map(f => {
      // In order for a hinted filter to work, the hinted column must be SELECTed OR provide "key"
      // For this histogram query the "level" column isn't selected, so we must find the original column name
      if (f.hint && !f.key) {
        const originalColumn = getColumnByHint(query.builderOptions, f.hint);
        f.key = originalColumn?.alias || originalColumn?.name || '';
      }

      return f;
    });

    const logVolumeSqlBuilderOptions: QueryBuilderOptions = {
      database: query.builderOptions.database,
      table: query.builderOptions.table,
      queryType: QueryType.TimeSeries,
      filters,
      columns,
      aggregates,
      orderBy: [{ name: '', hint: ColumnHint.Time, dir: OrderByDirection.ASC }],
    };

    const logVolumeSupplementaryQuery = generateSql(logVolumeSqlBuilderOptions);
    return {
      pluginVersion,
      editorType: EditorType.Builder,
      builderOptions: logVolumeSqlBuilderOptions,
      rawSql: logVolumeSupplementaryQuery,
      refId: '',
    };
  }

  getSupplementaryQuery(options: SupplementaryQueryOptions, originalQuery: CHQuery): CHQuery | undefined {
    return undefined;
  }

  async metricFindQuery(query: CHQuery | string, options: any) {
    if (this.adHocFiltersStatus === AdHocFilterStatus.none) {
      this.adHocFiltersStatus = await this.canUseAdhocFilters();
    }
    const chQuery = isString(query) ? { rawSql: query, editorType: EditorType.SQL } : query;

    if (!(chQuery.editorType === EditorType.SQL || chQuery.editorType === EditorType.Builder || !chQuery.editorType)) {
      return [];
    }

    if (!chQuery.rawSql) {
      return [];
    }
    const frame = await this.runQuery(chQuery, options);
    if (frame.fields?.length === 0) {
      return [];
    }
    if (frame?.fields?.length === 1) {
      return frame?.fields[0]?.values.map((text) => ({ text, value: text }));
    }
    // convention - assume the first field is an id field
    const ids = frame?.fields[0]?.values;
    return frame?.fields[1]?.values.map((text, i) => ({ text, value: ids.get(i) }));
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
      const templateVarParam = params[1].trim();
      const varRegex = new RegExp(/(?<=\$\{)[\w\d]+(?=\})|(?<=\$)[\w\d]+/);
      const templateVar = varRegex.exec(templateVarParam);
      let phrase = params[0];
      if (templateVar) {
        const key = templateVars.find((x) => x.name === templateVar[0]) as any;
        let value = key?.current.value.toString();
        if (value === '' || value === '$__all') {
          phrase = '1=1';
        }
      }
      rawQuery = rawQuery.replace(`${macro}${params[0]},${params[1]})`, phrase);
      macroIndex = rawQuery.lastIndexOf(macro);
    }
    return rawQuery;
  }

  // Support filtering by field value in Explore
  modifyQuery(query: CHQuery, action: QueryFixAction): CHQuery {
    if (query.editorType !== EditorType.Builder || !action.options || !action.options.key || !action.options.value) {
      return query;
    }

    const columnName = action.options.key;
    const actionFrame: DataFrame | undefined = (action as any).frame;
    const actionValue = action.options.value;

    // Find selected column by alias/name
    const lookupByAlias = query.builderOptions.columns?.find(c => c.alias === columnName); // Check all aliases first,
    const lookupByName = query.builderOptions.columns?.find(c => c.name === columnName);   // then try matching column name
    const lookupByLogsAlias = logAliasToColumnHints.has(columnName) ? getColumnByHint(query.builderOptions, logAliasToColumnHints.get(columnName)!) : undefined;
    const lookupByLogLabels = dataFrameHasLogLabelWithName(actionFrame, columnName) && getColumnByHint(query.builderOptions, ColumnHint.LogLabels);
    const column = lookupByAlias || lookupByName || lookupByLogsAlias || lookupByLogLabels;
    
    let nextFilters: Filter[] = (query.builderOptions.filters?.slice() || []);
    if (action.type === 'ADD_FILTER') {
      // we need to remove *any other EQ or NE* for the same field,
      // because we don't want to end up with two filters like `level=info` AND `level=error`
      nextFilters = nextFilters.filter(f =>
        !(
          f.type === 'string' &&
          ((column && column.hint && f.hint) ? f.hint === column.hint : f.key === columnName) &&
          (f.operator === FilterOperator.IsAnything || f.operator === FilterOperator.Equals || f.operator === FilterOperator.NotEquals)
        ) &&
        !(
          f.type.toLowerCase().startsWith('map') &&
          (column && lookupByLogLabels && f.mapKey === columnName) &&
          (f.operator === FilterOperator.IsAnything || f.operator === FilterOperator.Equals || f.operator === FilterOperator.NotEquals)
        )
      );

      nextFilters.push({
        condition: 'AND',
        key: (column && column.hint) ? '' : columnName,
        hint: (column && column.hint) ? column.hint : undefined,
        mapKey: lookupByLogLabels ? columnName : undefined,
        type: lookupByLogLabels ? 'Map(String, String)' : 'string',
        filterType: 'custom',
        operator: FilterOperator.Equals,
        value: actionValue,
      });
    } else if (action.type === 'ADD_FILTER_OUT') {
      // with this we might want to add multiple values as NE filters
      // for example, `level != info` AND `level != debug`
      // thus, here we remove only exactly matching NE filters or an existing EQ filter for this field
      nextFilters = nextFilters.filter(f =>
        !(
          (f.type === 'string' &&
            ((column && column.hint && f.hint) ? f.hint === column.hint : f.key === columnName) &&
            'value' in f && f.value === actionValue &&
            (f.operator === FilterOperator.IsAnything || f.operator === FilterOperator.NotEquals)
          ) ||
          (
            f.type === 'string' &&
            ((column && column.hint && f.hint) ? f.hint === column.hint : f.key === columnName) &&
            (f.operator === FilterOperator.IsAnything || f.operator === FilterOperator.Equals)
          ) ||
          (
            f.type.toLowerCase().startsWith('map') &&
            (column && lookupByLogLabels && f.mapKey === columnName) &&
            (f.operator === FilterOperator.IsAnything || f.operator === FilterOperator.Equals)
          )
        )
      );

      nextFilters.push({
        condition: 'AND',
        key: (column && column.hint) ? '' : columnName,
        hint: (column && column.hint) ? column.hint : undefined,
        mapKey: lookupByLogLabels ? columnName : undefined,
        type: lookupByLogLabels ? 'Map(String, String)' : 'string',
        filterType: 'custom',
        operator: FilterOperator.NotEquals,
        value: actionValue,
      });
    }

    // the query is updated to trigger the URL update and propagation to the panels
    const nextOptions = { ...query.builderOptions, filters: nextFilters };
    return {
      ...query,
      rawSql: generateSql(nextOptions),
      builderOptions: nextOptions,
    };
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

  getDefaultDatabase(): string {
    return this.settings.jsonData.defaultDatabase || 'default';
  }

  getDefaultTable(): string | undefined {
    return this.settings.jsonData.defaultTable;
  }

  getDefaultLogsDatabase(): string | undefined {
    return this.settings.jsonData.logs?.defaultDatabase;
  }

  getDefaultLogsTable(): string | undefined {
    return this.settings.jsonData.logs?.defaultTable;
  }

  getDefaultLogsColumns(): Map<ColumnHint, string> {
    const result = new Map<ColumnHint, string>();
    const logsConfig = this.settings.jsonData.logs;
    if (!logsConfig) {
      return result;
    }

    const otelEnabled = logsConfig.otelEnabled;
    const otelVersion = logsConfig.otelVersion;

    const otelConfig = otel.getVersion(otelVersion);
    if (otelEnabled && otelConfig) {
      return otelConfig.logColumnMap;
    }

    logsConfig.timeColumn && result.set(ColumnHint.Time, logsConfig.timeColumn);
    logsConfig.levelColumn && result.set(ColumnHint.LogLevel, logsConfig.levelColumn);
    logsConfig.messageColumn && result.set(ColumnHint.LogMessage, logsConfig.messageColumn);

    return result;
  }

  shouldSelectLogContextColumns(): boolean {
    return this.settings.jsonData.logs?.selectContextColumns || false;
  }

  getLogContextColumnNames(): string[] {
    return this.settings.jsonData.logs?.contextColumns || [];
  }

  /**
   * Get configured OTEL version for logs. Returns undefined when versioning is disabled/unset.
   */
  getLogsOtelVersion(): string | undefined {
    const logConfig = this.settings.jsonData.logs;
    return logConfig?.otelEnabled ? (logConfig.otelVersion || undefined) : undefined;
  }

  getDefaultTraceDatabase(): string | undefined {
    return this.settings.jsonData.traces?.defaultDatabase;
  }

  getDefaultTraceTable(): string | undefined {
    return this.settings.jsonData.traces?.defaultTable;
  }

  getDefaultTraceColumns(): Map<ColumnHint, string> {
    const result = new Map<ColumnHint, string>();
    const traceConfig = this.settings.jsonData.traces;
    if (!traceConfig) {
      return result;
    }

    const otelEnabled = traceConfig.otelEnabled;
    const otelVersion = traceConfig.otelVersion;

    const otelConfig = otel.getVersion(otelVersion);
    if (otelEnabled && otelConfig) {
      return otelConfig.traceColumnMap;
    }

    traceConfig.traceIdColumn && result.set(ColumnHint.TraceId, traceConfig.traceIdColumn);
    traceConfig.spanIdColumn && result.set(ColumnHint.TraceSpanId, traceConfig.spanIdColumn);
    traceConfig.operationNameColumn && result.set(ColumnHint.TraceOperationName, traceConfig.operationNameColumn);
    traceConfig.parentSpanIdColumn && result.set(ColumnHint.TraceParentSpanId, traceConfig.parentSpanIdColumn);
    traceConfig.serviceNameColumn && result.set(ColumnHint.TraceServiceName, traceConfig.serviceNameColumn);
    traceConfig.durationColumn && result.set(ColumnHint.TraceDurationTime, traceConfig.durationColumn);
    traceConfig.startTimeColumn && result.set(ColumnHint.Time, traceConfig.startTimeColumn);
    traceConfig.tagsColumn && result.set(ColumnHint.TraceTags, traceConfig.tagsColumn);
    traceConfig.serviceTagsColumn && result.set(ColumnHint.TraceServiceTags, traceConfig.serviceTagsColumn);

    return result;
  }

  /**
   * Get configured OTEL version for traces. Returns undefined when versioning is disabled/unset.
   */
  getTraceOtelVersion(): string | undefined {
    const traceConfig = this.settings.jsonData.traces;
    return traceConfig?.otelEnabled ? (traceConfig.otelVersion || undefined) : undefined;
  }

  getDefaultTraceDurationUnit(): TimeUnit {
    return this.settings.jsonData.traces?.durationUnit as TimeUnit || TimeUnit.Nanoseconds;
  }

  async fetchDatabases(): Promise<string[]> {
    return this.fetchData('SHOW DATABASES');
  }

  async fetchTables(db?: string): Promise<string[]> {
    const rawSql = db ? `SHOW TABLES FROM "${db}"` : 'SHOW TABLES';
    return this.fetchData(rawSql);
  }

  /**
   * Used to populate suggestions in the filter editor for Map columns.
   * 
   * Samples rows to get a unique set of keys for the map.
   * May not include ALL keys for a given dataset.
   * 
   * TODO: This query can be slow/expensive
   */
  async fetchUniqueMapKeys(mapColumn: string, db: string, table: string): Promise<string[]> {
    const rawSql = `SELECT DISTINCT arrayJoin(${mapColumn}.keys) as keys FROM "${db}"."${table}" LIMIT 1000`;
    return this.fetchData(rawSql);
  }

  async fetchEntities() {
    return this.fetchTables();
  }

  async fetchFields(database: string, table: string): Promise<string[]> {
    return this.fetchData(`DESC TABLE "${database}"."${table}"`);
  }

  /**
   * Fetches JSON column suggestions for each specified JSON column.
   */
  async fetchPathsForJSONColumns(database: string | undefined, table: string, jsonColumnName: string): Promise<TableColumn[]> {
    const prefix = Boolean(database) ? `"${database}".` : '';
    const rawSql = `SELECT arrayJoin(distinctJSONPathsAndTypes(${jsonColumnName})) FROM ${prefix}"${table}"`;
    const frame = await this.runQuery({ rawSql });
    if (frame.fields?.length === 0) {
      return [];
    }

    const view = new DataFrameView(frame);
    const jsonPathsAndTypes: Array<[string, string]> = [];
    for (let x of view) {
      if (!x || !x[0]) {
        continue;
      }

      const kv = JSON.parse(x[0]);
      if (!kv.keys || !kv.values) {
        continue;
      }

      jsonPathsAndTypes.push([kv.keys, kv.values]);
    }

    const columns: TableColumn[] = [];
    for (let pathAndTypes of jsonPathsAndTypes) {
      const path = pathAndTypes[0];
      const types = pathAndTypes[1];
      if (!path || !types || types.length === 0) {
        continue;
      }

      columns.push({
        name: `${jsonColumnName}.${path}`,
        label: `${jsonColumnName}.${path}`,
        type: types[0],
        picklistValues: [],
      })
    }

    return columns;
  }
  
  /**
   * Fetches column suggestions from the table schema.
   */
  async fetchColumnsFromTable(database: string | undefined, table: string): Promise<TableColumn[]> {
    const prefix = Boolean(database) ? `"${database}".` : '';
    const rawSql = `DESC TABLE ${prefix}"${table}"`;
    const frame = await this.runQuery({ rawSql });
    if (frame.fields?.length === 0) {
      return [];
    }
    const view = new DataFrameView(frame);
    const columns: TableColumn[] = view.map(item => ({
      name: item[0],
      type: item[1],
      label: item[0],
      picklistValues: [],
    }));

    const jsonColumnNames = columns.filter(c => c.type.startsWith('JSON')).map(c => c.name);
    for (let jsonColumnName of jsonColumnNames) {
      const jsonColumns = await this.fetchPathsForJSONColumns(database, table, jsonColumnName);
      columns.push(...jsonColumns);
    }

    return columns;
  }

  /**
   * Fetches column suggestions from an alias definition table.
   */
  async fetchColumnsFromAliasTable(fullTableName: string): Promise<TableColumn[]> {
    const rawSql = `SELECT alias, select, "type" FROM ${fullTableName}`;
    const frame = await this.runQuery({ rawSql });
    if (frame.fields?.length === 0) {
      return [];
    }
    const view = new DataFrameView(frame);
    return view.map(item => ({
      name: item[1],
      type: item[2],
      label: item[0],
      picklistValues: [],
    }));
  }

  getAliasTable(targetDatabase: string | undefined, targetTable: string): string | null {
    const aliasEntries = this.settings?.jsonData?.aliasTables || [];
    const matchedEntry = aliasEntries.find(e => {
      const matchDatabase = !e.targetDatabase || (e.targetDatabase === targetDatabase);
      const matchTable = e.targetTable === targetTable;
      return matchDatabase && matchTable;
    }) || null;

    if (matchedEntry === null) {
      return null;
    }

    const aliasDatabase = matchedEntry.aliasDatabase || targetDatabase || null;
    const aliasTable = matchedEntry.aliasTable;
    const prefix = Boolean(aliasDatabase) ? `"${aliasDatabase}".` : '';
    return `${prefix}"${aliasTable}"`;
  }

  async fetchColumns(database: string | undefined, table: string): Promise<TableColumn[]> {
    const fullAliasTableName = this.getAliasTable(database, table);
    if (fullAliasTableName !== null) {
      return this.fetchColumnsFromAliasTable(fullAliasTableName);
    }

    return this.fetchColumnsFromTable(database, table);
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
            ...t?.meta,
            timezone: this.getTimezone(request),
          },
        };
      });

    return super.query({
      ...request,
      targets,
    }).pipe(map((res: DataQueryResponse) => transformQueryResponseWithTraceAndLogLinks(this, request, res)));
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
    return frame?.fields[0]?.values.map((text) => text);
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
    return field.values
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
      return field.values
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
      const rawSql = 'SELECT name, type, table FROM system.columns';
      const results = await this.runQuery({ rawSql });
      return { type: TagType.schema, frame: results };
    }

    if (tagSource.type === TagType.query) {
      this.adHocFilter.setTargetTableFromQuery(tagSource.source);
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

  // interface DataSourceWithLogsContextSupport
  getLogContextColumnsFromLogRow(row: LogRowModel): LogContextColumn[] {
    const contextColumnNames = this.getLogContextColumnNames();
    const contextColumns: LogContextColumn[] = [];

    for (let columnName of contextColumnNames) {
      const isMapKey = columnName.includes('[\'') && columnName.includes('\']');
      let mapName = '';
      let keyName = '';
      if (isMapKey) {
        mapName = columnName.substring(0, columnName.indexOf('['));
        keyName = columnName.substring(columnName.indexOf('[\'') + 2, columnName.lastIndexOf('\']'));
      }

      const field = row.dataFrame.fields.find(f => (
        // exact column name match
        f.name === columnName ||
        (isMapKey && (
          // entire map was selected
          f.name === mapName ||
           // single key was selected from map
          f.name === `arrayElement(${mapName}, '${keyName}')`
        ))
      ));
      if (!field) {
        continue;
      }

      let value = field.values.get(row.rowIndex);
      if (value && field.type === 'other' && isMapKey) {
        value = value[keyName];
      }

      if (!value) {
        continue;
      }

      let contextColumnName: string;
      if (isMapKey) {
        contextColumnName = `${mapName}['${keyName}']`;
      } else {
        contextColumnName = columnName;
      }

      contextColumns.push({
        name: contextColumnName,
        value
      });
    }

    return contextColumns;
  }


  /**
   * Runs a query based on a single log row and a direction (forward/backward)
   * 
   * Will remove all filters and ORDER BYs, and will re-add them based on the configured context columns.
   * Context columns are used to narrow down to a single logging unit as defined by your logging infrastructure.
   * Typically this will be a single service, or container/pod in docker/k8s.
   * 
   * If no context columns can be matched from the selected data frame, then the query is not run.
   */
  async getLogRowContext(row: LogRowModel, options?: LogRowContextOptions, query?: CHQuery | undefined, cacheFilters?: boolean): Promise<DataQueryResponse> {
    if (!query) {
      throw new Error('Missing query for log context');
    } else if (!options || !options.direction || options.limit === undefined) {
      throw new Error('Missing log context options for query');
    } else if (query.editorType === EditorType.SQL || !query.builderOptions) {
      throw new Error('Log context feature only works for builder queries');
    }

    const contextQuery = cloneDeep(query);
    contextQuery.refId = '';
    const builderOptions = contextQuery.builderOptions;
    builderOptions.limit = options.limit;

    if (!getColumnByHint(builderOptions, ColumnHint.Time)) {
      throw new Error('Missing time column for log context');
    }

    builderOptions.orderBy = [];
    builderOptions.orderBy.push({
      name: '',
      hint: ColumnHint.Time,
      dir: options.direction === LogRowContextQueryDirection.Forward ? OrderByDirection.ASC : OrderByDirection.DESC
    });

    builderOptions.filters = [];
    builderOptions.filters.push({
      operator: options.direction === LogRowContextQueryDirection.Forward ? FilterOperator.GreaterThanOrEqual : FilterOperator.LessThanOrEqual,
      filterType: 'custom',
      hint: ColumnHint.Time,
      key: '',
      value: `fromUnixTimestamp64Nano(${row.timeEpochNs})`,
      type: 'datetime',
      condition: 'AND'
    });

    const contextColumns = this.getLogContextColumnsFromLogRow(row);
    if (contextColumns.length < 1) {
      throw new Error('Unable to match any log context columns');
    }

    const contextColumnFilters: Filter[] = contextColumns.map(c => ({
      operator: FilterOperator.Equals,
      filterType: 'custom',
      key: c.name,
      value: c.value,
      type: 'string',
      condition: 'AND'
    }));
    builderOptions.filters.push(...contextColumnFilters);

    contextQuery.rawSql = generateSql(builderOptions);
    const req = {
      targets: [contextQuery],
    } as DataQueryRequest<CHQuery>;

    return await firstValueFrom(this.query(req));
  }

  /**
   * Unused + deprecated but required by interface, log context button is always visible now
   * https://github.com/grafana/grafana/issues/66819
   */
  showContextToggle(row?: LogRowModel): boolean {
    return true;
  }
  
  /**
   * Returns a React component that is displayed in the top portion of the log context panel
   */
  getLogRowContextUi(row: LogRowModel, runContextQuery?: (() => void) | undefined, query?: CHQuery | undefined): ReactNode {
    const contextColumns = this.getLogContextColumnsFromLogRow(row);
    return createReactElement(LogsContextPanel, { columns: contextColumns, datasourceUid: this.uid });
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

export interface LogContextColumn {
  name: string;
  value: string;
}
