import React, { useEffect, useState } from 'react';
import { ColumnsEditor } from '../ColumnsEditor';
import { BuilderMode, Filter, TableColumn, OrderBy, QueryBuilderOptions, SelectedColumn, ColumnHint } from 'types/queryBuilder';
import { ColumnSelect } from '../ColumnSelect';
import { Switch } from '../Switch';
import { OtelVersionSelect } from '../OtelVersionSelect';
import { OrderByEditor } from '../OrderByEditor';
import { LimitEditor } from '../LimitEditor';
import { FiltersEditor } from '../FilterEditor';
import allLabels from 'labels';
import { getColumnByHint } from 'components/queryBuilder/utils';

interface LogsQueryBuilderProps {
  allColumns: ReadonlyArray<TableColumn>;
  builderOptions: QueryBuilderOptions,
  onBuilderOptionsChange: (builderOptions: QueryBuilderOptions) => void;
}

export const LogsQueryBuilder = (props: LogsQueryBuilderProps) => {
  const { allColumns, builderOptions, onBuilderOptionsChange } = props;
  const [otelEnabled, setOtelEnabled] = useState<boolean>(false);
  const [otelVersion, setOtelVersion] = useState<string>('');
  const [selectedColumns, setSelectedColumns] = useState<SelectedColumn[]>([]);
  const [timeColumn, setTimeColumn] = useState<SelectedColumn>();
  const [logLevelColumn, setLogLevelColumn] = useState<SelectedColumn>();
  const [messageColumn, setMessageColumn] = useState<SelectedColumn>();
  const [liveView, setLiveView] = useState<boolean>(false);
  const [orderBy, setOrderBy] = useState<OrderBy[]>([]);
  const [limit, setLimit] = useState<number>(100);
  const [filters, setFilters] = useState<Filter[]>([]);
  const labels = allLabels.components.LogsQueryBuilder;

  useEffect(() => {
    builderOptions.meta?.otelEnabled !== undefined && setOtelEnabled(builderOptions.meta.otelEnabled);
    builderOptions.meta?.otelVersion && setOtelVersion(builderOptions.meta.otelVersion);
    setTimeColumn(getColumnByHint(builderOptions, ColumnHint.Time));
    setLogLevelColumn(getColumnByHint(builderOptions, ColumnHint.LogLevel));
    setMessageColumn(getColumnByHint(builderOptions, ColumnHint.LogMessage));
    builderOptions.columns && setSelectedColumns(builderOptions.columns.filter(c => c.hint === undefined));
    builderOptions.meta?.liveView && setLiveView(builderOptions.meta.liveView);
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
    if (logLevelColumn) {
      nextColumns.push(logLevelColumn);
    }
    if (messageColumn) {
      nextColumns.push(messageColumn);
    }

    onBuilderOptionsChange({
      ...builderOptions,
      mode: BuilderMode.List,
      columns: nextColumns,
      filters,
      orderBy,
      limit,
      meta: {
        ...builderOptions.meta,
        otelEnabled,
        otelVersion,
      }
    });

    // TODO: ignore when builderOptions changes?
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otelEnabled, otelVersion, selectedColumns, filters, orderBy, limit, timeColumn, logLevelColumn, messageColumn]);
  
  return (
    <div>
      <OtelVersionSelect
        enabled={otelEnabled}
        onEnabledChange={setOtelEnabled}
        selectedVersion={otelVersion}
        onVersionChange={setOtelVersion}
        defaultToLatest
      />
      <ColumnsEditor allColumns={allColumns} selectedColumns={selectedColumns} onSelectedColumnsChange={setSelectedColumns} />
      <div className="gf-form">
        <ColumnSelect
          allColumns={allColumns}
          selectedColumn={timeColumn}
          onColumnChange={setTimeColumn}
          columnHint={ColumnHint.Time}
          label={labels.logTimeColumn.label}
          tooltip={labels.logTimeColumn.tooltip}
        />
        <ColumnSelect
          allColumns={allColumns}
          selectedColumn={logLevelColumn}
          onColumnChange={setLogLevelColumn}
          columnHint={ColumnHint.LogLevel}
          label={labels.logLevelColumn.label}
          tooltip={labels.logLevelColumn.tooltip}
          inline
        />
      </div>
      <div className="gf-form">
        <ColumnSelect
          allColumns={allColumns}
          selectedColumn={messageColumn}
          onColumnChange={setMessageColumn}
          columnHint={ColumnHint.LogMessage}
          label={labels.logMessageColumn.label}
          tooltip={labels.logMessageColumn.tooltip}
        />
        <Switch
          value={liveView}
          onChange={setLiveView}
          label={labels.liveView.label}
          tooltip={labels.liveView.tooltip}
          inline
        />
      </div>
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
