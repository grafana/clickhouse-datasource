import { columnFilterDateTime } from 'data/columnFilters';
import { BuilderOptionsReducerAction, setColumnByHint, setOptions } from 'hooks/useBuilderOptionsState';
import React, { useEffect, useRef } from 'react';
import {
  ColumnHint,
  DateFilterWithoutValue,
  Filter,
  FilterOperator,
  OrderBy,
  OrderByDirection,
  SelectedColumn,
  TableColumn,
} from 'types/queryBuilder';

// Finds and selects a default log time column, updates when table changes
export const useDefaultTimeColumn = (
  allColumns: readonly TableColumn[],
  table: string,
  timeColumn: SelectedColumn | undefined,
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>
) => {
  const didSetDefaultTime = useRef<boolean>(Boolean(timeColumn));
  const lastTable = useRef<string>(table || '');

  useEffect(() => {
    // Track the table and an already-chosen time column here, in the Effect, rather than during
    // render: refs must not be read or written while rendering.
    if (table !== lastTable.current) {
      didSetDefaultTime.current = false;
    }
    if (timeColumn) {
      lastTable.current = table;
      didSetDefaultTime.current = true;
    }

    if (didSetDefaultTime.current || allColumns.length === 0 || !table) {
      return;
    }

    const col = allColumns.filter(columnFilterDateTime)[0];
    if (!col) {
      return;
    }

    const defaultTimeColumn: SelectedColumn = {
      name: col.name,
      type: col.type,
      hint: ColumnHint.Time,
    };

    builderOptionsDispatch(setColumnByHint(defaultTimeColumn));
    lastTable.current = table;
    didSetDefaultTime.current = true;
  }, [allColumns, table, timeColumn, builderOptionsDispatch]);
};

export const getDefaultTimeSeriesFilters = (): Filter[] => [
  {
    type: 'datetime',
    operator: FilterOperator.WithInGrafanaTimeRange,
    filterType: 'custom',
    key: '',
    hint: ColumnHint.Time,
    condition: 'AND',
  } as DateFilterWithoutValue,
];

export const getDefaultTimeSeriesOrderBy = (): OrderBy[] => [
  { name: '', hint: ColumnHint.Time, dir: OrderByDirection.ASC, default: true },
];

// Apply default filters to a new query once it has a table; a table change keeps the query's filters
export const useDefaultFilters = (
  table: string,
  isNewQuery: boolean,
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>
) => {
  const appliedDefaultFilters = useRef<boolean>(!isNewQuery);

  useEffect(() => {
    if (!table || appliedDefaultFilters.current) {
      return;
    }

    appliedDefaultFilters.current = true;
    builderOptionsDispatch(
      setOptions({
        filters: getDefaultTimeSeriesFilters(),
        orderBy: getDefaultTimeSeriesOrderBy(),
      })
    );
  }, [table, builderOptionsDispatch]);
};
