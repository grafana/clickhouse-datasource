import React, { useEffect, useState } from 'react';
import { ColumnsEditor } from '../ColumnsEditor';
import { BuilderMetricField, BuilderMode, Filter, FullField, OrderBy, SqlBuilderOptions } from 'types/queryBuilder';
import { OrderByEditor } from '../OrderByEditor';
import { LimitEditor } from '../LimitEditor';
import { FiltersEditor } from '../FilterEditor';
import allSelectors from 'v4/selectors';
import { ModeSwitch } from '../ModeSwitch';
import { SqlBuilderOptionsAggregate, SqlBuilderOptionsList } from 'types';
import { AggregatesEditor } from '../AggregateEditor';
import { GroupByEditor } from '../GroupByEditor';

interface TimeSeriesQueryBuilderProps {
  allColumns: FullField[];
  builderOptions: SqlBuilderOptions,
  onBuilderOptionsChange: (builderOptions: SqlBuilderOptions) => void;
}

export const TimeSeriesQueryBuilder = (props: TimeSeriesQueryBuilderProps) => {
  const { allColumns, builderOptions, onBuilderOptionsChange } = props;
  const [isAggregateMode, setAggregateMode] = useState<boolean>(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [aggregates, setAggregates] = useState<BuilderMetricField[]>([]);
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [orderBy, setOrderBy] = useState<OrderBy[]>([]);
  const [limit, setLimit] = useState<number>(100);
  const [filters, setFilters] = useState<Filter[]>([]);
  const selectors = allSelectors.components.TimeSeriesQueryBuilder;

  useEffect(() => {
    let nextOptions: SqlBuilderOptions;

    if (isAggregateMode) {
      const aggregateOptions: SqlBuilderOptionsAggregate = {
        ...builderOptions as SqlBuilderOptionsAggregate,
        mode: BuilderMode.Aggregate,
        fields: selectedColumns,
        metrics: aggregates,
        groupBy: groupBy,
        filters,
        orderBy,
        limit,
      };
      nextOptions = aggregateOptions;
    } else {
      const simpleOptions: SqlBuilderOptionsList = {
        ...builderOptions,
        mode: BuilderMode.List,
        fields: selectedColumns,
        filters,
        orderBy,
        limit,
      }
      nextOptions = simpleOptions;
    }

    onBuilderOptionsChange(nextOptions);
  }, [isAggregateMode, selectedColumns, filters, aggregates, groupBy, orderBy, limit]);
  
  const simpleView = (
      <>
        <ColumnsEditor allColumns={allColumns} columns={selectedColumns} onColumnsChange={setSelectedColumns} />
        <OrderByEditor
          allColumns={allColumns}
          orderBy={orderBy}
          onOrderByItemsChange={setOrderBy}
        />
        <LimitEditor limit={limit} onLimitChange={setLimit} />
        <FiltersEditor filters={filters} onFiltersChange={setFilters} allColumns={allColumns} />
      </>
  );

  const aggregateView = (
    <>
      <ColumnsEditor allColumns={allColumns} columns={selectedColumns} onColumnsChange={setSelectedColumns} />
      <AggregatesEditor aggregates={aggregates} onAggregatesChange={setAggregates} allColumns={allColumns} />
      <GroupByEditor groupBy={groupBy} onGroupByChange={setGroupBy} allColumns={allColumns} />
      <OrderByEditor
        allColumns={allColumns}
        orderBy={orderBy}
        onOrderByItemsChange={setOrderBy}
      />
      <LimitEditor limit={limit} onLimitChange={setLimit} />
      <FiltersEditor filters={filters} onFiltersChange={setFilters} allColumns={allColumns} />
    </>
  );

  return (
    <div>
      <ModeSwitch
        labelA={selectors.simpleQueryModeLabel}
        labelB={selectors.aggregateQueryModeLabel}
        value={isAggregateMode}
        onChange={setAggregateMode}
        label={selectors.builderModeLabel}
        tooltip={selectors.builderModeTooltip}
      />

      {isAggregateMode ? aggregateView : simpleView}
    </div>
  );
}
