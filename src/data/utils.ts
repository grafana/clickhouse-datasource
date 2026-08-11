import { CoreApp, DataFrame, DataQueryRequest, DataQueryResponse, FieldConfig, FieldType, TimeRange } from '@grafana/data';
import {
  BuilderMode,
  ColumnHint,
  Filter,
  FilterOperator,
  OrderByDirection,
  QueryBuilderOptions,
  QueryType,
  SelectedColumn,
  StringFilter,
  TableColumn,
} from 'types/queryBuilder';
import { CHBuilderQuery, CHQuery, EditorType } from 'types/sql';
import { isCollectionColumnType } from 'components/queryBuilder/views/columnNameHeuristics';
import { Datasource } from './CHDatasource';
import { pluginVersion } from 'utils/version';
import { generateSql, JSON_SENTINEL_KEY } from './sqlGenerator';
import { getDefaultLogsFilters } from 'components/queryBuilder/defaultQueryOptions';
import otel from 'otel';

/**
 * Resolves the QueryBuilderOptions for a query regardless of editor type. Builder queries
 * store them at the top level; raw-SQL queries keep a converted copy under `meta.builderOptions`
 * (and may have none at all — e.g. a hand-written, provisioned, or migrated SQL query).
 * Returns undefined when absent, so callers must treat the result as optional.
 */
export const getBuilderOptions = (query?: CHQuery): QueryBuilderOptions | undefined => {
  if (!query) {
    return undefined;
  }
  return query.editorType === EditorType.Builder ? query.builderOptions : query.meta?.builderOptions;
};

/**
 * Returns true if the builder options contain enough information to start showing a query
 */
export const isBuilderOptionsRunnable = (builderOptions: QueryBuilderOptions): boolean => {
  return (
    (builderOptions.columns?.length || 0) > 0 ||
    (builderOptions.filters?.length || 0) > 0 ||
    (builderOptions.orderBy?.length || 0) > 0 ||
    (builderOptions.aggregates?.length || 0) > 0 ||
    (builderOptions.groupBy?.length || 0) > 0
  );
};

/**
 * Converts QueryBuilderOptions to Grafana format
 * src: https://github.com/grafana/sqlds/blob/main/query.go#L20
 */
export const mapQueryBuilderOptionsToGrafanaFormat = (t?: QueryBuilderOptions): number => {
  switch (t?.queryType) {
    case QueryType.Table:
      return 1;
    case QueryType.Logs:
      return 2;
    case QueryType.TimeSeries:
      return 0;
    case QueryType.Traces:
      return t.meta?.isTraceIdMode ? 3 : 1;
    default:
      return 1 << 8; // an unused u32, defaults to timeseries/graph on plugin backend.
  }
};

/**
 * Converts QueryType to Grafana format
 * src: https://github.com/grafana/sqlds/blob/main/query.go#L20
 */
export const mapQueryTypeToGrafanaFormat = (t?: QueryType): number => {
  switch (t) {
    case QueryType.Table:
      return 1;
    case QueryType.Logs:
      return 2;
    case QueryType.TimeSeries:
      return 0;
    case QueryType.Traces:
      return 3;
    default:
      return 1 << 8; // an unused u32, defaults to timeseries/graph on plugin backend.
  }
};

/**
 * Converts Grafana format to builder QueryType
 * src: https://github.com/grafana/sqlds/blob/main/query.go#L20
 */
export const mapGrafanaFormatToQueryType = (f?: number): QueryType => {
  switch (f) {
    case 0:
      return QueryType.TimeSeries;
    case 1:
      return QueryType.Table;
    case 2:
      return QueryType.Logs;
    case 3:
      return QueryType.Traces;
    default:
      return QueryType.Table;
  }
};

/**
 * Manipulates column array in-place to include column hints, loosely matched by the provided column hint map.
 */
export const tryApplyColumnHints = (columns: SelectedColumn[], hintsToColumns?: Map<ColumnHint, string>) => {
  const columnsToHints: Map<string, ColumnHint> = new Map();
  if (hintsToColumns) {
    hintsToColumns.forEach((name, hint) => {
      columnsToHints.set(name.toLowerCase().trim(), hint);
    });
  }

  for (const column of columns) {
    if (column.hint) {
      continue;
    }

    const name = column.name.toLowerCase().trim();
    const alias = column.alias?.toLowerCase().trim() || '';

    const hint = columnsToHints.get(name) || columnsToHints.get(alias);
    if (hint) {
      column.hint = hint;
      continue;
    }

    if (name.includes('time')) {
      column.hint = ColumnHint.Time;
    }
  }
};

/**
 * Converts label into sql-style column name.
 * Example: "Test Column" -> "test_column"
 */
export const columnLabelToPlaceholder = (label: string) => label.toLowerCase().replace(/ /g, '_');

/**
 * Field config map for trace search result columns.
 * Maps column name (lowercase) to Grafana FieldConfig for better default display.
 */
const traceSearchFieldConfigs: Record<string, FieldConfig> = {
  duration: {
    unit: 'ms',
    displayName: 'Duration',
  },
  starttime: {
    displayName: 'Start Time',
  },
  servicename: {
    displayName: 'Service Name',
  },
  operationname: {
    displayName: 'Operation Name',
  },
  traceid: {
    displayName: 'Trace ID',
  },
};

/**
 * Applies field configs to trace search result frames for better default display.
 * Trace search results are table-format frames from trace queries (non-traceIdMode).
 */
export const applyTraceSearchFieldConfig = (req: DataQueryRequest<CHQuery>, res: DataQueryResponse): void => {
  res.data.forEach((frame: DataFrame) => {
    const originalQuery = req.targets.find((t) => t.refId === frame.refId);
    if (!originalQuery) {
      return;
    }

    const isTraceSearch =
      originalQuery.editorType === EditorType.Builder &&
      originalQuery.builderOptions.queryType === QueryType.Traces &&
      !originalQuery.builderOptions.meta?.isTraceIdMode;

    if (!isTraceSearch) {
      return;
    }

    frame.fields.forEach((field) => {
      const fieldConfig = traceSearchFieldConfigs[field.name.toLowerCase()];
      if (fieldConfig) {
        field.config = {
          ...field.config,
          ...fieldConfig,
        };
      }
    });
  });
};

// Flattens a nested object into [{key,value}] pairs using dot-notation for nested keys.
// ClickHouse JSON type turns "http.method" into {"http":{"method":"GET"}}, so a single
// Object.entries() call would yield "[object Object]" for the value.
const flattenJsonTags = (
  obj: Record<string, unknown>,
  prefix = '',
  depth = 0
): Array<{ key: string; value: string }> => {
  if (depth >= 6) {
    return [{ key: prefix || '(truncated)', value: JSON.stringify(obj) }];
  }
  return Object.entries(obj).flatMap(([k, v]) => {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v)) {
      return flattenJsonTags(v as Record<string, unknown>, fullKey, depth + 1);
    }
    // Arrays are left as-is via String(v) (e.g. "a,b,c") — ClickHouse JSON type
    // does not produce array attribute values in standard OTel schemas.
    return [{ key: fullKey, value: v !== null && v !== undefined ? String(v) : '' }];
  });
};

/**
 * Converts plain JSON objects returned by ClickHouse JSON-type tag columns into the
 * `[{key:"k",value:"v"},...]` array that Grafana's trace panel expects for `tags` and
 * `serviceTags` fields.
 *
 * Needed for both raw-SQL and builder queries with JSON-type columns. Builder queries
 * with Map-type columns already receive correctly-shaped `[{key,value}]` arrays from
 * the SQL generator, so those frames are skipped by the Array.isArray check below.
 * Auto-detects whether values are plain objects (need conversion) or already arrays.
 */
const expandJsonSentinel = (fields: Array<{ key: string; value: string }>): Array<{ key: string; value: string }> =>
  fields.flatMap((f) => {
    if (f.key !== JSON_SENTINEL_KEY) {
      return [f];
    }
    try {
      const parsed = JSON.parse(f.value);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return flattenJsonTags(parsed as Record<string, unknown>);
      }
    } catch {}
    return [f];
  });

export const transformTraceTagFields = (req: DataQueryRequest<CHQuery>, res: DataQueryResponse): void => {
  res.data.forEach((frame: DataFrame) => {
    const originalQuery = req.targets.find((t) => t.refId === frame.refId);

    // For builder queries use the queryType directly — it's authoritative and avoids
    // false-positive matches on non-trace tables that happen to have a 'traceID' column.
    // For raw SQL we fall back to a field-name heuristic since there's no queryType.
    let isTraceFrame: boolean;
    if (originalQuery?.editorType === EditorType.Builder) {
      isTraceFrame = originalQuery.builderOptions?.queryType === QueryType.Traces;
    } else {
      isTraceFrame = frame.fields.some(
        (f) => f.name.toLowerCase() === 'traceid' || f.name.toLowerCase() === 'trace_id'
      );
    }
    if (!isTraceFrame) {
      return;
    }

    frame.fields.forEach((field) => {
      if (field.name === 'tags' || field.name === 'serviceTags') {
        // Skip if values are already [{key,value}] arrays rather than plain objects.
        const firstNonNull = (field.values as unknown[]).find((v) => v !== null && v !== undefined);
        if (firstNonNull === undefined || Array.isArray(firstNonNull) || typeof firstNonNull !== 'object') {
          return;
        }
        field.values = (field.values as unknown[]).map((value) => {
          if (value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)) {
            return flattenJsonTags(value as Record<string, unknown>);
          }
          return value;
        });
      } else if (field.name === 'logs') {
        field.values = (field.values as unknown[]).map((events) => {
          if (!Array.isArray(events)) {
            return events;
          }
          return events.map((event: unknown) => {
            const e = event as Record<string, unknown>;
            if (!Array.isArray(e?.fields)) {
              return event;
            }
            return { ...e, fields: expandJsonSentinel(e.fields as Array<{ key: string; value: string }>) };
          });
        });
      } else if (field.name === 'references') {
        field.values = (field.values as unknown[]).map((links) => {
          if (!Array.isArray(links)) {
            return links;
          }
          return links.map((link: unknown) => {
            const l = link as Record<string, unknown>;
            if (!Array.isArray(l?.tags)) {
              return link;
            }
            return { ...l, tags: expandJsonSentinel(l.tags as Array<{ key: string; value: string }>) };
          });
        });
      }
    });
  });
};

/**
 * Stamps type:'JSON' on TraceTags/TraceServiceTags SelectedColumns whose names appear
 * as JSON-typed columns in allCols. Columns already typed 'JSON' are passed through
 * unchanged; all other hints are passed through unchanged. Both branches of
 * transformQueryResponseWithTraceAndLogLinks use this function so the logic stays in sync.
 */
function stampJsonColumnTypes(columns: SelectedColumn[], allCols: TableColumn[]): SelectedColumn[] {
  return columns.map((col) => {
    if (col.hint !== ColumnHint.TraceTags && col.hint !== ColumnHint.TraceServiceTags) {
      return col;
    }
    if (col.type?.startsWith('JSON')) {
      return col;
    }
    const colType = allCols.find((c) => c.name === col.name)?.type;
    return colType?.startsWith('JSON') ? { ...col, type: 'JSON' } : col;
  });
}

/**
 * Matches filters that bind a query to the Grafana time range, i.e. the ones that
 * render as `>= $__fromTime AND <= $__toTime` in the generated SQL.
 */
const isTimeRangeFilter = (filter: Filter): boolean =>
  filter.operator === FilterOperator.WithInGrafanaTimeRange &&
  (filter.hint === ColumnHint.FilterTime ||
    filter.hint === ColumnHint.Time ||
    (filter.type || '').toLowerCase().startsWith('date'));

/**
 * Replaces the plugin's time macros with concrete bounds from the given range, matching
 * the backend's expansion (`toDateTime(<unix seconds>)`); `from` is floored and `to` is
 * ceiled so sub-second edges are never clipped. Data-link queries need this because
 * Grafana's link variable check treats `$__fromTime`/`$__toTime` as template variables
 * and hides links whose serialized query contains variables it cannot resolve.
 */
const bindTimeRangeMacros = (sql: string, range?: TimeRange): string => {
  if (!range?.from || !range?.to) {
    return sql;
  }
  return sql
    .replaceAll('$__fromTime', `toDateTime(${Math.floor(range.from.valueOf() / 1000)})`)
    .replaceAll('$__toTime', `toDateTime(${Math.ceil(range.to.valueOf() / 1000)})`);
};

/**
 * escapeValue() in the SQL generator leaves filter values containing '$' unquoted so
 * template variables can be used raw — which also applies to the data link's
 * '${__value.raw}' trace id token. Grafana substitutes a plain hex id into it at click
 * time, so the pre-generated rawSql must carry the quotes itself (the trace-ID query
 * does the same in generateTraceQuery). builderOptions is left untouched: by the time
 * the editor regenerates SQL, the value is a plain string and escapeValue quotes it.
 */
const quoteTraceIdValueToken = (sql: string): string => {
  const token = '${__value.raw}';
  return sql.includes(`'${token}'`) ? sql : sql.replaceAll(token, `'${token}'`);
};

/**
 * Mutates the DataQueryResponse to include trace/log links on the traceID field.
 * The link will open a second query editor in split view on the explore page
 * with the selected trace ID.
 *
 * Requires defaults to be configured when crossing query types.
 *
 * **Async** — fetches live column schema via `datasource.getColumnsCached()` to
 * auto-detect JSON-typed tag columns (SpanAttributes, ResourceAttributes). Results
 * are cached on the datasource instance so repeated calls for the same table are
 * free after the first. Callers must `await` or use `mergeMap(from(...))` in an
 * RxJS pipeline (see `CHDatasource.query()`).
 */
export const transformQueryResponseWithTraceAndLogLinks = async (
  datasource: Datasource,
  req: DataQueryRequest<CHQuery>,
  res: DataQueryResponse
): Promise<DataQueryResponse> => {
  applyTraceSearchFieldConfig(req, res);
  transformTraceTagFields(req, res);

  // Use the datasource-level column cache so repeated queries against the same
  // table (dashboard refreshes, live tail) don't each trigger a DESC TABLE round-trip.
  const getCachedColumns = (db: string, tbl: string) => datasource.getColumnsCached(db, tbl);

  for (const frame of res.data as DataFrame[]) {
    const originalQuery = req.targets.find((t) => t.refId === frame.refId);

    if (!originalQuery) {
      continue;
    }

    const originalBuilderOptions = getBuilderOptions(originalQuery);

    const traceField = frame.fields.find(
      (field) => field.name.toLowerCase() === 'traceid' || field.name.toLowerCase() === 'trace_id'
    );
    if (!traceField) {
      continue;
    }

    // Get the configured TraceId column name for use in both trace and logs queries
    const defaultLogsColumns = datasource.getDefaultLogsColumns();
    // Use traces config traceIdColumn if available, otherwise fallback to logs default
    const traceIdColumnName =
      datasource.getTracesTraceIdColumn() || defaultLogsColumns.get(ColumnHint.TraceId) || 'TraceId';

    const traceIdFilter: StringFilter = {
      type: 'string',
      operator: FilterOperator.Equals,
      filterType: 'custom',
      key: traceIdColumnName,
      hint: ColumnHint.TraceId,
      condition: 'AND',
      value: '${__value.raw}',
    };

    const traceIdQuery: CHBuilderQuery = {
      // Embed only a datasource ref ({ uid, type }), never the live Datasource instance:
      // the instance is circular (datasource.variables.datasource === datasource) and Grafana's
      // data-link scanner recurses into it, overflowing the stack on older Grafana.
      datasource: { uid: datasource.uid, type: datasource.type },
      editorType: EditorType.Builder,
      rawSql: '',
      builderOptions: {} as QueryBuilderOptions,
      pluginVersion,
      refId: 'Trace ID',
    };

    const traceTimestampTableSuffix = datasource.getTraceTimestampTableSuffix();

    if (
      originalQuery.editorType === EditorType.Builder &&
      originalQuery.builderOptions.queryType === QueryType.Traces
    ) {
      // Copy fields directly from trace search; auto-detect JSON tag column types via
      // fetchColumns so saved queries (where useOtelColumns doesn't re-run) still work.
      let columns = originalQuery.builderOptions.columns;
      const db = originalQuery.builderOptions.database;
      const tbl = originalQuery.builderOptions.table;

      const tagsCol = columns?.find((c) => c.hint === ColumnHint.TraceTags || c.hint === ColumnHint.TraceServiceTags);
      const typeKnown = tagsCol?.type !== undefined;

      let fetchedLiveSchema = false;
      if (db && tbl && !typeKnown) {
        try {
          const allCols = await getCachedColumns(db, tbl);
          columns = stampJsonColumnTypes(columns ?? [], allCols);
          fetchedLiveSchema = true;
        } catch {
          // fall through; SQL generator falls back to mapKeys()
        }
      }

      // Fall back to stored meta only when we didn't fetch and the column type isn't already set.
      const effectiveTagsAreJSON =
        (columns?.some(
          (c) =>
            (c.hint === ColumnHint.TraceTags || c.hint === ColumnHint.TraceServiceTags) &&
            c.type?.toLowerCase().startsWith('json')
        ) ??
          false) ||
        (!fetchedLiveSchema && !typeKnown && Boolean(originalQuery.builderOptions.meta?.tagsAreJSON));

      // Validate the companion table the generated SQL will reference: the
      // query's baked suffix wins over the current datasource config suffix.
      const hasTraceTimestampTable = await datasource.hasTraceTimestampTable(
        originalQuery.builderOptions.database || '',
        originalQuery.builderOptions.table || '',
        originalQuery.builderOptions.meta?.traceTimestampTableSuffix
      );

      traceIdQuery.builderOptions = {
        ...originalQuery.builderOptions,
        columns,
        filters: [], // Clear filters and orderBy since it's an exact ID lookup
        orderBy: [],
        meta: {
          ...originalQuery.builderOptions.meta,
          minimized: true,
          isTraceIdMode: true,
          traceId: '${__value.raw}',
          traceTimestampTableSuffix:
            originalQuery.builderOptions.meta?.traceTimestampTableSuffix || traceTimestampTableSuffix,
          tagsAreJSON: effectiveTagsAreJSON,
          hasTraceTimestampTable,
        },
      };
    } else {
      // Create new query based on trace defaults

      const otelVersion = datasource.getTraceOtelVersion();
      const otelConfig = otel.getVersion(otelVersion);
      const traceEventsColumnPrefix = datasource.getDefaultTraceEventsColumnPrefix();
      const traceLinksColumnPrefix = datasource.getDefaultTraceLinksColumnPrefix();
      const traceDatabase =
        datasource.getDefaultTraceDatabase() ||
        traceIdQuery.builderOptions.database ||
        datasource.getDefaultDatabase() ||
        '';
      const traceTable =
        datasource.getDefaultTraceTable() || datasource.getDefaultTable() || traceIdQuery.builderOptions.table || '';
      const hasTraceTimestampTable = await datasource.hasTraceTimestampTable(traceDatabase, traceTable);
      const options: QueryBuilderOptions = {
        database: traceDatabase,
        table: traceTable,
        queryType: QueryType.Traces,
        columns: [],
        filters: [],
        orderBy: [],
        meta: {
          minimized: true,
          isTraceIdMode: true,
          traceId: '${__value.raw}',
          traceDurationUnit: datasource.getDefaultTraceDurationUnit(),
          otelEnabled: Boolean(otelVersion),
          otelVersion: otelVersion,
          traceEventsColumnPrefix: traceEventsColumnPrefix,
          traceLinksColumnPrefix: traceLinksColumnPrefix,
          hasTraceTimestampTable,
          traceTimestampTableSuffix,
          flattenNested: datasource.getDefaultTraceFlattenNested() || false,
        },
      };

      if (otelConfig?.traceColumnMap) {
        options.columns = Array.from(otelConfig.traceColumnMap, ([hint, name]) => ({ name, hint }));
      } else {
        const defaultColumns = datasource.getDefaultTraceColumns();
        for (let [hint, colName] of defaultColumns) {
          options.columns!.push({ name: colName, hint });
        }
      }

      // Auto-detect JSON column types from ClickHouse; fall through silently on error
      const fetchedLiveSchema = !!(options.database && options.table);
      try {
        if (fetchedLiveSchema) {
          const allColumns = await getCachedColumns(options.database, options.table);
          options.columns = stampJsonColumnTypes(options.columns!, allColumns);
        }
      } catch {
        // fall through; SQL generator falls back to mapKeys()
      }

      // Only fall back to stored meta when fetchColumns was not called (empty db/table).
      const detectedTagsAreJSON =
        (options.columns?.some(
          (c) =>
            (c.hint === ColumnHint.TraceTags || c.hint === ColumnHint.TraceServiceTags) &&
            c.type?.toLowerCase().startsWith('json')
        ) ??
          false) ||
        (!fetchedLiveSchema && Boolean(originalBuilderOptions?.meta?.tagsAreJSON));

      options.meta!.tagsAreJSON = detectedTagsAreJSON;
      traceIdQuery.builderOptions = options;
    }

    // Pre-generate rawSql so the query executes immediately when the link is opened.
    // Trace ID queries don't contain $__fromTime/$__toTime time macros, so they're
    // safe to include (unlike trace search queries which would break data link detection).
    traceIdQuery.rawSql = generateSql(traceIdQuery.builderOptions);
    traceIdQuery.format = mapQueryBuilderOptionsToGrafanaFormat(traceIdQuery.builderOptions);

    const traceLogsQuery: CHBuilderQuery = {
      // Embed only a datasource ref ({ uid, type }), never the live Datasource instance:
      // the instance is circular (datasource.variables.datasource === datasource) and Grafana's
      // data-link scanner recurses into it, overflowing the stack on older Grafana.
      datasource: { uid: datasource.uid, type: datasource.type },
      editorType: EditorType.Builder,
      rawSql: '',
      builderOptions: {} as QueryBuilderOptions,
      pluginVersion,
      refId: 'Trace Logs',
    };

    if (originalQuery.editorType === EditorType.Builder && originalQuery.builderOptions.queryType === QueryType.Logs) {
      // Copy fields directly from log search. Only its time-range filter is carried
      // over: the pivot should show every log row for the trace, and dropping the
      // rest also discards any TraceId filter left from a previous pivot.
      const originalTimeFilters = (originalQuery.builderOptions.filters || []).filter(isTimeRangeFilter);
      const timeFilters =
        originalTimeFilters.length > 0 ? originalTimeFilters : getDefaultLogsFilters().filter(isTimeRangeFilter);
      traceLogsQuery.builderOptions = {
        ...originalQuery.builderOptions,
        // List mode is required by getSupplementaryLogsVolumeQuery; without it the
        // logs volume histogram is skipped until the editor merges query defaults
        mode: BuilderMode.List,
        filters: [...timeFilters, traceIdFilter],
        orderBy: [{ name: '', hint: ColumnHint.Time, dir: OrderByDirection.ASC }],
        meta: {
          ...originalQuery.builderOptions.meta,
          minimized: true,
        },
      };
    } else {
      // Create new query based on log defaults

      const otelVersion = datasource.getLogsOtelVersion();
      const options: QueryBuilderOptions = {
        database:
          datasource.getDefaultLogsDatabase() ||
          traceLogsQuery.builderOptions.database ||
          datasource.getDefaultDatabase(),
        table: datasource.getDefaultLogsTable() || datasource.getDefaultTable() || traceLogsQuery.builderOptions.table,
        queryType: QueryType.Logs,
        // List mode is required by getSupplementaryLogsVolumeQuery; without it the
        // logs volume histogram is skipped until the editor merges query defaults
        mode: BuilderMode.List,
        columns: [],
        orderBy: [{ name: '', hint: ColumnHint.Time, dir: OrderByDirection.ASC }],
        // The default filters carry the time-range bound so the time picker constrains the query
        filters: [...getDefaultLogsFilters(), traceIdFilter],
        meta: {
          minimized: true,
          otelEnabled: Boolean(otelVersion),
          otelVersion: otelVersion,
        },
      };

      for (let [hint, colName] of defaultLogsColumns) {
        options.columns!.push({ name: colName, hint });
      }

      // Ensure TraceId column is in the array so filter can find it via hint lookup
      if (!options.columns!.find((c) => c.hint === ColumnHint.TraceId)) {
        options.columns!.push({ name: traceIdColumnName, hint: ColumnHint.TraceId });
      }

      traceLogsQuery.builderOptions = options;
    }

    const openInNewWindow = req.app !== CoreApp.Explore;
    // Pre-generate rawSql so the first auto-run executes immediately.
    traceLogsQuery.rawSql = quoteTraceIdValueToken(
      bindTimeRangeMacros(generateSql(traceLogsQuery.builderOptions || {}), req.range)
    );
    traceLogsQuery.format = mapQueryBuilderOptionsToGrafanaFormat(traceLogsQuery.builderOptions);
    traceField.config.links = [];
    const canLinkToTraces =
      originalQuery.editorType === EditorType.Builder && originalQuery.builderOptions.queryType === QueryType.Traces
        ? true
        : canBuildTraceLink(datasource);
    const canLinkToLogs =
      originalQuery.editorType === EditorType.Builder && originalQuery.builderOptions.queryType === QueryType.Logs
        ? true
        : canBuildLogsLink(datasource);

    if (datasource.settings.jsonData.traces?.showTraceLinks !== false && canLinkToTraces) {
      traceField.config.links!.push({
        title: 'View trace',
        targetBlank: openInNewWindow,
        url: '',
        internal: {
          query: traceIdQuery,
          datasourceUid: traceIdQuery.datasource?.uid!,
          datasourceName: traceIdQuery.datasource?.type!,
          panelsState: {
            trace: {
              spanId: '${__value.raw}',
            },
          },
        },
      });
    }
    if (datasource.settings.jsonData.logs?.showLogLinks !== false && canLinkToLogs) {
      traceField.config.links!.push({
        title: 'View logs',
        targetBlank: openInNewWindow,
        url: '',
        internal: {
          query: traceLogsQuery,
          datasourceUid: traceLogsQuery.datasource?.uid!,
          datasourceName: traceLogsQuery.datasource?.type!,
        },
      });
    }
  }

  return res;
};

const canBuildTraceLink = (datasource: Datasource): boolean => {
  const traceColumns = datasource.getDefaultTraceColumns();
  return Boolean(datasource.getDefaultTraceTable() && traceColumns.get(ColumnHint.TraceId));
};

const canBuildLogsLink = (datasource: Datasource): boolean => {
  const logColumns = datasource.getDefaultLogsColumns();
  return Boolean(datasource.getDefaultLogsTable() && logColumns.get(ColumnHint.TraceId));
};

// The name of the dataframe field containing labels
export const labelsFieldName = 'labels';

/**
 * Returns true if the dataframe contains a log label that matches the provided name.
 *
 * This function exists for the logs panel, when clicking "filter for value" on a single log row.
 * A dataframe will be provided for that single row, and we need to check the labels object to see if it
 * contains a field with that name. If it does then we can create a filter using the labels column hint.
 */
export const dataFrameHasLogLabelWithName = (frame: DataFrame | undefined, name: string): boolean => {
  if (!frame || !frame.fields || frame.fields.length === 0) {
    return false;
  }

  const field = frame.fields.find((f) => f.name === labelsFieldName);
  if (!field || !field.values || field.values.length < 1 || !field.values[0]) {
    return false;
  }

  const labels = (field.values[0] || {}) as object;
  const labelKeys = Object.keys(labels);

  return labelKeys.includes(name);
};

/**
 * Folds the top-level scalar columns selected in a logs query into the `labels` field under their
 * plain names, so they surface as flat, filterable fields alongside the grouped OTel attributes, and
 * removes them as standalone frame fields. The folded columns are the hint-less, non-collection,
 * non-aliased ones in builderOptions.columns (roles carry a hint; attribute maps are collection-
 * typed; an aliased column would break filter-for in the logs-volume query). Real column names are
 * used so a filter-for click resolves in both the main and logs-volume queries. Creates `labels`
 * when the frame has none (non-OTel tables), and skips the logs-volume frame. A default query (roles
 * plus attribute maps only) selects no such columns, so it is a no-op.
 */
export const foldDiscoveredLogFieldsIntoLabels = (
  datasource: Datasource,
  req: DataQueryRequest<CHQuery>,
  res: DataQueryResponse
): DataQueryResponse => {
  const targetsByRefId = new Map(req.targets.map((t) => [t.refId, t]));

  for (const frame of (res.data as DataFrame[]) || []) {
    const target = targetsByRefId.get(frame.refId ?? '');
    if (!target || target.editorType !== EditorType.Builder) {
      continue;
    }
    const builderOptions = (target as CHBuilderQuery).builderOptions;
    if (!builderOptions || builderOptions.queryType !== QueryType.Logs) {
      continue;
    }

    // The columns the field options selected are the hint-less, non-collection ones. Role columns
    // (time / body / level / trace id) carry a hint; the attribute maps are collection-typed.
    // A column aliased to a different name is skipped: a filter-for click would key on the alias,
    // which the logs-volume query cannot resolve. A column whose alias equals its name (how the
    // query builder tags a plain column pick) folds like an unaliased one, so columns chosen in the
    // builder become browsable fields the same way columns configured on the datasource do.
    const discovered = (builderOptions.columns || [])
      .filter((c) => c.hint === undefined && !isCollectionColumnType(c.type) && (!c.alias || c.alias === c.name))
      .map((c) => c.name);
    const sourceFields = discovered
      .map((name) => frame.fields.find((f) => f.name === name && f.name !== labelsFieldName))
      .filter((f): f is DataFrame['fields'][number] => f !== undefined);
    if (sourceFields.length === 0) {
      continue;
    }

    const rowLen = frame.length ?? frame.fields[0]?.values.length ?? 0;

    let labelsField = frame.fields.find((f) => f.name === labelsFieldName);
    if (!labelsField) {
      labelsField = {
        name: labelsFieldName,
        type: FieldType.other,
        config: {},
        values: Array.from({ length: rowLen }, () => ({})),
      } as unknown as DataFrame['fields'][number];
      frame.fields.push(labelsField);
    }

    // Fold every column into `labels` with a single parse/serialize per row, rather than one
    // round trip per column per row (which is quadratic on a wide table with include-all on).
    for (let i = 0; i < rowLen; i++) {
      // `labels` values may be JSON strings (how the backend serializes the OTel attribute maps)
      // or already-parsed objects (a frame we just created). Handle both and write back in kind.
      const raw = labelsField.values[i];
      const wasString = typeof raw === 'string';
      let obj: Record<string, unknown>;
      if (wasString) {
        try {
          obj = JSON.parse(raw as string) as Record<string, unknown>;
        } catch {
          obj = {};
        }
      } else {
        obj = (raw as Record<string, unknown>) || {};
      }
      if (!obj || typeof obj !== 'object') {
        obj = {};
      }

      let folded = false;
      for (const src of sourceFields) {
        const v = src.values[i];
        if (v === null || v === undefined || v === '') {
          continue;
        }
        obj[src.name] = typeof v === 'string' ? v : String(v);
        folded = true;
      }

      if (folded) {
        labelsField.values[i] = wasString ? JSON.stringify(obj) : obj;
      }
    }

    const foldedNames = new Set(sourceFields.map((f) => f.name));
    frame.fields = frame.fields.filter((f) => f === labelsField || !foldedNames.has(f.name));
  }

  return res;
};
