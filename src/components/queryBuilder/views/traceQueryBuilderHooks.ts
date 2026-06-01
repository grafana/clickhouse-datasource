import React, { useEffect, useRef } from 'react';
import { Datasource } from 'data/CHDatasource';
import otel from 'otel';
import {
  ColumnHint,
  DateFilterWithoutValue,
  Filter,
  FilterOperator,
  NumberFilter,
  OrderBy,
  OrderByDirection,
  QueryBuilderOptions,
  SelectedColumn,
  StringFilter,
  TableColumn,
} from 'types/queryBuilder';
import { BuilderOptionsReducerAction, setOptions } from 'hooks/useBuilderOptionsState';

/**
 * Loads the default configuration for new queries. (Only runs on new queries)
 */
export const useTraceDefaultsOnMount = (
  datasource: Datasource,
  isNewQuery: boolean,
  builderOptions: QueryBuilderOptions,
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>
) => {
  const didSetDefaults = useRef<boolean>(false);
  useEffect(() => {
    if (!isNewQuery || didSetDefaults.current) {
      return;
    }

    const defaultDb = datasource.getDefaultTraceDatabase() || datasource.getDefaultDatabase();
    const defaultTable = datasource.getDefaultTraceTable() || datasource.getDefaultTable();
    const defaultDurationUnit = datasource.getDefaultTraceDurationUnit();
    const otelVersion = datasource.getTraceOtelVersion();
    const defaultColumns = datasource.getDefaultTraceColumns();
    const defaultFlattenNested = datasource.getDefaultTraceFlattenNested();
    const defaultEventsColumnPrefix = datasource.getDefaultTraceEventsColumnPrefix();
    const defaultLinksColumnPrefix = datasource.getDefaultTraceLinksColumnPrefix();
    const traceTimestampTableSuffix = datasource.getTraceTimestampTableSuffix();

    const nextColumns: SelectedColumn[] = [];
    for (let [hint, colName] of defaultColumns) {
      nextColumns.push({ name: colName, hint });
    }

    builderOptionsDispatch(
      setOptions({
        database: defaultDb,
        table: defaultTable || builderOptions.table,
        columns: nextColumns,
        meta: {
          otelEnabled: Boolean(otelVersion),
          otelVersion,
          traceDurationUnit: defaultDurationUnit,
          flattenNested: defaultFlattenNested,
          traceEventsColumnPrefix: defaultEventsColumnPrefix,
          traceLinksColumnPrefix: defaultLinksColumnPrefix,
          traceTimestampTableSuffix,
          tagsAreJSON: false,
        },
      })
    );
    didSetDefaults.current = true;
  }, [
    builderOptions.columns,
    builderOptions.orderBy,
    builderOptions.table,
    builderOptionsDispatch,
    datasource,
    isNewQuery,
  ]);
};

/**
 * Sets OTEL Trace columns automatically when OTEL is enabled.
 *
 * Two effects are used instead of one because allColumns loads asynchronously:
 *
 * Effect 1: fires as soon as OTel is toggled on, before allColumns may be ready.
 *   Sets the canonical column list immediately so the query builder isn't blank
 *   while the schema loads. Uses tagsAreJSON: false as a safe default.
 *   Skipped on mount for saved queries (didSetColumns starts true).
 *
 * Effect 2: fires once allColumns has loaded. Detects JSON-type tag columns and
 *   re-dispatches with the corrected types and tagsAreJSON: true. For Map-type
 *   schemas this effect returns without dispatching, so only one render occurs.
 */
export const useOtelColumns = (
  otelEnabled: boolean,
  otelVersion: string,
  allColumns: readonly TableColumn[],
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>
) => {
  // Start true when OTel is already on so Effect 1 doesn't fire for saved queries.
  const didSetColumns = useRef<boolean>(otelEnabled);
  const didDetectColumnTypes = useRef<boolean>(false);

  if (!otelEnabled) {
    didSetColumns.current = false;
    didDetectColumnTypes.current = false;
  }

  // Effect 1: full column reset — only fires when OTel is toggled on.
  // If allColumns is already loaded, JSON types are stamped immediately so there is no
  // second render. When allColumns is still empty (loading), tagsAreJSON defaults to false
  // and Effect 2 corrects it once the schema arrives.
  useEffect(() => {
    if (!otelEnabled || didSetColumns.current) {
      return;
    }

    const otelConfig = otel.getVersion(otelVersion);
    const traceColumnMap = otelConfig?.traceColumnMap;
    if (!traceColumnMap) {
      return;
    }

    const tagsName = traceColumnMap.get(ColumnHint.TraceTags);
    const serviceTagsName = traceColumnMap.get(ColumnHint.TraceServiceTags);
    const tagsIsJSON = allColumns.length > 0 && allColumns.find((c) => c.name === tagsName)?.type?.startsWith('JSON') === true;
    const serviceTagsIsJSON = allColumns.length > 0 && allColumns.find((c) => c.name === serviceTagsName)?.type?.startsWith('JSON') === true;
    const tagsAreJSON = tagsIsJSON || serviceTagsIsJSON;

    const columns: SelectedColumn[] = [];
    traceColumnMap.forEach((name, hint) => {
      const isTagsCol = hint === ColumnHint.TraceTags && tagsIsJSON;
      const isServiceTagsCol = hint === ColumnHint.TraceServiceTags && serviceTagsIsJSON;
      columns.push({ name, hint, ...((isTagsCol || isServiceTagsCol) ? { type: 'JSON' } : {}) });
    });

    builderOptionsDispatch(
      setOptions({
        columns,
        meta: {
          traceDurationUnit: otelConfig.traceDurationUnit,
          flattenNested: otelConfig.flattenNested,
          traceEventsColumnPrefix: otelConfig.traceEventsColumnPrefix,
          traceLinksColumnPrefix: otelConfig.traceLinksColumnPrefix,
          tagsAreJSON,
        },
      })
    );
    didSetColumns.current = true;
    if (tagsAreJSON) {
      didDetectColumnTypes.current = true;
    }
  }, [otelEnabled, otelVersion, allColumns, builderOptionsDispatch]);

  // Effect 2: detect whether tag columns use the JSON type and update meta.tagsAreJSON.
  // Runs for both newly-enabled and saved OTel queries. Only dispatches if the
  // schema actually uses the JSON type — skips entirely for Map schemas.
  useEffect(() => {
    if (!otelEnabled || didDetectColumnTypes.current || allColumns.length === 0) {
      return;
    }

    const otelConfig = otel.getVersion(otelVersion);
    const traceColumnMap = otelConfig?.traceColumnMap;
    if (!traceColumnMap) {
      return;
    }

    const tagsName = traceColumnMap.get(ColumnHint.TraceTags);
    const serviceTagsName = traceColumnMap.get(ColumnHint.TraceServiceTags);
    const tagsIsJSON = allColumns.find((c) => c.name === tagsName)?.type?.startsWith('JSON') === true;
    const serviceTagsIsJSON = allColumns.find((c) => c.name === serviceTagsName)?.type?.startsWith('JSON') === true;
    const tagsAreJSON = tagsIsJSON || serviceTagsIsJSON;

    didDetectColumnTypes.current = true;

    if (!tagsAreJSON) {
      return;
    }

    const columns: SelectedColumn[] = [];
    traceColumnMap.forEach((name, hint) => {
      const isTagsCol = hint === ColumnHint.TraceTags && tagsIsJSON;
      const isServiceTagsCol = hint === ColumnHint.TraceServiceTags && serviceTagsIsJSON;
      columns.push({ name, hint, ...((isTagsCol || isServiceTagsCol) ? { type: 'JSON' } : {}) });
    });

    builderOptionsDispatch(setOptions({ columns, meta: { tagsAreJSON } }));
  }, [otelEnabled, otelVersion, allColumns, builderOptionsDispatch]);
};

// Apply default filters on table change
export const useDefaultFilters = (
  table: string,
  isTraceIdMode: boolean,
  isNewQuery: boolean,
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>
) => {
  const appliedDefaultFilters = useRef<boolean>(!isNewQuery);
  const lastTable = useRef<string>(table || '');
  if (table !== lastTable.current) {
    appliedDefaultFilters.current = false;
  }

  useEffect(() => {
    if (isTraceIdMode || !table || appliedDefaultFilters.current) {
      return;
    }

    const defaultFilters: Filter[] = [
      {
        type: 'datetime',
        operator: FilterOperator.WithInGrafanaTimeRange,
        filterType: 'custom',
        key: '',
        hint: ColumnHint.Time,
        condition: 'AND',
      } as DateFilterWithoutValue, // Filter to dashboard time range
      {
        type: 'string',
        operator: FilterOperator.IsEmpty,
        filterType: 'custom',
        key: '',
        hint: ColumnHint.TraceParentSpanId,
        condition: 'AND',
        value: '',
      } as StringFilter, // Only show top level spans
      {
        type: 'UInt64',
        operator: FilterOperator.GreaterThan,
        filterType: 'custom',
        key: '',
        hint: ColumnHint.TraceDurationTime,
        condition: 'AND',
        value: 0,
      } as NumberFilter, // Only show spans where duration > 0
      {
        type: 'string',
        operator: FilterOperator.IsAnything,
        filterType: 'custom',
        key: '',
        hint: ColumnHint.TraceServiceName,
        condition: 'AND',
        value: '',
      } as StringFilter, // Placeholder service name filter for convenience
    ];

    const defaultOrderBy: OrderBy[] = [
      { name: '', hint: ColumnHint.Time, dir: OrderByDirection.DESC, default: true },
      { name: '', hint: ColumnHint.TraceDurationTime, dir: OrderByDirection.DESC, default: true },
    ];

    lastTable.current = table;
    appliedDefaultFilters.current = true;
    builderOptionsDispatch(
      setOptions({
        filters: defaultFilters,
        orderBy: defaultOrderBy,
      })
    );
  }, [table, isTraceIdMode, builderOptionsDispatch]);
};
