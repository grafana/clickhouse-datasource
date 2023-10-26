import React, { useEffect, useMemo, useRef } from 'react';
import { ColumnsEditor } from '../ColumnsEditor';
import { Filter, OrderBy, QueryBuilderOptions, SelectedColumn, ColumnHint, DateFilterWithoutValue, FilterOperator } from 'types/queryBuilder';
import { ColumnSelect } from '../ColumnSelect';
import { OtelVersionSelect } from '../OtelVersionSelect';
import { OrderByEditor, getOrderByOptions } from '../OrderByEditor';
import { LimitEditor } from '../LimitEditor';
import { FiltersEditor } from '../FilterEditor';
import allLabels from 'labels';
import { getColumnByHint } from 'components/queryBuilder/utils';
import { columnFilterDateTime, columnFilterString } from 'data/columnFilters';
import { Datasource } from 'data/CHDatasource';
import { useBuilderOptionChanges } from 'hooks/useBuilderOptionChanges';
import { versions as otelVersions } from 'otel';
import { Alert, VerticalGroup } from '@grafana/ui';
import useColumns from 'hooks/useColumns';

interface LogsQueryBuilderProps {
  datasource: Datasource;
  builderOptions: QueryBuilderOptions,
  onBuilderOptionsChange: (nextBuilderOptions: Partial<QueryBuilderOptions>) => void;
}

interface LogsQueryBuilderState {
  otelEnabled: boolean;
  otelVersion: string;
  selectedColumns: SelectedColumn[];
  timeColumn?: SelectedColumn;
  logLevelColumn?: SelectedColumn;
  messageColumn?: SelectedColumn;
  // liveView: boolean;
  orderBy: OrderBy[];
  limit: number;
  filters: Filter[];
}

export const LogsQueryBuilder = (props: LogsQueryBuilderProps) => {
  const { datasource, builderOptions, onBuilderOptionsChange } = props;
  const labels = allLabels.components.LogsQueryBuilder;
  const allColumns = useColumns(datasource, builderOptions.database, builderOptions.table);
  const builderState: LogsQueryBuilderState = useMemo(() => ({
    otelEnabled: builderOptions.meta?.otelEnabled || false,
    otelVersion: builderOptions.meta?.otelVersion || '',
    timeColumn: getColumnByHint(builderOptions, ColumnHint.Time),
    logLevelColumn: getColumnByHint(builderOptions, ColumnHint.LogLevel),
    messageColumn: getColumnByHint(builderOptions, ColumnHint.LogMessage),
    selectedColumns: builderOptions.columns?.filter(c => (
      // Only select columns that don't have their own box
      c.hint !== ColumnHint.Time &&
      c.hint !== ColumnHint.LogLevel &&
      c.hint !== ColumnHint.LogMessage
    )) || [],
    // liveView: builderOptions.meta?.liveView || false,
    orderBy: builderOptions.orderBy || [],
    limit: builderOptions.limit || 1000,
    filters: builderOptions.filters || [],
    }), [builderOptions]);
  const showConfigWarning = datasource.getDefaultLogsColumns().size === 0;

  function setOtelColumns(builderState: LogsQueryBuilderState) {
    if (!builderState.otelEnabled) {
      return;
    }

    const otelConfig = otelVersions.find(v => v.version === builderState.otelVersion);
    const logColumnMap = otelConfig?.logColumnMap;
    if (!otelConfig || !logColumnMap) {
      return;
    }

    builderState.selectedColumns = [];
    if (logColumnMap.has(ColumnHint.Time)) {
      builderState.timeColumn = { name: logColumnMap.get(ColumnHint.Time)!, hint: ColumnHint.Time };
    }
    if (logColumnMap.has(ColumnHint.LogLevel)) {
      builderState.logLevelColumn = { name: logColumnMap.get(ColumnHint.LogLevel)!, hint: ColumnHint.LogLevel };
    }
    if (logColumnMap.has(ColumnHint.LogMessage)) {
      builderState.messageColumn = { name: logColumnMap.get(ColumnHint.LogMessage)!, hint: ColumnHint.LogMessage };
    }
  }

  const onOptionChange = useBuilderOptionChanges<LogsQueryBuilderState>(next => {
    if (next.otelEnabled) {
      setOtelColumns(next);
    }

    const nextColumns = next.selectedColumns.slice();
    if (next.timeColumn) {
      nextColumns.push(next.timeColumn);
    }
    if (next.logLevelColumn) {
      nextColumns.push(next.logLevelColumn);
    }
    if (next.messageColumn) {
      nextColumns.push(next.messageColumn);
    }

    const nextOptions = {
      columns: nextColumns,
      filters: next.filters,
      orderBy: next.orderBy,
      limit: next.limit,
      meta: {
        otelEnabled: next.otelEnabled,
        otelVersion: next.otelVersion,
      }
    };

    onBuilderOptionsChange(nextOptions);
  }, builderState);

  useEffect(() => {
    const shouldApplyDefaults = (builderOptions.columns || []).length === 0 && (builderOptions.orderBy || []).length === 0;
    if (!shouldApplyDefaults) {
      return;
    }

    const defaultDb = datasource.getDefaultLogsDatabase() || datasource.getDefaultDatabase();
    const defaultTable = datasource.getDefaultLogsTable() || datasource.getDefaultTable();
    const otelVersion = datasource.getLogsOtelVersion();
    const defaultColumns = datasource.getDefaultLogsColumns();

    const nextColumns: SelectedColumn[] = [];
    for (let [hint, colName] of defaultColumns) {
      nextColumns.push({ name: colName, hint });
    }

    onBuilderOptionsChange({
      database: defaultDb,
      table: defaultTable || builderOptions.table,
      columns: nextColumns,
      // filters,
      // orderBy,
      meta: {
        otelEnabled: Boolean(otelVersion),
        otelVersion,
      }
    });

    // Run on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  
  const configWarning = showConfigWarning && (
    <Alert title="" severity="warning">
      <VerticalGroup>
        <div>
          {'To speed up your query building, enter your default logs configuration in your '}
          <a style={{ textDecoration: 'underline' }} href={`/connections/datasources/edit/${encodeURIComponent(datasource.uid)}`}>ClickHouse Data Source settings</a>
        </div>
      </VerticalGroup>
    </Alert>
  );

  return (
    <div>
      { configWarning }
      <OtelVersionSelect
        enabled={builderState.otelEnabled}
        onEnabledChange={onOptionChange('otelEnabled')}
        selectedVersion={builderState.otelVersion}
        onVersionChange={onOptionChange('otelVersion')}
        defaultToLatest
      />
      <ColumnsEditor
        disabled={builderState.otelEnabled}
        allColumns={allColumns}
        selectedColumns={builderState.selectedColumns}
        onSelectedColumnsChange={onOptionChange('selectedColumns')}
      />
      <div className="gf-form">
        <ColumnSelect
          disabled={builderState.otelEnabled}
          allColumns={allColumns}
          selectedColumn={builderState.timeColumn}
          invalid={!builderState.timeColumn}
          onColumnChange={onOptionChange('timeColumn')}
          columnFilterFn={columnFilterDateTime}
          columnHint={ColumnHint.Time}
          label={labels.logTimeColumn.label}
          tooltip={labels.logTimeColumn.tooltip}
        />
        <ColumnSelect
          disabled={builderState.otelEnabled}
          allColumns={allColumns}
          selectedColumn={builderState.logLevelColumn}
          onColumnChange={onOptionChange('logLevelColumn')}
          columnFilterFn={columnFilterString}
          columnHint={ColumnHint.LogLevel}
          label={labels.logLevelColumn.label}
          tooltip={labels.logLevelColumn.tooltip}
          inline
        />
      </div>
      <div className="gf-form">
        <ColumnSelect
          disabled={builderState.otelEnabled}
          allColumns={allColumns}
          selectedColumn={builderState.messageColumn}
          invalid={!builderState.messageColumn}
          onColumnChange={onOptionChange('messageColumn')}
          columnFilterFn={columnFilterString}
          columnHint={ColumnHint.LogMessage}
          label={labels.logMessageColumn.label}
          tooltip={labels.logMessageColumn.tooltip}
        />
        {/* <Switch
          value={builderState.liveView}
          onChange={onOptionChange('liveView')}
          label={labels.liveView.label}
          tooltip={labels.liveView.tooltip}
          inline
        /> */}
      </div>
      <OrderByEditor
        orderByOptions={getOrderByOptions(builderOptions, allColumns)}
        orderBy={builderState.orderBy}
        onOrderByChange={onOptionChange('orderBy')}
      />
      <LimitEditor limit={builderState.limit} onLimitChange={onOptionChange('limit')} />
      <FiltersEditor
        allColumns={allColumns}
        filters={builderState.filters}
        onFiltersChange={onOptionChange('filters')}
      />
    </div>
  );
}
