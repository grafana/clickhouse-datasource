import {
  AdHocVariableFilter,
  DataFrame,
  DataFrameView,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  DataSourceWithLogsContextSupport,
  DataSourceWithLogsLabelTypesSupport,
  DataSourceWithQueryModificationSupport,
  DataSourceWithSupplementaryQueriesSupport,
  DataSourceWithToggleableQueryFiltersSupport,
  Field,
  getTimeZone,
  getTimeZoneInfo,
  LogRowContextOptions,
  LogRowContextQueryDirection,
  LogRowModel,
  MetricFindValue,
  QueryFilterOptions,
  QueryFixAction,
  ScopedVars,
  SupplementaryQueryOptions,
  SupplementaryQueryType,
  ToggleFilterAction,
  TypedVariableModel,
} from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv } from '@grafana/runtime';
import { trackClickhouseHealthCheckFailed } from 'tracking';
import LogsContextPanel from 'components/LogsContextPanel';
import { cloneDeep, isEmpty, isString } from 'lodash';
import otel from 'otel';
import { createElement as createReactElement, ReactNode } from 'react';
import { concatMap, firstValueFrom, Observable } from 'rxjs';
import { CHConfig } from 'types/config';
import {
  AggregateColumn,
  AggregateType,
  BuilderMode,
  ColumnHint,
  Filter,
  FilterOperator,
  OrderByDirection,
  QueryBuilderOptions,
  StringFilter,
  QueryType,
  SelectedColumn,
  SqlFunction,
  TableColumn,
  TimeUnit,
} from 'types/queryBuilder';
import { CHQuery, EditorType } from 'types/sql';
import { pluginVersion } from 'utils/version';
import { AdHocFilter } from './adHocFilter';
import {
  DEFAULT_LOGS_ALIAS,
  getIntervalInfo,
  getTimeFieldRoundingClause,
  LOG_LEVEL_TO_IN_CLAUSE,
  splitLogsVolumeFrames,
  TIME_FIELD_ALIAS,
} from './logs';
import { escapeIdentifier, generateSql, getColumnByHint, logAliasToColumnHints } from './sqlGenerator';
import { labelsFieldName, transformQueryResponseWithTraceAndLogLinks } from './utils';
import { CHVariableSupport } from './CHVariableSupport';
import { createAnnotationSupport } from './CHAnnotationSupport';

interface ResolvedColumn {
  columnName: string;
  mapKey: string;
  column: SelectedColumn | undefined;
  columnType: string;
  hasMapKey: boolean;
}

/** Resolve a filter key to a column in the builder options, handling OTel map key splitting and alias/hint lookup. */
function resolveFilterColumn(builderOptions: QueryBuilderOptions, key: string): ResolvedColumn {
  let columnName = key;
  let mapKey = '';

  // Convert flattened/merged OTel attributes into column+path pair
  if (['ResourceAttributes', 'ScopeAttributes', 'LogAttributes'].includes(columnName.split('.')[0])) {
    const prefixIndex = columnName.indexOf('.');
    mapKey = columnName.substring(prefixIndex + 1);
    columnName = columnName.substring(0, prefixIndex);
  }

  // Find selected column by alias/name
  const lookupByAlias = builderOptions.columns?.find((c) => c.alias === columnName);
  const lookupByName = builderOptions.columns?.find((c) => c.name === columnName);
  const lookupByLogsAlias = logAliasToColumnHints.has(columnName)
    ? getColumnByHint(builderOptions, logAliasToColumnHints.get(columnName)!)
    : undefined;
  const column = lookupByAlias || lookupByName || lookupByLogsAlias;

  return {
    columnName,
    mapKey,
    column,
    columnType: column ? column.type || '' : '',
    hasMapKey: mapKey !== '',
  };
}

/** Build a filter object from resolved column info. */
function buildFilter(resolved: ResolvedColumn, operator: StringFilter['operator'], value: string): Filter {
  return {
    condition: 'AND',
    key: resolved.column?.hint ? '' : resolved.columnName,
    hint: resolved.column?.hint || undefined,
    mapKey: resolved.hasMapKey ? resolved.mapKey : undefined,
    type: resolved.hasMapKey ? (resolved.columnType.startsWith('Map') ? 'Map(String, String)' : 'JSON') : 'string',
    filterType: 'custom',
    operator,
    value,
  };
}

/** Check whether a filter targets the same column as a resolved column reference. */
function filterMatchesColumn(f: Filter, resolved: ResolvedColumn): boolean {
  if (resolved.hasMapKey) {
    return (f.type.startsWith('Map') || f.type.startsWith('JSON')) && f.mapKey === resolved.mapKey;
  }
  return (
    f.type === 'string' &&
    (resolved.column?.hint && f.hint ? f.hint === resolved.column.hint : f.key === resolved.columnName)
  );
}

export class Datasource
  extends DataSourceWithBackend<CHQuery, CHConfig>
  implements
    DataSourceWithSupplementaryQueriesSupport<CHQuery>,
    DataSourceWithLogsContextSupport<CHQuery>,
    DataSourceWithLogsLabelTypesSupport,
    DataSourceWithQueryModificationSupport<CHQuery>,
    DataSourceWithToggleableQueryFiltersSupport<CHQuery>
{
  settings: DataSourceInstanceSettings<CHConfig>;
  adHocFilter: AdHocFilter;
  skipAdHocFilter = false; // don't apply adhoc filters to the query
  adHocFiltersStatus = AdHocFilterStatus.none; // ad hoc filters only work with CH 22.7+
  adHocCHVerReq = { major: 22, minor: 7 };

  // Keyed by the bare table name (the `table` column of `system.columns`,
  // which has no database qualifier). Populated each time getTagKeys() reads
  // from system.columns; consumed by fetchTagValuesFromSchema() — via
  // asMapAccess() — to detect Map-column access patterns (e.g.
  // `LogAttributes.http.method`) and rewrite the SELECT accordingly.
  // `asMapAccess()` strips any `db.` prefix from the lookup source so callers
  // can pass either form.
  private mapColumnsByTable: Map<string, Set<string>> = new Map();
  private static readonly TRACE_TIMESTAMP_TABLE_CACHE_TTL_MS = 30 * 1000;
  // Caches the in-flight or resolved existence check for the `<table>_trace_id_ts`
  // companion, keyed by `${database}.${table}`. Caching the Promise dedupes concurrent
  // callers and lets cache hits resolve in a microtask. Entries expire after
  // TRACE_TIMESTAMP_TABLE_CACHE_TTL_MS so a companion table created after the datasource
  // loaded is detected without a page reload.
  private traceTimestampTableCache = new Map<
    string,
    { pending: Promise<boolean>; resolved?: boolean; expiresAt: number }
  >();

  constructor(instanceSettings: DataSourceInstanceSettings<CHConfig>) {
    super(instanceSettings);
    this.settings = instanceSettings;
    this.adHocFilter = new AdHocFilter();
    this.variables = new CHVariableSupport(this);
    this.annotations = createAnnotationSupport(this);
  }

  static logVolumePrefix = 'log-volume-';
  static logsSamplePrefix = 'logs-sample-';

  getSupplementaryRequest(
    type: SupplementaryQueryType,
    request: DataQueryRequest<CHQuery>
  ): DataQueryRequest<CHQuery> | undefined {
    if (!this.getSupportedSupplementaryQueryTypes(request).includes(type)) {
      return undefined;
    }

    if (type === SupplementaryQueryType.LogsVolume) {
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
          targets.push({ ...supplementaryQuery, refId: `${Datasource.logVolumePrefix}${target.refId}` });
        }
      });

      if (!targets.length) {
        return undefined;
      }

      return { ...logsVolumeRequest, targets };
    }

    if (type === SupplementaryQueryType.LogsSample) {
      const logsSampleRequest = cloneDeep(request);
      logsSampleRequest.hideFromInspector = true;

      const targets: CHQuery[] = [];
      logsSampleRequest.targets.forEach((target) => {
        const supplementaryQuery = this.getSupplementaryLogsSampleQuery(target);
        if (supplementaryQuery !== undefined) {
          targets.push({ ...supplementaryQuery, refId: `${Datasource.logsSamplePrefix}${target.refId}` });
        }
      });

      if (!targets.length) {
        return undefined;
      }

      return { ...logsSampleRequest, targets };
    }

    return undefined;
  }

  getSupportedSupplementaryQueryTypes(dsRequest: DataQueryRequest<CHQuery>): SupplementaryQueryType[] {
    if (dsRequest && dsRequest.targets.some((t) => t.editorType !== EditorType.Builder)) {
      return [];
    }
    return [SupplementaryQueryType.LogsVolume, SupplementaryQueryType.LogsSample];
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

    const timeColumn =
      getColumnByHint(query.builderOptions, ColumnHint.FilterTime) ||
      getColumnByHint(query.builderOptions, ColumnHint.Time);
    if (timeColumn === undefined) {
      return undefined;
    }

    const columns: SelectedColumn[] = [];
    const aggregates: AggregateColumn[] = [];
    columns.push({
      name: getTimeFieldRoundingClause(logsVolumeRequest.scopedVars, timeColumn.name),
      alias: TIME_FIELD_ALIAS,
      hint: timeColumn.hint!,
    });

    const logLevelColumn = getColumnByHint(query.builderOptions, ColumnHint.LogLevel);
    if (logLevelColumn) {
      // Generates aggregates like
      // sum(toString("log_level") IN ('dbug', 'debug', 'DBUG', 'DEBUG', 'Dbug', 'Debug')) AS debug
      const llf = `toString("${logLevelColumn.name}")`;
      let level: keyof typeof LOG_LEVEL_TO_IN_CLAUSE;
      for (level in LOG_LEVEL_TO_IN_CLAUSE) {
        aggregates.push({
          aggregateType: AggregateType.Sum,
          column: `multiSearchAny(${llf}, [${LOG_LEVEL_TO_IN_CLAUSE[level]}])`,
          alias: level,
        });
      }
    } else {
      // Count all logs if level column isn't selected
      aggregates.push({
        aggregateType: AggregateType.Count,
        column: '*',
        alias: DEFAULT_LOGS_ALIAS,
      });
    }

    const filters = (query.builderOptions.filters?.slice() || []).map((f) => {
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
      orderBy: [{ name: '', hint: timeColumn.hint!, dir: OrderByDirection.ASC }],
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

  getSupplementaryLogsSampleQuery(query: CHQuery): CHQuery | undefined {
    if (
      query.editorType !== EditorType.Builder ||
      !query.builderOptions.database ||
      query.builderOptions.table !== this.getDefaultLogsTable()
    ) {
      return undefined;
    }

    const timeColumn =
      getColumnByHint(query.builderOptions, ColumnHint.FilterTime) ||
      getColumnByHint(query.builderOptions, ColumnHint.Time);

    if (!timeColumn) {
      return undefined;
    }

    const timeHint = timeColumn.hint ?? ColumnHint.Time;

    const filters = (query.builderOptions.filters?.slice() || []).map((f) => {
      if (f.hint && !f.key) {
        const originalColumn = getColumnByHint(query.builderOptions, f.hint);
        f.key = originalColumn?.alias || originalColumn?.name || '';
      }
      return { ...f };
    });

    const defaultColumns = Array.from(this.getDefaultLogsColumns(), ([hint, name]) => ({ hint, name }));

    const columns = defaultColumns.length
      ? defaultColumns
      : (query.builderOptions.columns ?? [{ name: timeColumn.name, hint: timeHint }]);

    const logsSampleBuilderOptions: QueryBuilderOptions = {
      database: query.builderOptions.database,
      table: query.builderOptions.table,
      queryType: QueryType.Logs,
      mode: BuilderMode.List,
      filters,
      columns,
      orderBy: [{ name: '', hint: timeHint, dir: OrderByDirection.DESC }],
      limit: 100,
    };

    return {
      pluginVersion,
      editorType: EditorType.Builder,
      builderOptions: logsSampleBuilderOptions,
      rawSql: generateSql(logsSampleBuilderOptions),
      refId: '',
      format: 2, // Logs format
    };
  }

  getSupplementaryQuery(_options: SupplementaryQueryOptions, _originalQuery: CHQuery): CHQuery | undefined {
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
    return frame?.fields[1]?.values.map((text, i) => ({ text, value: ids[i] }));
  }

  applyTemplateVariables(query: CHQuery, scoped: ScopedVars, filters: AdHocVariableFilter[] = []): CHQuery {
    query = this.retargetSpanLinkTrace(query);

    let rawQuery = query.rawSql || '';
    const templateSrv = getTemplateSrv();
    const templateSrvVariables = templateSrv.getVariables() || [];

    // resolve template variables
    rawQuery = this.applyConditionalAll(rawQuery, templateSrvVariables);
    rawQuery = this.replace(rawQuery, scoped) || '';

    if (!this.skipAdHocFilter) {
      if (this.adHocFiltersStatus === AdHocFilterStatus.disabled && filters.length > 0) {
        throw new Error(
          `Unable to apply ad hoc filters. Upgrade ClickHouse to >=${this.adHocCHVerReq.major}.${this.adHocCHVerReq.minor} or remove ad hoc filters for the dashboard.`
        );
      }

      const useJSON = Boolean(templateSrvVariables.find((v) => v.name === 'clickhouse_adhoc_use_json'));

      // Check if query contains $__adHocFilters macro
      const hasMacro = /\$__adHocFilters\s*\(\s*['"](.+?)['"]\s*\)/.test(rawQuery);

      // Apply $__adHocFilters macro before automatic filter application
      rawQuery = this.applyAdHocFiltersMacro(rawQuery, filters, useJSON);

      // Only apply automatic filters if the macro was not used
      if (!hasMacro) {
        rawQuery = this.adHocFilter.apply(rawQuery, filters, useJSON);
      }
    }
    this.skipAdHocFilter = false;

    return {
      ...query,
      rawSql: rawQuery,
    };
  }

  /**
   * When a user follows a span link ("View Linked Span") in the trace view, Grafana core
   * builds the navigation target by spreading the current trace query and overriding only the
   * top-level `query` field with the linked trace id (the convention Tempo uses). The ClickHouse
   * trace-id query executes off builderOptions.meta.traceId, which is baked into rawSql and still
   * points at the originating trace, so the same trace would re-open. Detect that case and
   * regenerate rawSql for the linked trace id so the link opens the linked span's trace.
   * See https://github.com/grafana/clickhouse-datasource/issues/1889.
   */
  retargetSpanLinkTrace(query: CHQuery): CHQuery {
    if (query.editorType !== EditorType.Builder) {
      return query;
    }

    const meta = query.builderOptions.meta;
    if (!meta?.isTraceIdMode) {
      return query;
    }

    // `query` is not part of CHQuery; Grafana core sets it on the navigation target when a span
    // link is followed. Detect it with the `in` operator so the field can be read without a cast.
    if (!('query' in query)) {
      return query;
    }

    const linkedTraceId = query.query;
    if (typeof linkedTraceId !== 'string' || !/^[0-9a-fA-F]+$/.test(linkedTraceId) || linkedTraceId === meta.traceId) {
      return query;
    }

    const builderOptions: QueryBuilderOptions = {
      ...query.builderOptions,
      meta: { ...meta, traceId: linkedTraceId },
    };

    return {
      ...query,
      builderOptions,
      rawSql: generateSql(builderOptions),
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

  applyAdHocFiltersMacro(rawQuery: string, filters: AdHocVariableFilter[], useJSON = false): string {
    if (!rawQuery) {
      return rawQuery;
    }

    // Match $__adHocFilters('table_name') or $__adHocFilters("table_name") or multiple tables
    const regex = /\$__adHocFilters\s*\(([^)]+)\)/g;

    return rawQuery.replace(regex, (match, args) => {
      // Extract all table names from comma-separated quoted strings
      const tableNameRegex = /['"]([^'"]+)['"]/g;
      const tableNames: string[] = [];
      let tableMatch;

      while ((tableMatch = tableNameRegex.exec(args)) !== null) {
        tableNames.push(tableMatch[1]);
      }

      if (tableNames.length === 0) {
        return match; // Return original if no valid table names found
      }

      const filterStr = this.adHocFilter.buildFilterString(filters, useJSON);
      if (filterStr === '') {
        return 'additional_table_filters={}';
      }

      // Build filter entries for all tables
      const tableFilters = tableNames.map((tableName) => `'${tableName}': '${filterStr}'`).join(', ');
      return `additional_table_filters={${tableFilters}}`;
    });
  }

  getSupportedQueryModifications() {
    return ['ADD_FILTER', 'ADD_FILTER_OUT', 'ADD_STRING_FILTER', 'ADD_STRING_FILTER_OUT'];
  }

  // Support filtering by field value in Explore
  modifyQuery(query: CHQuery, action: QueryFixAction): CHQuery {
    if (query.editorType !== EditorType.Builder || !action.options || !action.options.value) {
      return query;
    }

    let columnName = (() => {
      const isStringFilterAction = action.type === 'ADD_STRING_FILTER' || action.type === 'ADD_STRING_FILTER_OUT';

      if (isStringFilterAction) {
        // has no key; resolve the column name from the log message hint.
        const logMessageColumn = getColumnByHint(query.builderOptions, ColumnHint.LogMessage);
        return logMessageColumn?.alias || logMessageColumn?.name || action.options.key || '';
      }

      return action.options.key || '';
    })();

    if (!columnName) {
      return query;
    }

    const actionValue = action.options.value;
    const resolved = resolveFilterColumn(query.builderOptions, columnName);

    let nextFilters: Filter[] = query.builderOptions.filters?.slice() || [];
    if (action.type === 'ADD_FILTER') {
      // we need to remove *any other EQ or NE* for the same field,
      // because we don't want to end up with two filters like `level=info` AND `level=error`
      nextFilters = nextFilters.filter(
        (f) =>
          !(
            filterMatchesColumn(f, resolved) &&
            (f.operator === FilterOperator.IsAnything ||
              f.operator === FilterOperator.Equals ||
              f.operator === FilterOperator.NotEquals)
          )
      );

      nextFilters.push(buildFilter(resolved, FilterOperator.Equals, actionValue));
    } else if (action.type === 'ADD_FILTER_OUT') {
      // with this we might want to add multiple values as NE filters
      // for example, `level != info` AND `level != debug`
      // thus, here we remove only exactly matching NE filters or an existing EQ filter for this field
      nextFilters = nextFilters.filter(
        (f) =>
          !(
            (filterMatchesColumn(f, resolved) &&
              'value' in f &&
              f.value === actionValue &&
              (f.operator === FilterOperator.IsAnything || f.operator === FilterOperator.NotEquals)) ||
            (filterMatchesColumn(f, resolved) &&
              (f.operator === FilterOperator.IsAnything || f.operator === FilterOperator.Equals))
          )
      );

      nextFilters.push(buildFilter(resolved, FilterOperator.NotEquals, actionValue));
    } else if (action.type === 'ADD_STRING_FILTER') {
      nextFilters.push({
        condition: 'AND',
        key: resolved.columnName,
        filterType: 'custom',
        type: 'string',
        operator: FilterOperator.ILike,
        value: actionValue,
      });
    } else if (action.type === 'ADD_STRING_FILTER_OUT') {
      nextFilters.push({
        condition: 'AND',
        key: resolved.columnName,
        filterType: 'custom',
        type: 'string',
        operator: FilterOperator.NotILike,
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

  queryHasFilter(query: CHQuery, filter: QueryFilterOptions): boolean {
    if (query.editorType !== EditorType.Builder) {
      return false;
    }

    const key = filter.key;
    const value = filter.value;
    // Guard on key only: an empty-string value is still a valid, filterable value.
    if (!key) {
      return false;
    }

    const resolved = resolveFilterColumn(query.builderOptions, key);
    const filters = query.builderOptions.filters || [];

    return filters.some(
      (f) =>
        filterMatchesColumn(f, resolved) &&
        f.operator === FilterOperator.Equals &&
        'value' in f &&
        String(f.value) === value
    );
  }

  toggleQueryFilter(query: CHQuery, filter: ToggleFilterAction): CHQuery {
    if (query.editorType !== EditorType.Builder) {
      return query;
    }

    const key = filter.options.key;
    const value = filter.options.value;
    // Guard on key only: an empty-string value is still a valid, filterable value.
    if (!key) {
      return query;
    }

    const resolved = resolveFilterColumn(query.builderOptions, key);
    const targetOperator = filter.type === 'FILTER_FOR' ? FilterOperator.Equals : FilterOperator.NotEquals;
    const oppositeOperator = filter.type === 'FILTER_FOR' ? FilterOperator.NotEquals : FilterOperator.Equals;

    let nextFilters: Filter[] = query.builderOptions.filters?.slice() || [];

    // Check if the exact filter already exists (toggle off)
    const exactMatchIndex = nextFilters.findIndex(
      (f) =>
        filterMatchesColumn(f, resolved) && f.operator === targetOperator && 'value' in f && String(f.value) === value
    );

    if (exactMatchIndex !== -1) {
      // Toggle off: remove the existing filter
      nextFilters.splice(exactMatchIndex, 1);
    } else {
      if (filter.type === 'FILTER_FOR') {
        // Equals targets a single value, so remove any existing IsAnything/Equals/NotEquals
        // on this column (mirrors modifyQuery's ADD_FILTER). Otherwise filtering for a new
        // value while one is already set produces contradictory filters like
        // `level = 'info' AND level = 'error'`, which match zero rows.
        nextFilters = nextFilters.filter(
          (f) =>
            !(
              filterMatchesColumn(f, resolved) &&
              (f.operator === FilterOperator.IsAnything ||
                f.operator === FilterOperator.Equals ||
                f.operator === FilterOperator.NotEquals)
            )
        );
      } else {
        // NotEquals filters can accumulate (`!= a AND != b`), so only remove the opposite
        // Equals filter at the same value.
        nextFilters = nextFilters.filter(
          (f) =>
            !(
              filterMatchesColumn(f, resolved) &&
              f.operator === oppositeOperator &&
              'value' in f &&
              String(f.value) === value
            )
        );
      }

      // Add the new filter
      nextFilters.push(buildFilter(resolved, targetOperator, value));
    }

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

    logsConfig.filterTimeColumn && result.set(ColumnHint.FilterTime, logsConfig.filterTimeColumn);
    logsConfig.timeColumn && result.set(ColumnHint.Time, logsConfig.timeColumn);
    logsConfig.levelColumn && result.set(ColumnHint.LogLevel, logsConfig.levelColumn);
    logsConfig.messageColumn && result.set(ColumnHint.LogMessage, logsConfig.messageColumn);

    return result;
  }

  shouldSelectLogContextColumns(): boolean {
    return this.settings.jsonData.logs?.selectContextColumns || false;
  }

  getLogContextColumnNames(): string[] {
    return this.settings.jsonData.logs?.contextColumns?.length ? this.settings.jsonData.logs?.contextColumns : [];
  }

  /**
   * Get configured OTEL version for logs. Returns undefined when versioning is disabled/unset.
   */
  getLogsOtelVersion(): string | undefined {
    const logConfig = this.settings.jsonData.logs;
    return logConfig?.otelEnabled ? logConfig.otelVersion || undefined : undefined;
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
    traceConfig.kindColumn && result.set(ColumnHint.TraceKind, traceConfig.kindColumn);
    traceConfig.statusCodeColumn && result.set(ColumnHint.TraceStatusCode, traceConfig.statusCodeColumn);
    traceConfig.statusMessageColumn && result.set(ColumnHint.TraceStatusMessage, traceConfig.statusMessageColumn);
    traceConfig.instrumentationLibraryNameColumn &&
      result.set(ColumnHint.TraceInstrumentationLibraryName, traceConfig.instrumentationLibraryNameColumn);
    traceConfig.instrumentationLibraryVersionColumn &&
      result.set(ColumnHint.TraceInstrumentationLibraryVersion, traceConfig.instrumentationLibraryVersionColumn);
    traceConfig.stateColumn && result.set(ColumnHint.TraceState, traceConfig.stateColumn);

    return result;
  }

  /**
   * Get configured OTEL version for traces. Returns undefined when versioning is disabled/unset.
   */
  getTraceOtelVersion(): string | undefined {
    const traceConfig = this.settings.jsonData.traces;
    return traceConfig?.otelEnabled ? traceConfig.otelVersion || undefined : undefined;
  }

  getDefaultTraceDurationUnit(): TimeUnit {
    return (this.settings.jsonData.traces?.durationUnit as TimeUnit) || TimeUnit.Nanoseconds;
  }

  getDefaultTraceFlattenNested(): boolean {
    return this.settings.jsonData.traces?.flattenNested || false;
  }

  getDefaultTraceEventsColumnPrefix(): string {
    return this.settings.jsonData.traces?.traceEventsColumnPrefix || 'Events';
  }

  getDefaultTraceLinksColumnPrefix(): string {
    return this.settings.jsonData.traces?.traceLinksColumnPrefix || 'Links';
  }

  /**
   * Returns the suffix used to locate the companion trace-timestamp index table.
   * Defaults to the OTel convention (`_trace_id_ts`) when nothing is configured
   * so the two-step trace ID lookup works out of the box for OTel users and
   * can be opted into by non-OTel users that follow the same naming convention.
   */
  getTraceTimestampTableSuffix(): string {
    return this.settings.jsonData.traces?.traceTimestampTableSuffix || otel.traceTimestampTableSuffix;
  }

  /**
   * Resolves whether the `<table>_trace_id_ts` companion exists for the given
   * (database, table). Caches the Promise so concurrent and repeat callers share
   * a single `SHOW TABLES` round-trip; on failure, evicts so the next caller
   * retries and meanwhile returns `false` (the safe, unoptimized path).
   */
  async hasTraceTimestampTable(database: string, table: string): Promise<boolean> {
    if (!database || !table) {
      return false;
    }

    const key = `${database}.${table}`;
    const now = Date.now();

    let entry = this.traceTimestampTableCache.get(key);

    if (!entry || entry.expiresAt <= now) {
      const pending = (async () => {
        try {
          const tables = await this.fetchTables(database);
          return tables.includes(table + this.getTraceTimestampTableSuffix());
        } catch {
          this.traceTimestampTableCache.delete(key);
          return false;
        }
      })();

      entry = { pending, expiresAt: now + Datasource.TRACE_TIMESTAMP_TABLE_CACHE_TTL_MS };
      this.traceTimestampTableCache.set(key, entry);

      // Record the settled value so peekTraceTimestampTable() can read it synchronously.
      const created = entry;
      pending.then((v) => {
        created.resolved = v;
      });
    }

    return entry.pending;
  }

  /**
   * Synchronously read the cached trace timestamp table result without awaiting.
   * Returns the resolved boolean when a non-expired cache entry has settled, or
   * undefined when there is no entry, it is still pending, or it has expired.
   * Lets the React hook seed its initial state from a warm cache and skip a
   * false→true render that would briefly clobber a known-good meta value.
   */
  peekTraceTimestampTable(database: string, table: string): boolean | undefined {
    if (!database || !table) {
      return undefined;
    }
    const entry = this.traceTimestampTableCache.get(`${database}.${table}`);
    if (!entry || entry.expiresAt <= Date.now()) {
      return undefined;
    }
    return entry.resolved;
  }

  /**
   * Get the TraceId column name from traces configuration
   * Used when creating logs filter to correlate with trace data
   */
  getTracesTraceIdColumn(): string | undefined {
    const traceConfig = this.settings.jsonData.traces;
    if (!traceConfig) {
      return undefined;
    }

    const otelEnabled = traceConfig.otelEnabled;
    const otelVersion = traceConfig.otelVersion;

    const otelConfig = otel.getVersion(otelVersion);
    if (otelEnabled && otelConfig) {
      return otelConfig.traceColumnMap.get(ColumnHint.TraceId);
    }

    return traceConfig.traceIdColumn;
  }

  async fetchDatabases(): Promise<string[]> {
    return this.fetchData('SHOW DATABASES');
  }

  async fetchTables(db?: string): Promise<string[]> {
    const rawSql = db ? `SHOW TABLES FROM "${db}"` : 'SHOW TABLES';
    return this.fetchData(rawSql);
  }

  /**
   * Whether the Map-key discovery probe is enabled. Defaults to true.
   * When false, `fetchUniqueMapKeys` resolves to an empty list and adhoc
   * tag-key expansion skips the fan-out.
   */
  private isMapKeysDiscoveryEnabled(): boolean {
    return this.settings.jsonData.enableMapKeysDiscovery ?? true;
  }

  /**
   * When the (db, table) matches the configured OTel logs or traces table,
   * returns a time-column name suitable for bounding the Map-key probe.
   * Returns undefined for free-form tables where the plugin can't know which
   * column is the time column — those continue to use the bare LIMIT probe.
   */
  private getMapKeyProbeTimeColumn(db: string, table: string): string | undefined {
    const logsDb = this.getDefaultLogsDatabase();
    const logsTable = this.getDefaultLogsTable();
    if (logsDb === db && logsTable === table) {
      const cols = this.getDefaultLogsColumns();
      const t = cols.get(ColumnHint.FilterTime) || cols.get(ColumnHint.Time);
      if (t) {
        return t;
      }
    }
    const tracesDb = this.getDefaultTraceDatabase();
    const tracesTable = this.getDefaultTraceTable();
    if (tracesDb === db && tracesTable === table) {
      const cols = this.getDefaultTraceColumns();
      const t = cols.get(ColumnHint.Time);
      if (t) {
        return t;
      }
    }
    return undefined;
  }

  /**
   * Used to populate suggestions in the filter editor for Map columns.
   *
   * Samples rows to get a unique set of keys for the map. May not include ALL
   * keys for a given dataset.
   *
   * When the target matches the configured OTel logs/traces table, the probe
   * is bounded to the last 6 hours via the known time column — on a
   * partitioned-by-day MergeTree this prunes to a handful of parts and avoids
   * full-column scans (see #1843). For free-form tables the predicate is
   * omitted because the plugin doesn't know which column is the time column.
   */
  async fetchUniqueMapKeys(mapColumn: string, db: string, table: string): Promise<string[]> {
    if (!this.isMapKeysDiscoveryEnabled()) {
      return [];
    }
    const timeColumn = this.getMapKeyProbeTimeColumn(db, table);
    const whereClause = timeColumn ? ` WHERE ${escapeIdentifier(timeColumn)} >= now() - INTERVAL 6 HOUR` : '';
    const rawSql = `SELECT DISTINCT arrayJoin(${escapeIdentifier(mapColumn)}.keys) as keys FROM ${escapeIdentifier(db)}.${escapeIdentifier(table)}${whereClause} LIMIT 1000`;
    return this.fetchData(rawSql);
  }

  async fetchUniqueJSONPaths(jsonColumn: string, db: string, table: string, keysColumn?: string): Promise<string[]> {
    const rawSql = keysColumn
      ? `SELECT DISTINCT arrayJoin(${escapeIdentifier(keysColumn)}) as path FROM ${escapeIdentifier(db)}.${escapeIdentifier(table)} LIMIT 1000`
      : `SELECT DISTINCT arrayJoin(JSONAllPaths(${escapeIdentifier(jsonColumn)})) as path FROM ${escapeIdentifier(db)}.${escapeIdentifier(table)} LIMIT 1000`;
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
  async fetchPathsForJSONColumns(
    database: string | undefined,
    table: string,
    jsonColumnName: string
  ): Promise<TableColumn[]> {
    const prefix = Boolean(database) ? `"${database}".` : '';
    const rawSql = `SELECT arrayJoin(distinctJSONPathsAndTypes(${jsonColumnName})) FROM ${prefix}"${table}" SETTINGS max_execution_time=10`;
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

      const kv = typeof x[0] === 'string' ? JSON.parse(x[0]) : x[0];
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
      });
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
    const columns: TableColumn[] = view.map((item) => ({
      name: item[0],
      type: item[1],
      label: item[0],
      picklistValues: [],
    }));

    return columns;

    // TODO: wait for JSON function perf improvements
    // const results = await Promise.all(
    //   columns
    //     .filter((c) => c.type.startsWith('JSON'))
    //     .map((c) => this.fetchPathsForJSONColumns(database, table, c.name))
    // );
    // return [...columns, ...results.flat()];
  }

  /**
   * Fetches SQL functions from server.
   */
  async fetchSqlFunctions(): Promise<SqlFunction[]> {
    const rawSql = `
      SELECT
        name, is_aggregate, case_insensitive, alias_to, origin, description,
        syntax, arguments, returned_value, examples, categories
      FROM system.functions
      LIMIT 10000
    `;
    const frame = await this.runQuery({ rawSql });
    if (frame.fields?.length === 0) {
      return [];
    }
    const view = new DataFrameView(frame);
    const sqlFunctions: SqlFunction[] = view.map((item) => ({
      name: String(item[0]),
      isAggregate: Boolean(item[1]),
      caseInsensitive: Boolean(item[2]),
      aliasTo: String(item[3]),
      origin: String(item[4]),
      description: String(item[5]),
      syntax: String(item[6]),
      arguments: String(item[7]),
      returnedValue: String(item[8]),
      examples: String(item[9]),
      categories: String(item[10]),
    }));

    return sqlFunctions;
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
    return view.map((item) => ({
      name: item[1],
      type: item[2],
      label: item[0],
      picklistValues: [],
    }));
  }

  getAliasTable(targetDatabase: string | undefined, targetTable: string): string | null {
    const aliasEntries = this.settings?.jsonData?.aliasTables || [];
    const matchedEntry =
      aliasEntries.find((e) => {
        const matchDatabase = !e.targetDatabase || e.targetDatabase === targetDatabase;
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

  private readonly _columnCache = new Map<string, TableColumn[]>();

  /**
   * Returns columns for the given table, reusing a cached result when available.
   * The cache lives for the lifetime of the datasource instance, which is reset on
   * config save or page reload — short enough that stale schema is not a concern.
   */
  async getColumnsCached(database: string | undefined, table: string): Promise<TableColumn[]> {
    const key = `${database ?? ''}\0${table}`;
    if (!this._columnCache.has(key)) {
      this._columnCache.set(key, await this.fetchColumns(database, table));
    }
    return this._columnCache.get(key)!;
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

  filterQuery(query: CHQuery): boolean {
    return !query.hide;
  }

  query(request: DataQueryRequest<CHQuery>): Observable<DataQueryResponse> {
    const targets = request.targets.map((t) => ({
      ...t,
      meta: {
        ...t?.meta,
        timezone: this.getTimezone(request),
      },
    }));

    const hasLogsVolumeTargets = targets.some((t) => t.refId?.startsWith(Datasource.logVolumePrefix));

    return super
      .query({
        ...request,
        targets,
      })
      .pipe(
        concatMap(async (res: DataQueryResponse) => {
          const transformed = await transformQueryResponseWithTraceAndLogLinks(this, request, res);
          if (hasLogsVolumeTargets) {
            return { ...transformed, data: splitLogsVolumeFrames(transformed.data, Datasource.logVolumePrefix) };
          }
          return transformed;
        })
      );
  }

  private runQuery(request: Partial<CHQuery>, options?: any): Promise<DataFrame> {
    return new Promise((resolve) => {
      const req = {
        targets: [{ ...request, refId: String(Math.random()) }],
        range: options ? options.range : (getTemplateSrv() as any).timeRange,
        scopedVars: options?.scopedVars,
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
    const view = new DataFrameView<{ 0: string; 1: string; 2: string }>(frame);
    const hideTableName = this.settings.jsonData.hideTableNameInAdhocFilters || false;

    // First pass: flat list of tag keys as before. Second pass (below)
    // expands Map-typed columns into one entry per discovered map key.
    const keys: MetricFindValue[] = view.map((item) => ({
      text: hideTableName ? item[0] : `${item[2]}.${item[0]}`,
    }));

    // Collect Map columns per-table and populate both the datasource cache
    // (consumed by fetchTagValuesFromSchema) and the AdHocFilter cache
    // (consumed by escapeKey). Done regardless of whether Map expansion is
    // feasible for this context — the caches are used even when expansion
    // bails out.
    this.mapColumnsByTable = new Map();
    const mapCols: Array<{ name: string; table: string }> = [];
    view.forEach((item) => {
      if (isMapColumnType(item[1])) {
        const tableKey = item[2];
        let set = this.mapColumnsByTable.get(tableKey);
        if (!set) {
          set = new Set<string>();
          this.mapColumnsByTable.set(tableKey, set);
        }
        set.add(item[0]);
        mapCols.push({ name: item[0], table: item[2] });
      }
    });

    // Republish the flattened Map-column set to the AdHocFilter so its
    // escapeKey can disambiguate `col.key` references.
    const allMapCols = new Set<string>();
    for (const set of this.mapColumnsByTable.values()) {
      for (const c of set) {
        allMapCols.add(c);
      }
    }
    this.adHocFilter.setMapColumns(allMapCols);

    // Map-key expansion only runs when the adhoc context points at a
    // specific `db.table` — otherwise we'd need to probe every table in a
    // database, which is too expensive to do on every dashboard render.
    // The same opt-out that disables the per-filter probe also short-circuits
    // this fan-out, so disabling the setting kills *all* probe traffic.
    const db = this.resolveAdhocDatabase(frame);
    const singleTable = this.resolveAdhocSingleTable();
    if (!db || !singleTable || mapCols.length === 0 || !this.isMapKeysDiscoveryEnabled()) {
      return keys;
    }

    // Only probe Map columns that belong to the targeted table.
    const probeTargets = mapCols.filter((c) => c.table === singleTable);
    if (probeTargets.length === 0) {
      return keys;
    }

    const probed = await Promise.all(
      probeTargets.map(async (c) => {
        try {
          const mapKeys = await this.fetchUniqueMapKeys(c.name, db, c.table);
          return { col: c, keys: mapKeys };
        } catch (ex) {
          console.warn(`Failed to fetch map keys for ${db}.${c.table}.${c.name}:`, ex);
          return { col: c, keys: [] as string[] };
        }
      })
    );

    // Replace each top-level Map-column entry with one entry per discovered
    // map key. If probing returned nothing (empty set, stripped by the
    // filter), keep the original entry as a no-op fallback.
    const expandedKeyByCol = new Map<string, string[]>();
    for (const p of probed) {
      if (p.keys.length > 0) {
        expandedKeyByCol.set(p.col.name, p.keys);
      }
    }
    if (expandedKeyByCol.size === 0) {
      return keys;
    }

    const expanded: MetricFindValue[] = [];
    view.forEach((item) => {
      const col = item[0];
      const table = item[2];
      const baseText = hideTableName ? col : `${table}.${col}`;
      const mapKeys = expandedKeyByCol.get(col);
      if (!mapKeys || table !== singleTable) {
        expanded.push({ text: baseText });
        return;
      }
      for (const k of mapKeys) {
        expanded.push({ text: `${baseText}.${k}` });
      }
    });
    return expanded;
  }

  /**
   * The `$clickhouse_adhoc_query` template variable may resolve to a bare
   * database name or `db.table`. This returns the database component, or
   * undefined when we can't derive one (free-form SELECT variable, etc.).
   */
  private resolveAdhocDatabase(_frame: DataFrame): string | undefined {
    const source = getTemplateSrv().replace('$clickhouse_adhoc_query');
    const defaultDatabase = this.getDefaultDatabase();
    const raw = source === '$clickhouse_adhoc_query' ? defaultDatabase : source;
    if (!raw || raw.toLowerCase().startsWith('select')) {
      return defaultDatabase;
    }
    return raw.includes('.') ? raw.split('.')[0] : raw;
  }

  /**
   * Returns the table name when the adhoc source resolves to a specific
   * `db.table`. Returns undefined when the source is a bare database or a
   * free-form SELECT, since we can't safely probe Map keys across many
   * tables without a dramatic fan-out.
   */
  private resolveAdhocSingleTable(): string | undefined {
    const source = getTemplateSrv().replace('$clickhouse_adhoc_query');
    const raw = source === '$clickhouse_adhoc_query' ? this.getDefaultDatabase() : source;
    if (!raw || raw.toLowerCase().startsWith('select')) {
      return undefined;
    }
    return raw.includes('.') ? raw.split('.')[1] : undefined;
  }

  async getTagValues({ key }: any): Promise<MetricFindValue[]> {
    const { type } = this.getTagSource();
    this.skipAdHocFilter = true;
    if (type === TagType.query) {
      return this.fetchTagValuesFromQuery(key);
    }
    return this.fetchTagValuesFromSchema(key);
  }

  private fieldValuesToMetricFindValues(field: Field): MetricFindValue[] {
    // Convert to string to avoid https://github.com/grafana/grafana/issues/12209
    return field.values
      .filter((value) => value !== null)
      .map((value) => {
        return { text: String(value) };
      });
  }

  private async fetchTagValuesFromSchema(key: string): Promise<MetricFindValue[]> {
    const { from } = this.getTagSource();
    const hideTableName = this.settings.jsonData.hideTableNameInAdhocFilters || false;

    let col: string;
    let source: string;

    if (hideTableName && from) {
      // When hideTableNameInAdhocFilters is true, key is just the column name (e.g., 'bar')
      col = key;
      source = from;
    } else {
      // When hideTableNameInAdhocFilters is false, key is 'table.column' format (e.g., 'foo.bar')
      const [table, ...colParts] = key.split('.');
      col = colParts.join('.');
      source = from?.includes('.') ? `${from.split('.')[0]}.${table}` : table;
    }

    // If `col` is of the form `<mapCol>.<mapKey>` and <mapCol> is known to
    // be a Map-typed column, rewrite to bracket-access so the SELECT pulls
    // distinct Map values rather than stringified Map objects (which the
    // Grafana frame layer renders as `[object Object]`). The map key is
    // escaped for CH string-literal embedding so that keys containing `'`
    // or `\` produce valid SQL.
    const mapAccess = this.asMapAccess(col, source);
    const selectExpr = mapAccess ? `${mapAccess.column}['${escapeCHStringLiteral(mapAccess.key)}']` : col;

    const rawSql = `select distinct ${selectExpr} from ${source} limit 1000`;
    const frame = await this.runQuery({ rawSql });
    if (frame.fields?.length === 0) {
      return [];
    }
    const field = frame.fields[0];
    return this.fieldValuesToMetricFindValues(field);
  }

  /**
   * Parses a dotted tag key and returns `{column, key}` when the leading
   * segment refers to a Map-typed column in the given source. The source
   * may be either `db.table` or a bare table name — we strip the `db.`
   * prefix before lookup so the per-table cache (keyed by bare table name)
   * is hit, rather than always falling back to the flattened union.
   */
  private asMapAccess(col: string, source: string): { column: string; key: string } | undefined {
    if (!col.includes('.')) {
      return undefined;
    }
    const parts = col.split('.');
    const tableKey = source.includes('.') ? source.split('.')[1] : source;
    const mapCols = this.mapColumnsByTable.get(tableKey) ?? this.getFlatMapColumnSet();
    if (!mapCols.has(parts[0])) {
      return undefined;
    }
    return { column: parts[0], key: parts.slice(1).join('.') };
  }

  private getFlatMapColumnSet(): Set<string> {
    const flat = new Set<string>();
    for (const set of this.mapColumnsByTable.values()) {
      for (const c of set) {
        flat.add(c);
      }
    }
    return flat;
  }

  private async fetchTagValuesFromQuery(key: string): Promise<MetricFindValue[]> {
    const tagSource = this.getTagSource();

    // Check if the query contains the $__adhoc_column macro
    if (tagSource.source && tagSource.source.includes('$__adhoc_column')) {
      // Replace the macro with the actual column name
      const queryWithColumn = tagSource.source.replace(/\$__adhoc_column/g, key);
      this.skipAdHocFilter = true;
      const frame = await this.runQuery({ rawSql: queryWithColumn });

      if (frame.fields?.length === 0) {
        return [];
      }

      const field = frame.fields[0];
      return this.fieldValuesToMetricFindValues(field);
    }

    // Fallback to the original behavior
    const { frame } = await this.fetchTags();
    const field = frame.fields.find((f) => f.name === key);
    if (field) {
      return this.fieldValuesToMetricFindValues(field);
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
      // Check if the query contains the $__adhoc_column macro
      if (tagSource.source.includes('$__adhoc_column')) {
        // Extract table name from the query and get column list from system.columns
        const tableName = this.extractTableNameFromQuery(tagSource.source);
        if (tableName) {
          this.adHocFilter.setTargetTableFromQuery(tagSource.source.replace(/\$__adhoc_column/g, '*'));

          // Parse database.table format
          const parts = tableName.split('.');
          let query: string;
          if (parts.length === 2) {
            const [db, table] = parts;
            query = `SELECT name, type, table FROM system.columns WHERE database = '${db}' AND table = '${table}'`;
          } else {
            query = `SELECT name, type, table FROM system.columns WHERE table = '${tableName}'`;
          }
          const results = await this.runQuery({ rawSql: query });
          return { type: TagType.schema, frame: results };
        }
      } else {
        this.adHocFilter.setTargetTableFromQuery(tagSource.source);
      }
    }

    const results = await this.runQuery({ rawSql: tagSource.source });
    return { type: tagSource.type, frame: results };
  }

  private extractTableNameFromQuery(query: string): string | null {
    // Try to extract table name from FROM clause
    // Supports formats: FROM table, FROM database.table, FROM "database"."table"
    const fromMatch = query.match(/FROM\s+(?:"?(\w+)"?\.)?"?(\w+)"?/i);
    if (fromMatch) {
      const database = fromMatch[1];
      const table = fromMatch[2];
      return database ? `${database}.${table}` : table;
    }
    return null;
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
      const isMapKey = columnName.includes("['") && columnName.includes("']");
      let mapName = '';
      let keyName = '';
      if (isMapKey) {
        mapName = columnName.substring(0, columnName.indexOf('['));
        keyName = columnName.substring(columnName.indexOf("['") + 2, columnName.lastIndexOf("']"));
      }

      const field = row.dataFrame.fields.find(
        (f) =>
          // exact column name match
          f.name === columnName ||
          (isMapKey &&
            // entire map was selected
            (f.name === mapName ||
              // single key was selected from map
              f.name === `arrayElement(${mapName}, '${keyName}')` ||
              f.name === 'labels'))
      );
      if (!field) {
        continue;
      }

      let value = field.values[row.rowIndex];
      if (value && field.type === 'other' && isMapKey) {
        // Extract merged Resource/Log Attributes from "labels"
        if (field.name === labelsFieldName) {
          value = value[`${mapName}.${keyName}`];
        } else {
          value = value[keyName];
        }
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
        value,
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
  async getLogRowContext(
    row: LogRowModel,
    options?: LogRowContextOptions,
    query?: CHQuery | undefined,
    cacheFilters?: boolean
  ): Promise<DataQueryResponse> {
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

    const timeColumn =
      getColumnByHint(builderOptions, ColumnHint.FilterTime) || getColumnByHint(builderOptions, ColumnHint.Time);
    if (!timeColumn) {
      throw new Error('Missing time column for log context');
    }

    // Preserve the user's secondary ORDER BY (e.g. `offset ASC` alongside
    // `timestamp DESC`) so rows with identical timestamps keep their
    // stable order in the log-context view. The time column is forced to
    // the front because context pagination uses it; the user's remaining
    // ORDER BY entries ride along as tiebreakers. Drop any existing entry
    // that targets the same time column to avoid duplicating it. See #1293.
    const originalOrderBy = builderOptions.orderBy ?? [];
    builderOptions.orderBy = [];
    builderOptions.orderBy.push({
      name: '',
      hint: timeColumn.hint!,
      dir: options.direction === LogRowContextQueryDirection.Forward ? OrderByDirection.ASC : OrderByDirection.DESC,
    });
    for (const entry of originalOrderBy) {
      const targetsTimeColumn =
        entry.hint === ColumnHint.Time ||
        entry.hint === ColumnHint.FilterTime ||
        (!!entry.name && entry.name === timeColumn.name);
      if (targetsTimeColumn) {
        continue;
      }
      builderOptions.orderBy.push(entry);
    }

    builderOptions.filters = [];
    builderOptions.filters.push({
      operator:
        options.direction === LogRowContextQueryDirection.Forward
          ? FilterOperator.GreaterThanOrEqual
          : FilterOperator.LessThanOrEqual,
      filterType: 'custom',
      hint: timeColumn.hint!,
      key: '',
      value: `fromUnixTimestamp64Nano(${row.timeEpochNs})`,
      type: 'datetime',
      condition: 'AND',
    });

    const contextColumns = this.getLogContextColumnsFromLogRow(row);
    if (contextColumns.length < 1) {
      throw new Error('Unable to match any log context columns');
    }

    const contextColumnFilters: Filter[] = contextColumns.map((c) => ({
      operator: FilterOperator.Equals,
      filterType: 'custom',
      key: c.name,
      value: c.value,
      type: 'string',
      condition: 'AND',
    }));
    builderOptions.filters.push(...contextColumnFilters);

    contextQuery.rawSql = generateSql(builderOptions);
    const req = {
      targets: [contextQuery],
    } as DataQueryRequest<CHQuery>;

    // Surface the underlying ClickHouse error instead of letting Grafana
    // wrap it in the generic "Error loading more logs" banner. The observable
    // returned by `this.query(req)` can reject with a structured error or emit
    // a `DataQueryResponse` with a populated `errors`/`error` field. In both
    // cases we want the original server message to reach the user. See #1362.
    let response: DataQueryResponse;
    try {
      response = await firstValueFrom(this.query(req));
    } catch (err) {
      const detail = this.extractQueryErrorMessage(err);
      throw new Error(detail ? `Log context query failed: ${detail}` : 'Log context query failed');
    }

    const responseError = response?.errors?.find((e) => !!e?.message)?.message;
    if (responseError) {
      throw new Error(`Log context query failed: ${responseError}`);
    }

    return response;
  }

  private extractQueryErrorMessage(err: unknown): string | undefined {
    if (!err) {
      return undefined;
    }
    if (typeof err === 'string') {
      return err;
    }
    if (typeof err === 'object') {
      const anyErr = err as { data?: { message?: string }; message?: string; statusText?: string };
      return anyErr.data?.message || anyErr.message || anyErr.statusText;
    }
    return undefined;
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
  getLogRowContextUi(
    row: LogRowModel,
    runContextQuery?: (() => void) | undefined,
    query?: CHQuery | undefined
  ): ReactNode {
    const contextColumns = this.getLogContextColumnsFromLogRow(row);
    return createReactElement(LogsContextPanel, { columns: contextColumns, datasourceUid: this.uid });
  }

  // interface DataSourceWithLogsLabelTypesSupport
  /**
   * Groups log fields in the Logs Details panel by OTel attribute layer.
   * The Go backend (`mergeOpenTelemetryLabels` in pkg/plugin/driver.go)
   * flattens ResourceAttributes / ScopeAttributes / LogAttributes Map
   * columns into a single `labels` JSON field with prefixed keys
   * (e.g. "ResourceAttributes.service.name"). This method tells Grafana
   * how to bucket those keys into named, collapsible sections.
   *
   * Returning null leaves the field under Grafana's default "Fields"
   * section. Filtering is unaffected: `modifyQuery` already splits the
   * same prefix back when a user clicks "Filter for value", so the
   * visual grouping and the filter routing stay aligned.
   *
   * Strings are plain English; the plugin codebase does not currently
   * use `@grafana/i18n`, so a future i18n pass would localize these
   * alongside the rest of the plugin's UI strings.
   */
  getLabelDisplayTypeFromFrame(labelKey: string, _frame: DataFrame | undefined, _index: number | null): string | null {
    if (labelKey.startsWith('ResourceAttributes.')) {
      return 'Resource attributes';
    }
    if (labelKey.startsWith('ScopeAttributes.')) {
      return 'Scope attributes';
    }
    if (labelKey.startsWith('LogAttributes.')) {
      return 'Log attributes';
    }
    return null;
  }

  async testDatasource(): Promise<{ status: string; message: string }> {
    const result = await this.callHealthCheck();
    if (result.status !== 'OK') {
      const category = parseConnectionErrorCategory(result.message);
      trackClickhouseHealthCheckFailed({
        error_category: category,
        protocol: this.settings.jsonData.protocol ?? 'native',
      });
      const detail = result.message.replace(/^\[\w+\]\s*/, '');
      const hint = getConnectionErrorHint(category, detail);
      const label = category === 'tls' ? 'TLS' : category.charAt(0).toUpperCase() + category.slice(1);
      return {
        status: 'error',
        message: hint ? `${label} error [${detail}]: ${hint}` : result.message,
      };
    }
    return { status: 'success', message: result.message };
  }
}

// parseConnectionErrorCategory extracts the error category embedded by the backend in
// health check failure messages of the form "[category] original error message".
function parseConnectionErrorCategory(message: string): string {
  const match = message?.match(/^\[(\w+)\]/);
  return match ? match[1] : 'unknown';
}

const CONNECTION_ERROR_HINTS: Record<string, string> = {
  auth: 'Verify your credentials and that the user has the required permissions in ClickHouse.',
  network:
    'Check that the host and port are correct and that the ClickHouse server is reachable from the machine running Grafana.',
  tls: 'Verify your TLS certificate configuration. If using a self-signed certificate, ensure the CA certificate is configured.',
  timeout:
    'Check that the ClickHouse server is reachable and consider increasing the dial timeout in the connection settings.',
  config: 'Check that all required fields are correctly filled in.',
};

function getConnectionErrorHint(category: string, detail: string): string | undefined {
  if (category === 'tls' && detail.includes('first record does not look like a TLS handshake')) {
    return 'The server does not appear to be using TLS. Try disabling the secure connection toggle.';
  }
  return CONNECTION_ERROR_HINTS[category];
}

enum TagType {
  query,
  schema,
}

/**
 * Returns true when a ClickHouse type string describes a Map column
 * (including `Nullable(Map(...))` and `LowCardinality(Map(...))` wrappers
 * that callers may reasonably encounter).
 */
function isMapColumnType(type: string | undefined): boolean {
  if (!type) {
    return false;
  }
  return /^(?:Nullable\(|LowCardinality\()?Map\(/.test(type);
}

// Escape a string for embedding inside a single-quoted ClickHouse string
// literal: backslash and single quote are the only characters that need
// escaping. Use when interpolating an untrusted identifier (e.g. a Map key
// from system.columns) into raw SQL.
export function escapeCHStringLiteral(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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
