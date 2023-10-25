import React, { useEffect, useState } from 'react';
import { ColumnsEditor } from '../ColumnsEditor';
import { AggregateColumn, BuilderMode, Filter, TableColumn, OrderBy, QueryBuilderOptions, ColumnHint, SelectedColumn } from 'types/queryBuilder';
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

interface TimeSeriesQueryBuilderProps {
  allColumns: readonly TableColumn[];
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
  const { allColumns, builderOptions, onBuilderOptionsChange } = props;
  const labels = allLabels.components.TimeSeriesQueryBuilder;
  const [isAggregateMode, setAggregateMode] = useState<boolean>((builderOptions.aggregates?.length || 0) > 0); // Toggle Simple vs Aggregate mode
  const builderState: TimeSeriesQueryBuilderState = {
    timeColumn: getColumnByHint(builderOptions, ColumnHint.Time),
    selectedColumns: (builderOptions.columns || []).filter(c => c.hint !== ColumnHint.Time),
    aggregates: builderOptions.aggregates || [],
    groupBy: builderOptions.groupBy || [],
    orderBy: builderOptions.orderBy || [],
    limit: builderOptions.limit || 1000,
    filters: builderOptions.filters || [],
  };

  const onOptionChange = useBuilderOptionChanges<TimeSeriesQueryBuilderState>(next => {
    const nextColumns = next.selectedColumns.slice();
    if (next.timeColumn) {
      nextColumns.push(next.timeColumn);
    }

    onBuilderOptionsChange({
      mode: isAggregateMode ? BuilderMode.Aggregate : BuilderMode.List,
      columns: nextColumns,
      aggregates: isAggregateMode ? next.aggregates : [],
      groupBy: isAggregateMode ? next.groupBy : [],
      filters: next.filters,
      orderBy: next.orderBy,
      limit: next.limit
    });
  }, builderState);

  useEffect(() => {
    if (allColumns.length === 0) {
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
  
    onOptionChange('timeColumn')(timeColumn);

    // Find and select a default time column, update when table changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allColumns, builderOptions.table]);

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
