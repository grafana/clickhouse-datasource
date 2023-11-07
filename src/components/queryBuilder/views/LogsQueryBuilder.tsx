import React, { useEffect, useMemo, useRef } from 'react';
import { ColumnsEditor } from '../ColumnsEditor';
import { Filter, OrderBy, QueryBuilderOptions, SelectedColumn, ColumnHint, DateFilterWithoutValue, FilterOperator, OrderByDirection, TableColumn } from 'types/queryBuilder';
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
import { BuilderOptionsReducerAction, setColumnByHint, setOptions, setOtelEnabled, setOtelVersion } from 'hooks/useBuilderOptionsState';
import useIsNewQuery from 'hooks/useIsNewQuery';

interface LogsQueryBuilderProps {
  datasource: Datasource;
  builderOptions: QueryBuilderOptions;
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>;
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
  const { datasource, builderOptions, builderOptionsDispatch } = props;
  const labels = allLabels.components.LogsQueryBuilder;
  const allColumns = useColumns(datasource, builderOptions.database, builderOptions.table);
  const isNewQuery = useIsNewQuery(builderOptions);
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
    filters: builderOptions.filters || [],
    orderBy: builderOptions.orderBy || [],
    limit: builderOptions.limit || 1000,
    }), [builderOptions]);
  const showConfigWarning = datasource.getDefaultLogsColumns().size === 0;

  const onOptionChange = useBuilderOptionChanges<LogsQueryBuilderState>(next => {
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

    builderOptionsDispatch(setOptions({
      columns: nextColumns,
      filters: next.filters,
      orderBy: next.orderBy,
      limit: next.limit
    }));
  }, builderState);

  useLogDefaultsOnMount(datasource, isNewQuery, builderOptions, builderOptionsDispatch);
  useOtelColumns(builderState.otelEnabled, builderState.otelVersion, builderOptionsDispatch);
  useDefaultTimeColumn(datasource, allColumns, builderOptions.table, builderState.timeColumn, builderState.otelEnabled, builderOptionsDispatch);
  useDefaultFilters(builderOptions.table, builderState.timeColumn, builderState.filters, builderState.orderBy, builderOptionsDispatch);
  
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
        onEnabledChange={e => builderOptionsDispatch(setOtelEnabled(e))}
        selectedVersion={builderState.otelVersion}
        onVersionChange={v => builderOptionsDispatch(setOtelVersion(v))}
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
          invalid={!builderState.logLevelColumn}
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

/**
 * Loads the default configuration for new queries. (Only runs on new queries)
 */
const useLogDefaultsOnMount = (datasource: Datasource, isNewQuery: boolean, builderOptions: QueryBuilderOptions, builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>) => {
  const didSetDefaults = useRef<boolean>(false);
  useEffect(() => {
    if (!isNewQuery || didSetDefaults.current) {
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

    builderOptionsDispatch(setOptions({
      database: defaultDb,
      table: defaultTable || builderOptions.table,
      columns: nextColumns,
      meta: {
        otelEnabled: Boolean(otelVersion),
        otelVersion,
      }
    }));
    didSetDefaults.current = true;
  }, [builderOptions.columns, builderOptions.orderBy, builderOptions.table, builderOptionsDispatch, datasource, isNewQuery]);
};

/**
 * Sets OTEL Logs columns automatically when OTEL is enabled
 */
const useOtelColumns = (otelEnabled: boolean, otelVersion: string, builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>) => {
  const didSetColumns = useRef<boolean>(otelEnabled);
  if (!otelEnabled) {
    didSetColumns.current = false;
  }

  useEffect(() => {
    if (!otelEnabled || didSetColumns.current) {
      return;
    }

    const otelConfig = otelVersions.find(v => v.version === otelVersion);
    const logColumnMap = otelConfig?.logColumnMap;
    if (!otelConfig || !logColumnMap) {
      return;
    }

    const columns: SelectedColumn[] = [];
    logColumnMap.forEach((name, hint) => {
      columns.push({ name, hint });
    });

    builderOptionsDispatch(setOptions({ columns }));
    didSetColumns.current = true;
  }, [otelEnabled, otelVersion, builderOptionsDispatch]);
};

// Finds and selects a default log time column, updates when table changes
const useDefaultTimeColumn = (datasource: Datasource, allColumns: readonly TableColumn[], table: string, timeColumn: SelectedColumn | undefined, otelEnabled: boolean, builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>) => {
  const hasDefaultColumnConfigured = useMemo(() => Boolean(datasource.getDefaultLogsTable()) && datasource.getDefaultLogsColumns().has(ColumnHint.Time), [datasource]);
  const didSetDefaultTime = useRef<boolean>(Boolean(timeColumn) || hasDefaultColumnConfigured);
  const lastTable = useRef<string>(table || '');
  if (table !== lastTable.current) {
    didSetDefaultTime.current = false;
  }

  if (Boolean(timeColumn) || otelEnabled) {
    lastTable.current = table;
    didSetDefaultTime.current = true;
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
  }, [datasource, allColumns, table, builderOptionsDispatch]);
};

// Apply default filters/orderBy on timeColumn change
const timeRangeFilterId = 'timeRange';
const useDefaultFilters = (table: string, timeColumn: SelectedColumn | undefined, filters: Filter[], orderBy: OrderBy[], builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>) => {
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

    const nextOrderBy: OrderBy[] = orderBy.filter(o => !o.default);
    const defaultOrderBy: OrderBy = { name: timeColumn?.name, dir: OrderByDirection.DESC, default: true };
    nextOrderBy.unshift(defaultOrderBy);
    
    lastTable.current = table;
    lastTimeColumn.current = timeColumn.name;
    builderOptionsDispatch(setOptions({
      filters: nextFilters,
      orderBy: nextOrderBy
    }));
  }, [table, timeColumn, filters, orderBy, builderOptionsDispatch]);
};
