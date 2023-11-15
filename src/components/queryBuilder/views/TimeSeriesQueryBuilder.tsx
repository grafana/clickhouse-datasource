import React, { useEffect, useMemo, useRef } from 'react';
import { ColumnsEditor } from '../ColumnsEditor';
import { AggregateColumn, BuilderMode, Filter, OrderBy, QueryBuilderOptions, ColumnHint, SelectedColumn, DateFilterWithoutValue, FilterOperator, TableColumn } from 'types/queryBuilder';
import { OrderByEditor, getOrderByOptions } from '../OrderByEditor';
import { LimitEditor } from '../LimitEditor';
import { FiltersEditor } from '../FilterEditor';
import allLabels from 'labels';
import { ModeSwitch } from '../ModeSwitch';
import { AggregateEditor } from '../AggregateEditor';
import { GroupByEditor } from '../GroupByEditor';
import { ColumnSelect } from '../ColumnSelect';
import { getColumnByHint } from 'data/sqlGenerator';
import { columnFilterDateTime } from 'data/columnFilters';
import { Datasource } from 'data/CHDatasource';
import { useBuilderOptionChanges } from 'hooks/useBuilderOptionChanges';
import useColumns from 'hooks/useColumns';
import { BuilderOptionsReducerAction, setColumnByHint, setOptions } from 'hooks/useBuilderOptionsState';

interface TimeSeriesQueryBuilderProps {
  datasource: Datasource;
  builderOptions: QueryBuilderOptions,
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>,
}

interface TimeSeriesQueryBuilderState {
  isAggregateMode: boolean;
  timeColumn?: SelectedColumn;
  selectedColumns: SelectedColumn[];
  aggregates: AggregateColumn[];
  groupBy: string[];
  orderBy: OrderBy[];
  limit: number;
  filters: Filter[];
}

export const TimeSeriesQueryBuilder = (props: TimeSeriesQueryBuilderProps) => {
  const { datasource, builderOptions, builderOptionsDispatch } = props;
  const allColumns = useColumns(datasource, builderOptions.database, builderOptions.table);
  const labels = allLabels.components.TimeSeriesQueryBuilder;
  const builderState: TimeSeriesQueryBuilderState = useMemo(() => ({
    // TODO: do not depend on "mode"
    isAggregateMode: builderOptions.mode === BuilderMode.Trend,
    timeColumn: getColumnByHint(builderOptions, ColumnHint.Time),
    selectedColumns: (builderOptions.columns || []).filter(c => c.hint !== ColumnHint.Time),
    aggregates: builderOptions.aggregates || [],
    groupBy: builderOptions.groupBy || [],
    orderBy: builderOptions.orderBy || [],
    limit: builderOptions.limit || 1000,
    filters: builderOptions.filters || [],
  }), [builderOptions]);

  const onOptionChange = useBuilderOptionChanges<TimeSeriesQueryBuilderState>(next => {
    let nextColumns = next.selectedColumns.slice();
    if (next.isAggregateMode) {
      nextColumns = [];
    }

    if (next.timeColumn) {
      nextColumns.push(next.timeColumn);
    }

    builderOptionsDispatch(setOptions({
      mode: next.isAggregateMode ? BuilderMode.Trend : BuilderMode.Aggregate,
      columns: nextColumns,
      aggregates: next.isAggregateMode ? next.aggregates : [],
      groupBy: next.isAggregateMode ? next.groupBy : [],
      filters: next.filters,
      orderBy: next.orderBy,
      limit: next.limit
    }));
  }, builderState);

  useDefaultTimeColumn(allColumns, builderOptions.table, builderState.timeColumn, builderOptionsDispatch);
  useDefaultFilters(builderOptions.table, builderState.timeColumn, builderState.filters, builderOptionsDispatch);

  return (
    <div>
      <ModeSwitch
        labelA={labels.simpleQueryModeLabel}
        labelB={labels.aggregateQueryModeLabel}
        value={builderState.isAggregateMode}
        onChange={onOptionChange('isAggregateMode')}
        label={labels.builderModeLabel}
        tooltip={labels.builderModeTooltip}
      />

      <ColumnSelect
        allColumns={allColumns}
        selectedColumn={builderState.timeColumn}
        invalid={!builderState.timeColumn}
        onColumnChange={onOptionChange('timeColumn')}
        columnFilterFn={columnFilterDateTime}
        columnHint={ColumnHint.Time}
        label={labels.timeColumn.label}
        tooltip={labels.timeColumn.tooltip}
        clearable={false}
      />

      { builderState.isAggregateMode ? 
        <>
          <AggregateEditor allColumns={allColumns} aggregates={builderState.aggregates} onAggregatesChange={onOptionChange('aggregates')} />
          <GroupByEditor groupBy={builderState.groupBy} onGroupByChange={onOptionChange('groupBy')} allColumns={allColumns} />
        </>
        :
        <ColumnsEditor
          allColumns={allColumns}
          selectedColumns={builderState.selectedColumns}
          onSelectedColumnsChange={onOptionChange('selectedColumns')}
        />
      }

      <OrderByEditor
        orderByOptions={getOrderByOptions(builderOptions, allColumns)}
        orderBy={builderState.orderBy}
        onOrderByChange={onOptionChange('orderBy')}
      />
      <LimitEditor limit={builderState.limit} onLimitChange={onOptionChange('limit')} />
      <FiltersEditor filters={builderState.filters} onFiltersChange={onOptionChange('filters')} allColumns={allColumns} />
    </div>
  );
}

// Finds and selects a default log time column, updates when table changes
const useDefaultTimeColumn = (allColumns: readonly TableColumn[], table: string, timeColumn: SelectedColumn | undefined, builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>) => {
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
const useDefaultFilters = (table: string, timeColumn: SelectedColumn | undefined, filters: Filter[], builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>) => {
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
