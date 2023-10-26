import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ColumnsEditor } from '../ColumnsEditor';
import { AggregateColumn, BuilderMode, Filter, OrderBy, QueryBuilderOptions, ColumnHint, SelectedColumn, DateFilterWithoutValue, FilterOperator } from 'types/queryBuilder';
import { OrderByEditor, getOrderByOptions } from '../OrderByEditor';
import { LimitEditor } from '../LimitEditor';
import { FiltersEditor } from '../FilterEditor';
import allLabels from 'labels';
import { ModeSwitch } from '../ModeSwitch';
import { AggregateEditor } from '../AggregateEditor';
import { GroupByEditor } from '../GroupByEditor';
import { ColumnSelect } from '../ColumnSelect';
import { getColumnByHint } from 'components/queryBuilder/utils';
import { columnFilterDateTime } from 'data/columnFilters';
import { Datasource } from 'data/CHDatasource';
import { useBuilderOptionChanges } from 'hooks/useBuilderOptionChanges';
import useColumns from 'hooks/useColumns';

interface TimeSeriesQueryBuilderProps {
  datasource: Datasource;
  builderOptions: QueryBuilderOptions,
  onBuilderOptionsChange: (nextBuilderOptions: Partial<QueryBuilderOptions>) => void;
}

interface TimeSeriesQueryBuilderState {
  timeColumn?: SelectedColumn;
  selectedColumns: SelectedColumn[];
  aggregates: AggregateColumn[];
  groupBy: string[];
  orderBy: OrderBy[];
  limit: number;
  filters: Filter[];
}

export const TimeSeriesQueryBuilder = (props: TimeSeriesQueryBuilderProps) => {
  const { datasource, builderOptions, onBuilderOptionsChange } = props;
  const allColumns = useColumns(datasource, builderOptions.database, builderOptions.table);
  const labels = allLabels.components.TimeSeriesQueryBuilder;
  const [isAggregateMode, setAggregateMode] = useState<boolean>((builderOptions.aggregates?.length || 0) > 0); // Toggle Simple vs Aggregate mode
  const builderState: TimeSeriesQueryBuilderState = useMemo(() => ({
    timeColumn: getColumnByHint(builderOptions, ColumnHint.Time),
    selectedColumns: (builderOptions.columns || []).filter(c => c.hint !== ColumnHint.Time),
    aggregates: builderOptions.aggregates || [],
    groupBy: builderOptions.groupBy || [],
    orderBy: builderOptions.orderBy || [],
    limit: builderOptions.limit || 1000,
    filters: builderOptions.filters || [],
  }), [builderOptions]);

  const onOptionChange = useBuilderOptionChanges<TimeSeriesQueryBuilderState>(next => {
    const nextColumns = next.selectedColumns.slice();
    if (next.timeColumn) {
      nextColumns.push(next.timeColumn);
    }

    onBuilderOptionsChange({
      mode: isAggregateMode ? BuilderMode.Aggregate : BuilderMode.Trend,
      columns: nextColumns,
      aggregates: isAggregateMode ? next.aggregates : [],
      groupBy: isAggregateMode ? next.groupBy : [],
      filters: next.filters,
      orderBy: next.orderBy,
      limit: next.limit
    });
  }, builderState);

  // Select default time filter on timeColumn change
  const lastTimeColumn = useRef<string>(builderState.timeColumn?.name || '');
  useEffect(() => {
    if (!builderState.timeColumn) {
      return;
    } else if ((builderState.timeColumn.name === lastTimeColumn.current) || builderState.filters.find(f => f.id === 'timeRange')) {
      return;
    }

    const timeRangeFilter: DateFilterWithoutValue = {
      type: 'datetime',
      operator: FilterOperator.WithInGrafanaTimeRange,
      filterType: 'custom',
      key: builderState.timeColumn.name,
      id: 'timeRange',
      condition: 'AND'
    };

    lastTimeColumn.current = builderState.timeColumn.name;
    onOptionChange('filters')([timeRangeFilter, ...builderState.filters.filter(f => f.id !== 'timeRange')]);
  }, [builderState.timeColumn, builderState.filters, onOptionChange]);

  // Find and select a default time column, update when table changes
  const lastTable = useRef<string>(builderOptions.table);
  const defaultTimeSelected = useRef<boolean>(Boolean(builderState.timeColumn));
  useEffect(() => {
    if (builderOptions.table !== lastTable.current) {
      defaultTimeSelected.current = false;
    }

    if (allColumns.length === 0 || !builderOptions.table || defaultTimeSelected.current) {
      return;
    }

    const col = allColumns.filter(columnFilterDateTime)[0];
    const currentColumnExists = (builderState.timeColumn && allColumns.find(c => c.name === builderState.timeColumn?.name));
    if (!col || currentColumnExists) {
      return;
    }

    const timeColumn: SelectedColumn = {
      name: col.name,
      type: col.type,
      hint: ColumnHint.Time
    };
  
    lastTable.current = builderOptions.table;
    defaultTimeSelected.current = true;
    onOptionChange('timeColumn')(timeColumn);

  }, [allColumns, builderOptions.table, builderState.timeColumn, onOptionChange]);

  return (
    <div>
      <ModeSwitch
        labelA={labels.simpleQueryModeLabel}
        labelB={labels.aggregateQueryModeLabel}
        value={isAggregateMode}
        onChange={setAggregateMode}
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
      />
      <ColumnsEditor
        allColumns={allColumns}
        selectedColumns={builderState.selectedColumns}
        onSelectedColumnsChange={onOptionChange('selectedColumns')}
      />

      {isAggregateMode && (
        <>
          <AggregateEditor allColumns={allColumns} aggregates={builderState.aggregates} onAggregatesChange={onOptionChange('aggregates')} />
          <GroupByEditor groupBy={builderState.groupBy} onGroupByChange={onOptionChange('groupBy')} allColumns={allColumns} />
        </>
      )}

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
