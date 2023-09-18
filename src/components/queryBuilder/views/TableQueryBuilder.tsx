import React, { useEffect, useState } from 'react';
import { ColumnsEditor } from '../ColumnsEditor';
import { AggregateColumn, BuilderMode, Filter, TableColumn, OrderBy, QueryBuilderOptions, SelectedColumn, AggregateType } from 'types/queryBuilder';
import { OrderByEditor, getOrderByOptions } from '../OrderByEditor';
import { LimitEditor } from '../LimitEditor';
import { FiltersEditor } from '../FilterEditor';
import allLabels from 'labels';
import { ModeSwitch } from '../ModeSwitch';
import { AggregateEditor } from '../AggregateEditor';
import { GroupByEditor } from '../GroupByEditor';

interface TableQueryBuilderProps {
  allColumns: ReadonlyArray<TableColumn>;
  builderOptions: QueryBuilderOptions,
  onBuilderOptionsChange: (builderOptions: QueryBuilderOptions) => void;
}

const emptyAggregate: AggregateColumn = { column: '', aggregateType: AggregateType.Count };

export const TableQueryBuilder = (props: TableQueryBuilderProps) => {
  const { allColumns, builderOptions, onBuilderOptionsChange } = props;
  const [isAggregateMode, setAggregateMode] = useState<boolean>(false); // Toggle Simple vs Aggregate mode
  const [selectedColumns, setSelectedColumns] = useState<SelectedColumn[]>([]);
  const [aggregates, setAggregates] = useState<AggregateColumn[]>([emptyAggregate]);
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [orderBy, setOrderBy] = useState<OrderBy[]>([]);
  const [limit, setLimit] = useState<number>(1000);
  const [filters, setFilters] = useState<Filter[]>([]);
  const labels = allLabels.components.TableQueryBuilder;

  useEffect(() => {
    builderOptions.aggregates && setAggregateMode(builderOptions.aggregates.length > 0);
    builderOptions.columns && setSelectedColumns(builderOptions.columns);
    builderOptions.aggregates && setAggregates(builderOptions.aggregates);
    builderOptions.groupBy && setGroupBy(builderOptions.groupBy);
    builderOptions.orderBy && setOrderBy(builderOptions.orderBy);
    builderOptions.limit && setLimit(builderOptions.limit);
    builderOptions.filters && setFilters(builderOptions.filters);

    // Run on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const nextOptions: QueryBuilderOptions = {
      ...builderOptions,
      mode: isAggregateMode ? BuilderMode.Aggregate : BuilderMode.List,
      columns: selectedColumns,
      filters,
      orderBy,
      limit
    };

    if (isAggregateMode) {
      nextOptions.aggregates = aggregates;
      nextOptions.groupBy = groupBy;
    }

    onBuilderOptionsChange(nextOptions);

    // TODO: ignore when builderOptions changes?
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAggregateMode, selectedColumns, filters, aggregates, groupBy, orderBy, limit]);

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

      <ColumnsEditor allColumns={allColumns} selectedColumns={selectedColumns} onSelectedColumnsChange={setSelectedColumns} />

      {isAggregateMode && (
        <>
          <AggregateEditor allColumns={allColumns} aggregates={aggregates} onAggregatesChange={setAggregates} />
          <GroupByEditor groupBy={groupBy} onGroupByChange={setGroupBy} allColumns={allColumns} />
        </>
      )}

      <OrderByEditor
        orderByOptions={getOrderByOptions(builderOptions, allColumns)}
        orderBy={orderBy}
        onOrderByChange={setOrderBy}
      />
      <LimitEditor limit={limit} onLimitChange={setLimit} />
      <FiltersEditor filters={filters} onFiltersChange={setFilters} allColumns={allColumns} />
    </div>
  );
}
