import { CoreApp, DataFrame, DataQueryRequest, DataQueryResponse, FieldConfig } from '@grafana/data';
import {
  ColumnHint,
  FilterOperator,
  OrderByDirection,
  QueryBuilderOptions,
  QueryType,
  SelectedColumn,
  StringFilter,
  TableColumn,
} from 'types/queryBuilder';
import { CHBuilderQuery, CHQuery, EditorType } from 'types/sql';
import { Datasource } from './CHDatasource';
import { pluginVersion } from 'utils/version';
import { generateSql, JSON_SENTINEL_KEY } from './sqlGenerator';
import otel from 'otel';

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
    const originalQuery = req.targets.find((t) => t.refId === frame.refId) as CHBuilderQuery;
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
    const originalQuery = req.targets.find((t) => t.refId === frame.refId) as CHBuilderQuery;

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
    if (col.hint !== ColumnHint.TraceTags && col.hint !== ColumnHint.TraceServiceTags) { return col; }
    if (col.type?.startsWith('JSON')) { return col; }
    const colType = allCols.find((c) => c.name === col.name)?.type;
    return colType?.startsWith('JSON') ? { ...col, type: 'JSON' } : col;
  });
}

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
    const originalQuery = req.targets.find((t) => t.refId === frame.refId) as CHBuilderQuery;
    if (!originalQuery) {
      continue;
    }

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

    const traceIdQuery: CHBuilderQuery = {
      datasource: datasource,
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
        },
      };
    } else {
      // Create new query based on trace defaults

      const otelVersion = datasource.getTraceOtelVersion();
      const otelConfig = otel.getVersion(otelVersion);
      const traceEventsColumnPrefix = datasource.getDefaultTraceEventsColumnPrefix();
      const traceLinksColumnPrefix = datasource.getDefaultTraceLinksColumnPrefix();
      const options: QueryBuilderOptions = {
        database:
          datasource.getDefaultTraceDatabase() ||
          traceIdQuery.builderOptions.database ||
          datasource.getDefaultDatabase(),
        table: datasource.getDefaultTraceTable() || datasource.getDefaultTable() || traceIdQuery.builderOptions.table,
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
          hasTraceTimestampTable: Boolean(otelVersion),
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
        (!fetchedLiveSchema && Boolean(originalQuery.builderOptions.meta?.tagsAreJSON));

      options.meta!.tagsAreJSON = detectedTagsAreJSON;
      traceIdQuery.builderOptions = options;
    }

    // Pre-generate rawSql so the query executes immediately when the link is opened.
    // Trace ID queries don't contain $__fromTime/$__toTime time macros, so they're
    // safe to include (unlike trace search queries which would break data link detection).
    traceIdQuery.rawSql = generateSql(traceIdQuery.builderOptions);

    const traceLogsQuery: CHBuilderQuery = {
      datasource: datasource,
      editorType: EditorType.Builder,
      rawSql: '',
      builderOptions: {} as QueryBuilderOptions,
      pluginVersion,
      refId: 'Trace Logs',
    };

    if (originalQuery.editorType === EditorType.Builder && originalQuery.builderOptions.queryType === QueryType.Logs) {
      // Copy fields directly from log search
      traceLogsQuery.builderOptions = {
        ...originalQuery.builderOptions,
        filters: [
          {
            type: 'string',
            operator: FilterOperator.Equals,
            filterType: 'custom',
            key: traceIdColumnName,
            hint: ColumnHint.TraceId,
            condition: 'AND',
            value: '${__value.raw}',
          } as StringFilter,
        ],
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
        columns: [],
        orderBy: [{ name: '', hint: ColumnHint.Time, dir: OrderByDirection.ASC }],
        filters: [
          {
            type: 'string',
            operator: FilterOperator.Equals,
            filterType: 'custom',
            key: traceIdColumnName,
            hint: ColumnHint.TraceId,
            condition: 'AND',
            value: '${__value.raw}',
          } as StringFilter,
        ],
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

    // Generate rawSql for Dashboard mode to preserve query through serialization
    const openInNewWindow = req.app !== CoreApp.Explore;
    if (openInNewWindow) {
      traceLogsQuery.rawSql = generateSql(traceLogsQuery.builderOptions || {});
    } else {
      traceLogsQuery.rawSql = '';
    }
    traceField.config.links = [];
    if (datasource.settings.jsonData.traces?.showTraceLinks !== false) {
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
    if (datasource.settings.jsonData.logs?.showLogLinks !== false) {
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
  if (!field || !field.values || field.values.length < 1 || !field.values.get(0)) {
    return false;
  }

  const labels = (field.values.get(0) || {}) as object;
  const labelKeys = Object.keys(labels);

  return labelKeys.includes(name);
};
