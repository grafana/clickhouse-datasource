import React, { useEffect, useState } from 'react';
import { ColumnsEditor } from '../ColumnsEditor';
import { BuilderMode, Filter, FullField, OrderBy, SqlBuilderOptions } from 'types/queryBuilder';
import { ColumnSelect } from '../ColumnSelect';
import { Switch } from '../Switch';
import { OtelVersionSelect } from '../OtelVersionSelect';
import { OrderByEditor } from '../OrderByEditor';
import { LimitEditor } from '../LimitEditor';
import { FiltersEditor } from '../FilterEditor';
import allSelectors from 'v4/selectors';

interface LogsQueryBuilderProps {
  allColumns: FullField[];
  builderOptions: SqlBuilderOptions,
  onBuilderOptionsChange: (builderOptions: SqlBuilderOptions) => void;
}

export const LogsQueryBuilder = (props: LogsQueryBuilderProps) => {
  const { allColumns, builderOptions, onBuilderOptionsChange } = props;
  const [otelEnabled, setOtelEnabled] = useState<boolean>(false);
  const [otelVersion, setOtelVersion] = useState<string>('');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [timeColumn, setTimeColumn] = useState<string>('');
  const [logLevelColumn, setLogLevelColumn] = useState<string>('');
  const [messageColumn, setMessageColumn] = useState<string>('');
  const [liveView, setLiveView] = useState<boolean>(false);
  const [orderBy, setOrderBy] = useState<OrderBy[]>([]);
  const [limit, setLimit] = useState<number>(100);
  const [filters, setFilters] = useState<Filter[]>([]);
  const selectors = allSelectors.components.LogsQueryBuilder;

  useEffect(() => {
    onBuilderOptionsChange({
      ...builderOptions,
      mode: BuilderMode.List,
      fields: selectedColumns,
      filters,
      orderBy,
      limit,
      timeField: timeColumn,
      logLevelField: logLevelColumn,
    });
  }, [selectedColumns, filters, orderBy, limit, timeColumn, logLevelColumn, messageColumn]);
  
  return (
    <div>
      <OtelVersionSelect
        enabled={otelEnabled}
        onEnabledChange={setOtelEnabled}
        selectedVersion={otelVersion}
        onVersionChange={setOtelVersion}
        defaultToLatest
      />
      <ColumnsEditor allColumns={allColumns} columns={selectedColumns} onColumnsChange={setSelectedColumns} />
      <div className="gf-form">
        <ColumnSelect
          allColumns={allColumns}
          selectedColumn={timeColumn}
          onColumnChange={setTimeColumn}
          label={selectors.logTimeColumn.label}
          tooltip={selectors.logTimeColumn.tooltip}
        />
        <ColumnSelect
          allColumns={allColumns}
          selectedColumn={logLevelColumn}
          onColumnChange={setLogLevelColumn}
          label={selectors.logLevelColumn.label}
          tooltip={selectors.logLevelColumn.tooltip}
        />
      </div>
      <div className="gf-form">
        <ColumnSelect
          allColumns={allColumns}
          selectedColumn={messageColumn}
          onColumnChange={setMessageColumn}
          label={selectors.logMessageColumn.label}
          tooltip={selectors.logMessageColumn.tooltip}
        />
        <Switch
          value={liveView}
          onChange={setLiveView}
          label={selectors.liveView.label}
          tooltip={selectors.liveView.tooltip}
        />
      </div>
      <OrderByEditor
        allColumns={allColumns}
        orderBy={orderBy}
        onOrderByItemsChange={setOrderBy}
      />
      <LimitEditor limit={limit} onLimitChange={setLimit} />
      <FiltersEditor filters={filters} onFiltersChange={setFilters} allColumns={allColumns} />
    </div>
  );
}
