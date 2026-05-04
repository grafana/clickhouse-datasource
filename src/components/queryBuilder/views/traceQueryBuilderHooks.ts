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
import { BuilderOptionsReducerAction, setColumnByHint, setOptions } from 'hooks/useBuilderOptionsState';
import {
  findColumnByNameHeuristic,
  isDateTimeColumn,
  isNumericColumn,
  isStringLikeColumn,
} from './columnNameHeuristics';

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
 * Sets OTEL Trace columns automatically when OTEL is enabled
 * Does not run if OTEL is already enabled, only when it's changed.
 */
export const useOtelColumns = (
  otelEnabled: boolean,
  otelVersion: string,
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>
) => {
  const didSetColumns = useRef<boolean>(otelEnabled);
  if (!otelEnabled) {
    didSetColumns.current = false;
  }

  useEffect(() => {
    if (!otelEnabled || didSetColumns.current) {
      return;
    }

    const otelConfig = otel.getVersion(otelVersion);
    const traceColumnMap = otelConfig?.traceColumnMap;
    if (!traceColumnMap) {
      return;
    }

    const columns: SelectedColumn[] = [];
    traceColumnMap.forEach((name, hint) => {
      columns.push({ name, hint });
    });

    builderOptionsDispatch(
      setOptions({
        columns,
        meta: {
          traceDurationUnit: otelConfig.traceDurationUnit,
          flattenNested: otelConfig.flattenNested,
          traceEventsColumnPrefix: otelConfig.traceEventsColumnPrefix,
          traceLinksColumnPrefix: otelConfig.traceLinksColumnPrefix,
        },
      })
    );
    didSetColumns.current = true;
  }, [otelEnabled, otelVersion, builderOptionsDispatch]);
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
