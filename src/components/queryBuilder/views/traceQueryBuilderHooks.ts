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
 * Sets OTEL Trace columns automatically when OTEL is enabled
 * Does not run if OTEL is already enabled, only when it's changed.
 */
export const useOtelColumns = (
  otelEnabled: boolean,
  otelVersion: string,
  allColumns: readonly TableColumn[],
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>
) => {
  // Start false so that allColumns loading always triggers a stamp, even for saved
  // queries where otelEnabled is already true on mount.
  const didSetColumns = useRef<boolean>(false);

  if (!otelEnabled) {
    didSetColumns.current = false;
  }

  useEffect(() => {
    if (!otelEnabled || didSetColumns.current || allColumns.length === 0) {
      return;
    }

    const otelConfig = otel.getVersion(otelVersion);
    const traceColumnMap = otelConfig?.traceColumnMap;
    if (!traceColumnMap) {
      return;
    }

    const columns: SelectedColumn[] = [];
    traceColumnMap.forEach((name, hint) => {
      const isTagHint = hint === ColumnHint.TraceTags || hint === ColumnHint.TraceServiceTags;
      const colType = allColumns.find((c) => c.name === name)?.type;
      const isJSON = colType?.startsWith('JSON') === true;
      columns.push({ name, hint, ...(isTagHint && isJSON ? { type: 'JSON' } : {}) });
    });

    const tagsAreJSON = columns.some(
      (c) => (c.hint === ColumnHint.TraceTags || c.hint === ColumnHint.TraceServiceTags) && c.type === 'JSON'
    );

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
