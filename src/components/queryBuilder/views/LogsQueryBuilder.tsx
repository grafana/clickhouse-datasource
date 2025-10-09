import React, { useEffect, useMemo, useState } from 'react';
import { ColumnsEditor } from '../ColumnsEditor';
import { Filter, OrderBy, QueryBuilderOptions, SelectedColumn, ColumnHint } from 'types/queryBuilder';
import { ColumnSelect } from '../ColumnSelect';
import { OtelVersionSelect } from '../OtelVersionSelect';
import { OrderByEditor, getOrderByOptions } from '../OrderByEditor';
import { LimitEditor } from '../LimitEditor';
import { FiltersEditor } from '../FilterEditor';
import allLabels from 'labels';
import { getColumnByHint } from 'data/sqlGenerator';
import { columnFilterDateTime, columnFilterString } from 'data/columnFilters';
import { Datasource } from 'data/CHDatasource';
import { useBuilderOptionChanges } from 'hooks/useBuilderOptionChanges';
import { Alert, Button, InlineFormLabel, Input, VerticalGroup } from '@grafana/ui';
import useColumns from 'hooks/useColumns';
import { BuilderOptionsReducerAction, setOptions, setOtelEnabled, setOtelVersion } from 'hooks/useBuilderOptionsState';
import useIsNewQuery from 'hooks/useIsNewQuery';
import {
  useDefaultFilters,
  useDefaultTimeColumn,
  useLogDefaultsOnMount,
  useOtelColumns,
} from './logsQueryBuilderHooks';
import { styles } from 'styles';
import { Components as allSelectors } from 'selectors';

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
  labelsColumn?: SelectedColumn;
  // liveView: boolean;
  orderBy: OrderBy[];
  limit: number;
  filters: Filter[];
  logMessageLike: string;
}

export const LogsQueryBuilder = (props: LogsQueryBuilderProps) => {
  const { datasource, builderOptions, builderOptionsDispatch } = props;
  const labels = allLabels.components.LogsQueryBuilder;
  const allColumns = useColumns(datasource, builderOptions.database, builderOptions.table);
  const isNewQuery = useIsNewQuery(builderOptions);
  const builderState: LogsQueryBuilderState = useMemo(
    () => ({
      otelEnabled: builderOptions.meta?.otelEnabled || false,
      otelVersion: builderOptions.meta?.otelVersion || '',
      timeColumn: getColumnByHint(builderOptions, ColumnHint.Time),
      logLevelColumn: getColumnByHint(builderOptions, ColumnHint.LogLevel),
      messageColumn: getColumnByHint(builderOptions, ColumnHint.LogMessage),
      labelsColumn: getColumnByHint(builderOptions, ColumnHint.LogLabels),
      selectedColumns:
        builderOptions.columns?.filter(
          (c) =>
            // Only select columns that don't have their own box
            c.hint !== ColumnHint.Time &&
            c.hint !== ColumnHint.LogLevel &&
            c.hint !== ColumnHint.LogMessage &&
            c.hint !== ColumnHint.LogLabels
        ) || [],
      // liveView: builderOptions.meta?.liveView || false,
      filters: builderOptions.filters || [],
      orderBy: builderOptions.orderBy || [],
      limit: builderOptions.limit || 0,
      logMessageLike: builderOptions.meta?.logMessageLike || '',
    }),
    [builderOptions]
  );
  const [showConfigWarning, setConfigWarningOpen] = useState(
    datasource.getDefaultLogsColumns().size === 0 && builderOptions.columns?.length === 0
  );

  const onOptionChange = useBuilderOptionChanges<LogsQueryBuilderState>((next) => {
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
    if (next.labelsColumn) {
      nextColumns.push(next.labelsColumn);
    }

    builderOptionsDispatch(
      setOptions({
        columns: nextColumns,
        filters: next.filters,
        orderBy: next.orderBy,
        limit: next.limit,
        meta: {
          logMessageLike: next.logMessageLike,
        },
      })
    );
  }, builderState);

  useLogDefaultsOnMount(datasource, isNewQuery, builderOptions, builderOptionsDispatch);
  useOtelColumns(datasource, builderState.otelEnabled, builderState.otelVersion, builderOptionsDispatch);
  useDefaultTimeColumn(
    datasource,
    allColumns,
    builderOptions.table,
    builderState.timeColumn,
    builderState.otelEnabled,
    builderOptionsDispatch
  );
  useDefaultFilters(builderOptions.table, isNewQuery, builderOptionsDispatch);

  const configWarning = showConfigWarning && (
    <Alert title="" severity="warning" buttonContent="Close" onRemove={() => setConfigWarningOpen(false)}>
      <VerticalGroup>
        <div>
          {'To speed up your query building, enter your default logs configuration in your '}
          <a
            style={{ textDecoration: 'underline' }}
            href={`/connections/datasources/edit/${encodeURIComponent(datasource.uid)}#logs-config`}
          >
            ClickHouse Data Source settings
          </a>
        </div>
      </VerticalGroup>
    </Alert>
  );

  return (
    <div>
      {configWarning}
      <OtelVersionSelect
        enabled={builderState.otelEnabled}
        onEnabledChange={(e) => builderOptionsDispatch(setOtelEnabled(e))}
        selectedVersion={builderState.otelVersion}
        onVersionChange={(v) => builderOptionsDispatch(setOtelVersion(v))}
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
        <ColumnSelect
          disabled={builderState.otelEnabled}
          allColumns={allColumns}
          selectedColumn={builderState.labelsColumn}
          invalid={!builderState.labelsColumn}
          onColumnChange={onOptionChange('labelsColumn')}
          columnHint={ColumnHint.LogLabels}
          label={labels.logLabelsColumn.label}
          tooltip={labels.logLabelsColumn.tooltip}
          inline
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
        filters={builderState.filters}
        onFiltersChange={onOptionChange('filters')}
        allColumns={allColumns}
        datasource={datasource}
        database={builderOptions.database}
        table={builderOptions.table}
      />
      <LogMessageLikeInput logMessageLike={builderState.logMessageLike} onChange={onOptionChange('logMessageLike')} />
    </div>
  );
};

interface LogMessageLikeInputProps {
  logMessageLike: string;
  onChange: (logMessageLike: string) => void;
}

const LogMessageLikeInput = (props: LogMessageLikeInputProps) => {
  const [input, setInput] = useState<string>('');
  const { logMessageLike, onChange } = props;
  const { label, tooltip, clearButton } = allLabels.components.LogsQueryBuilder.logMessageFilter;

  useEffect(() => {
    setInput(logMessageLike);
  }, [logMessageLike]);

  return (
    <div className="gf-form">
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <Input
        width={200}
        value={input}
        type="string"
        onChange={(e) => setInput(e.currentTarget.value)}
        onBlur={() => onChange(input)}
      />
      {logMessageLike && (
        <Button
          data-testid={allSelectors.QueryBuilder.LogsQueryBuilder.LogMessageLikeInput.input}
          variant="secondary"
          size="md"
          onClick={() => onChange('')}
          className={styles.Common.smallBtn}
          tooltip={allLabels.components.expandBuilderButton.tooltip}
        >
          {clearButton}
        </Button>
      )}
    </div>
  );
};
