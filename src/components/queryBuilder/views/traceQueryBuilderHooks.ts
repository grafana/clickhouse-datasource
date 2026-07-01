import React, { useEffect, useRef } from 'react';
import { Datasource } from 'data/CHDatasource';
import otel from 'otel';
import { ColumnHint, QueryBuilderOptions, SelectedColumn, TableColumn } from 'types/queryBuilder';
import { BuilderOptionsReducerAction, setColumnByHint, setOptions } from 'hooks/useBuilderOptionsState';
import {
  findColumnByNameHeuristic,
  isDateTimeColumn,
  isNumericColumn,
  isStringLikeColumn,
} from './columnNameHeuristics';
import { getDefaultTraceFilters, getDefaultTraceOrderBy } from '../defaultQueryOptions';

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
 * Builds the OTel column list for the trace query builder, stamping type:'JSON'
 * on TraceTags/TraceServiceTags columns when allColumns reports a JSON type.
 * allColumns.length === 0 means the schema hasn't loaded yet; defaults to non-JSON.
 */
function buildOtelColumns(
  traceColumnMap: Map<ColumnHint, string>,
  allColumns: readonly TableColumn[]
): { columns: SelectedColumn[]; tagsAreJSON: boolean } {
  const tagsName = traceColumnMap.get(ColumnHint.TraceTags);
  const serviceTagsName = traceColumnMap.get(ColumnHint.TraceServiceTags);
  const tagsIsJSON =
    allColumns.length > 0 && allColumns.find((c) => c.name === tagsName)?.type?.startsWith('JSON') === true;
  const serviceTagsIsJSON =
    allColumns.length > 0 && allColumns.find((c) => c.name === serviceTagsName)?.type?.startsWith('JSON') === true;
  const columns: SelectedColumn[] = [];
  traceColumnMap.forEach((name, hint) => {
    const isTagsCol = hint === ColumnHint.TraceTags && tagsIsJSON;
    const isServiceTagsCol = hint === ColumnHint.TraceServiceTags && serviceTagsIsJSON;
    columns.push({ name, hint, ...(isTagsCol || isServiceTagsCol ? { type: 'JSON' } : {}) });
  });
  return { columns, tagsAreJSON: tagsIsJSON || serviceTagsIsJSON };
}

/**
 * Sets OTel trace columns automatically when OTel is enabled.
 *
 * A single Effect handles both the "toggle on" path and the "saved query schema
 * correction" path to avoid a double-dispatch race window:
 *
 * - Fresh toggle: waits for allColumns to load so the first dispatch always
 *   carries the correct tagsAreJSON value. No transient Map-path SQL is sent
 *   to a JSON-typed table.
 * - Saved query: dispatches a correction only when allColumns loads and the
 *   schema is JSON-typed (Map schemas: no extra render).
 * - Version change: prevOtelVersion ref detects the change and resets flags so
 *   the Effect re-dispatches with the new version's column map.
 */
export const useOtelColumns = (
  otelEnabled: boolean,
  otelVersion: string,
  allColumns: readonly TableColumn[],
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>
) => {
  const didSetColumns = useRef<boolean>(otelEnabled);
  const didDetectColumnTypes = useRef<boolean>(false);
  const prevOtelVersion = useRef<string>(otelVersion);

  if (!otelEnabled) {
    didSetColumns.current = false;
    didDetectColumnTypes.current = false;
    prevOtelVersion.current = otelVersion;
  } else if (otelVersion !== prevOtelVersion.current) {
    // Version changed while OTel is on — force the Effect to re-dispatch with
    // the new version's column map.
    didSetColumns.current = false;
    didDetectColumnTypes.current = false;
    prevOtelVersion.current = otelVersion;
  }

  useEffect(() => {
    if (!otelEnabled) {
      return;
    }

    // Fresh toggle: wait for allColumns to load so the single dispatch is correct.
    // Without a table the query can't run, so deferring is harmless.
    if (!didSetColumns.current && allColumns.length === 0) {
      return;
    }

    // Both initial dispatch and JSON type detection are already done.
    if (didSetColumns.current && didDetectColumnTypes.current) {
      return;
    }

    const otelConfig = otel.getVersion(otelVersion);
    const traceColumnMap = otelConfig?.traceColumnMap;
    if (!traceColumnMap || !otelConfig) {
      return;
    }

    const { columns, tagsAreJSON } = buildOtelColumns(traceColumnMap, allColumns);

    if (didSetColumns.current) {
      // Saved query path: schema just loaded — correct column types and tagsAreJSON
      // if the table uses JSON attributes. Map schemas: no extra dispatch.
      didDetectColumnTypes.current = true;
      if (tagsAreJSON) {
        builderOptionsDispatch(setOptions({ columns, meta: { tagsAreJSON } }));
      }
      return;
    }

    // Fresh toggle path: single dispatch with the correct tagsAreJSON from the start.
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
    didDetectColumnTypes.current = true;
  }, [otelEnabled, otelVersion, allColumns, builderOptionsDispatch]);
};

/**
 * Fills trace role slots from common non-OTel column names (mirrors the OTel
 * column map in src/otel.ts so OTel-conventional names still match when the
 * OTel toggle is off). Runs once per table change; never overwrites an
 * explicit user pick.
 *
 * The trace builder has many slots; we only heuristic-fill the ones with
 * unambiguous conventional names (Trace ID, Span ID, Parent Span ID, Service
 * Name, Operation/Span Name, Start Time, Duration). Other slots (Tags, Kind,
 * StatusCode, ...) use vendor-specific names where a wrong guess is worse
 * than leaving the slot empty.
 */
export const useDefaultTraceColumnsByName = (
  allColumns: readonly TableColumn[],
  table: string,
  currentColumns: {
    traceId?: SelectedColumn;
    spanId?: SelectedColumn;
    parentSpanId?: SelectedColumn;
    serviceName?: SelectedColumn;
    operationName?: SelectedColumn;
    startTime?: SelectedColumn;
    durationTime?: SelectedColumn;
  },
  otelEnabled: boolean,
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>
) => {
  const lastTable = useRef<string>(table || '');
  const didRun = useRef<boolean>(false);
  if (table !== lastTable.current) {
    didRun.current = false;
  }

  useEffect(() => {
    if (otelEnabled || didRun.current || !table || allColumns.length === 0) {
      return;
    }

    const tryFill = (
      hint: ColumnHint,
      alreadySet: SelectedColumn | undefined,
      typeFilter?: (c: TableColumn) => boolean
    ) => {
      if (alreadySet) {
        return;
      }
      const match = findColumnByNameHeuristic(allColumns, hint, typeFilter);
      if (!match) {
        return;
      }
      builderOptionsDispatch(setColumnByHint({ name: match.name, type: match.type, hint }));
    };

    tryFill(ColumnHint.TraceId, currentColumns.traceId, isStringLikeColumn);
    tryFill(ColumnHint.TraceSpanId, currentColumns.spanId, isStringLikeColumn);
    tryFill(ColumnHint.TraceParentSpanId, currentColumns.parentSpanId, isStringLikeColumn);
    tryFill(ColumnHint.TraceServiceName, currentColumns.serviceName, isStringLikeColumn);
    tryFill(ColumnHint.TraceOperationName, currentColumns.operationName, isStringLikeColumn);
    tryFill(ColumnHint.Time, currentColumns.startTime, isDateTimeColumn);
    tryFill(ColumnHint.TraceDurationTime, currentColumns.durationTime, isNumericColumn);

    lastTable.current = table;
    didRun.current = true;
  }, [
    allColumns,
    table,
    currentColumns.traceId,
    currentColumns.spanId,
    currentColumns.parentSpanId,
    currentColumns.serviceName,
    currentColumns.operationName,
    currentColumns.startTime,
    currentColumns.durationTime,
    otelEnabled,
    builderOptionsDispatch,
  ]);
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

    lastTable.current = table;
    appliedDefaultFilters.current = true;
    builderOptionsDispatch(
      setOptions({
        filters: getDefaultTraceFilters(),
        orderBy: getDefaultTraceOrderBy(),
      })
    );
  }, [table, isTraceIdMode, builderOptionsDispatch]);
};
