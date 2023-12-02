import { columnFilterDateTime } from 'data/columnFilters';
import { BuilderOptionsReducerAction, setColumnByHint, setOptions } from 'hooks/useBuilderOptionsState';
import React, { useEffect, useRef } from 'react';
import { ColumnHint, DateFilterWithoutValue, Filter, FilterOperator, SelectedColumn, TableColumn } from 'types/queryBuilder';

// Finds and selects a default log time column, updates when table changes
export const useDefaultTimeColumn = (allColumns: readonly TableColumn[], table: string, timeColumn: SelectedColumn | undefined, builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>) => {
  const didSetDefaultTime = useRef<boolean>(Boolean(timeColumn));
  const lastTable = useRef<string>(table || '');
  if (table !== lastTable.current) {
    didSetDefaultTime.current = false;
  }

  useEffect(() => {
    if (didSetDefaultTime.current || allColumns.length === 0 || !table) {
      return;
    }

    const col = allColumns.filter(columnFilterDateTime)[0];
    if (!col) {
      return;
    }

    const timeColumn: SelectedColumn = {
      name: col.name,
      type: col.type,
      hint: ColumnHint.Time
    };

    builderOptionsDispatch(setColumnByHint(timeColumn));
    lastTable.current = table;
    didSetDefaultTime.current = true;
  }, [allColumns, table, builderOptionsDispatch]);
};

// Apply default filters/orderBy on timeColumn change
const timeRangeFilterId = 'timeRange';
export const useDefaultFilters = (table: string, timeColumn: SelectedColumn | undefined, filters: Filter[], builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>) => {
  const lastTimeColumn = useRef<string>(timeColumn?.name || '');
  const lastTable = useRef<string>(table || '');
  if (!timeColumn || table !== lastTable.current) {
    lastTimeColumn.current = '';
  }

  useEffect(() => {
    if (!timeColumn || (timeColumn.name === lastTimeColumn.current) || !table) {
      return;
    }

    const nextFilters: Filter[] = filters.filter(f => f.id !== timeRangeFilterId);
    const timeRangeFilter: DateFilterWithoutValue = {
      type: 'datetime',
      operator: FilterOperator.WithInGrafanaTimeRange,
      filterType: 'custom',
      key: timeColumn.name,
      id: timeRangeFilterId,
      condition: 'AND'
    };
    nextFilters.unshift(timeRangeFilter);
    
    lastTable.current = table;
    lastTimeColumn.current = timeColumn.name;
    builderOptionsDispatch(setOptions({
      filters: nextFilters
    }));
  }, [table, timeColumn, filters, builderOptionsDispatch]);
};
