import React, { useEffect, useRef } from 'react';
import { Datasource } from 'data/CHDatasource';
import { versions as otelVersions } from 'otel';
import { ColumnHint, DateFilterWithoutValue, Filter, FilterOperator, NumberFilter, QueryBuilderOptions, SelectedColumn, StringFilter } from 'types/queryBuilder';
import { BuilderOptionsReducerAction, setOptions } from 'hooks/useBuilderOptionsState';

/**
 * Loads the default configuration for new queries. (Only runs on new queries)
 */
export const useTraceDefaultsOnMount = (datasource: Datasource, isNewQuery: boolean, builderOptions: QueryBuilderOptions, builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>) => {
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

    const nextColumns: SelectedColumn[] = [];
    for (let [hint, colName] of defaultColumns) {
      nextColumns.push({ name: colName, hint });
    }

    builderOptionsDispatch(setOptions({
      database: defaultDb,
      table: defaultTable || builderOptions.table,
      columns: nextColumns,
      meta: {
        otelEnabled: Boolean(otelVersion),
        otelVersion,
        traceDurationUnit: defaultDurationUnit
      }
    }));
    didSetDefaults.current = true;
  }, [builderOptions.columns, builderOptions.orderBy, builderOptions.table, builderOptionsDispatch, datasource, isNewQuery]);
};

/**
 * Sets OTEL Trace columns automatically when OTEL is enabled
 * Does not run if OTEL is already enabled, only when it's changed.
 */
export const useOtelColumns = (otelEnabled: boolean, otelVersion: string, builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>) => {
  const didSetColumns = useRef<boolean>(otelEnabled);
  if (!otelEnabled) {
    didSetColumns.current = false;
  }

  useEffect(() => {
    if (!otelEnabled || didSetColumns.current) {
      return;
    }

    const otelConfig = otelVersions.find(v => v.version === otelVersion);
    const traceColumnMap = otelConfig?.traceColumnMap;
    if (!traceColumnMap) {
      return;
    }

    const columns: SelectedColumn[] = [];
    traceColumnMap.forEach((name, hint) => {
      columns.push({ name, hint });
    });

    builderOptionsDispatch(setOptions({
      columns,
      meta: {
        traceDurationUnit: otelConfig.traceDurationUnit
      }
    }));
    didSetColumns.current = true;
  }, [otelEnabled, otelVersion, builderOptionsDispatch]);
};

// Apply default filters on table change
const timeRangeFilterId = 'timeRange';
const rootSpanFilterId = 'rootSpansOnly';
const durationFilterId = 'duration';
export const useDefaultFilters = (table: string, filters: Filter[], builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>) => {
  const appliedDefaultFilters = useRef<boolean>(false);
  const lastTable = useRef<string>(table || '');
  if (table !== lastTable.current) {
    appliedDefaultFilters.current = false;
  }

  useEffect(() => {
    if (!table || appliedDefaultFilters.current) {
      return;
    }

    const nextFilters: Filter[] = filters.filter(f => f.id !== timeRangeFilterId && f.id !== rootSpanFilterId && f.id !== durationFilterId);
    const timeRangeFilter: DateFilterWithoutValue = {
      type: 'datetime',
      operator: FilterOperator.WithInGrafanaTimeRange,
      filterType: 'custom',
      key: '',
      hint: ColumnHint.Time,
      id: timeRangeFilterId,
      condition: 'AND'
    };

    const rootSpanFilter: StringFilter = {
      type: 'String',
      operator: FilterOperator.Equals,
      filterType: 'custom',
      key: '',
      hint: ColumnHint.TraceParentSpanId,
      id: rootSpanFilterId,
      condition: 'AND',
      value: ''
    };

    const durationFilter: NumberFilter = {
      type: 'UInt64',
      operator: FilterOperator.GreaterThan,
      filterType: 'custom',
      key: '',
      hint: ColumnHint.TraceDurationTime,
      id: durationFilterId,
      condition: 'AND',
      value: 0
    };

    nextFilters.unshift(durationFilter);
    nextFilters.unshift(rootSpanFilter);
    nextFilters.unshift(timeRangeFilter);
    
    lastTable.current = table;
    appliedDefaultFilters.current = true;
    builderOptionsDispatch(setOptions({
      filters: nextFilters
    }));
  }, [table, filters, builderOptionsDispatch]);
};
