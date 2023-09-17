import React, { useEffect, useState } from 'react';
import { ColumnsEditor } from '../ColumnsEditor';
import { AggregateColumn, BuilderMode, Filter, TableColumn, OrderBy, QueryBuilderOptions, ColumnHint, SelectedColumn, AggregateType } from 'types/queryBuilder';
import { OrderByEditor } from '../OrderByEditor';
import { LimitEditor } from '../LimitEditor';
import { FiltersEditor } from '../FilterEditor';
import allLabels from 'labels';
import { ModeSwitch } from '../ModeSwitch';
import { AggregateEditor } from '../AggregateEditor';
import { GroupByEditor } from '../GroupByEditor';
import { ColumnSelect } from '../ColumnSelect';
import { getColumnByHint } from 'components/queryBuilder/utils';

interface TimeSeriesQueryBuilderProps {
  allColumns: ReadonlyArray<TableColumn>;
  builderOptions: QueryBuilderOptions,
  onBuilderOptionsChange: (builderOptions: QueryBuilderOptions) => void;
}

const emptyAggregate: AggregateColumn = { column: '', aggregateType: AggregateType.Count };

export const TimeSeriesQueryBuilder = (props: TimeSeriesQueryBuilderProps) => {
  const { allColumns, builderOptions, onBuilderOptionsChange } = props;
  const [isAggregateMode, setAggregateMode] = useState<boolean>(false);
  const [timeColumn, setTimeColumn] = useState<SelectedColumn>();
  const [selectedColumns, setSelectedColumns] = useState<SelectedColumn[]>([]);
  const [aggregates, setAggregates] = useState<AggregateColumn[]>([emptyAggregate]);
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [orderBy, setOrderBy] = useState<OrderBy[]>([]);
  const [limit, setLimit] = useState<number>(100);
  const [filters, setFilters] = useState<Filter[]>([]);
  const labels = allLabels.components.TimeSeriesQueryBuilder;

  useEffect(() => {
    if (!builderOptions) {
      return;
    }

    builderOptions.aggregates && setAggregateMode(builderOptions.aggregates.length > 0);
    setTimeColumn(getColumnByHint(builderOptions, ColumnHint.Time));
    builderOptions.columns && setSelectedColumns(builderOptions.columns.filter(c => c.hint === undefined));
    builderOptions.aggregates && setAggregates(builderOptions.aggregates);
    builderOptions.groupBy && setGroupBy(builderOptions.groupBy);
    builderOptions.orderBy && setOrderBy(builderOptions.orderBy);
    builderOptions.limit && setLimit(builderOptions.limit);
    builderOptions.filters && setFilters(builderOptions.filters);

    // Run on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const nextColumns = selectedColumns.slice();
    if (timeColumn) {
      nextColumns.push(timeColumn);
    }

    const nextOptions: QueryBuilderOptions = {
      ...builderOptions,
      mode: isAggregateMode ? BuilderMode.Aggregate : BuilderMode.List,
      columns: nextColumns,
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
  }, [isAggregateMode, timeColumn, selectedColumns, filters, aggregates, groupBy, orderBy, limit]);

  const aggregateFields = (
    <>
      <AggregateEditor allColumns={allColumns} aggregates={aggregates} onAggregatesChange={setAggregates} />
      <GroupByEditor groupBy={groupBy} onGroupByChange={setGroupBy} allColumns={allColumns} />
    </>
  );

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
        selectedColumn={timeColumn}
        onColumnChange={setTimeColumn}
        columnHint={ColumnHint.Time}
        label={labels.timeColumn.label}
        tooltip={labels.timeColumn.tooltip}
      />
      <ColumnsEditor allColumns={allColumns} selectedColumns={selectedColumns} onSelectedColumnsChange={setSelectedColumns} />

      {isAggregateMode && aggregateFields}

      <OrderByEditor
        allColumns={allColumns}
        orderBy={orderBy}
        onOrderByChange={setOrderBy}
      />
      <LimitEditor limit={limit} onLimitChange={setLimit} />
      <FiltersEditor filters={filters} onFiltersChange={setFilters} allColumns={allColumns} />
    </div>
  );
}
