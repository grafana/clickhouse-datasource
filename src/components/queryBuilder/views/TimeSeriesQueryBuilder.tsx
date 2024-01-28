import React, { useMemo } from 'react';
import { ColumnsEditor } from '../ColumnsEditor';
import { AggregateColumn, BuilderMode, Filter, OrderBy, QueryBuilderOptions, ColumnHint, SelectedColumn } from 'types/queryBuilder';
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
import { BuilderOptionsReducerAction, setOptions } from 'hooks/useBuilderOptionsState';
import { useDefaultFilters, useDefaultTimeColumn } from './timeSeriesQueryBuilderHooks';
import useIsNewQuery from 'hooks/useIsNewQuery';

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
  const isNewQuery = useIsNewQuery(builderOptions);
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
    limit: builderOptions.limit || 0,
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
  useDefaultFilters(builderOptions.table, isNewQuery, builderOptionsDispatch);

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
      <FiltersEditor
        filters={builderState.filters}
        onFiltersChange={onOptionChange('filters')}
        allColumns={allColumns}
        datasource={datasource}
        database={builderOptions.database}
        table={builderOptions.table}
      />
    </div>
  );
}
