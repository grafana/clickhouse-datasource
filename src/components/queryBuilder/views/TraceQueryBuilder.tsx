import React, { useMemo, useState } from 'react';
import { Filter, QueryBuilderOptions, SelectedColumn, ColumnHint, TimeUnit, OrderBy } from 'types/queryBuilder';
import { ColumnSelect } from '../ColumnSelect';
import { FiltersEditor } from '../FilterEditor';
import allLabels from 'labels';
import { ModeSwitch } from '../ModeSwitch';
import { getColumnByHint } from 'data/sqlGenerator';
import { Alert, Collapse, VerticalGroup } from '@grafana/ui';
import { DurationUnitSelect } from 'components/queryBuilder/DurationUnitSelect';
import { Datasource } from 'data/CHDatasource';
import { useBuilderOptionChanges } from 'hooks/useBuilderOptionChanges';
import useColumns from 'hooks/useColumns';
import { BuilderOptionsReducerAction, setOptions, setOtelEnabled, setOtelVersion } from 'hooks/useBuilderOptionsState';
import useIsNewQuery from 'hooks/useIsNewQuery';
import { OtelVersionSelect } from '../OtelVersionSelect';
import { useDefaultFilters, useOtelColumns, useTraceDefaultsOnMount } from './traceQueryBuilderHooks';
import TraceIdInput from '../TraceIdInput';
import { OrderByEditor, getOrderByOptions } from '../OrderByEditor';
import { LimitEditor } from '../LimitEditor';

interface TraceQueryBuilderProps {
  datasource: Datasource;
  builderOptions: QueryBuilderOptions;
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>;
}

interface TraceQueryBuilderState {
  isTraceIdMode: boolean;
  otelEnabled: boolean;
  otelVersion: string;
  traceIdColumn?: SelectedColumn;
  spanIdColumn?: SelectedColumn;
  parentSpanIdColumn?: SelectedColumn;
  serviceNameColumn?: SelectedColumn;
  operationNameColumn?: SelectedColumn;
  startTimeColumn?: SelectedColumn;
  durationTimeColumn?: SelectedColumn;
  durationUnit: TimeUnit;
  tagsColumn?: SelectedColumn;
  serviceTagsColumn?: SelectedColumn;
  traceId: string;
  orderBy: OrderBy[];
  limit: number;
  filters: Filter[];
}

export const TraceQueryBuilder = (props: TraceQueryBuilderProps) => {
  const { datasource, builderOptions, builderOptionsDispatch } = props;
  const allColumns = useColumns(datasource, builderOptions.database, builderOptions.table);
  const isNewQuery = useIsNewQuery(builderOptions);
  const [showConfigWarning, setConfigWarningOpen] = useState(datasource.getDefaultTraceColumns().size === 0 && builderOptions.columns?.length === 0);
  const [isColumnsOpen, setColumnsOpen] = useState<boolean>(showConfigWarning); // Toggle Columns collapse section
  const [isFiltersOpen, setFiltersOpen] = useState<boolean>(!(builderOptions.meta?.isTraceIdMode && builderOptions.meta.traceId)); // Toggle Filters collapse section
  const labels = allLabels.components.TraceQueryBuilder;
  const builderState: TraceQueryBuilderState = useMemo(() => ({
    isTraceIdMode: builderOptions.meta?.isTraceIdMode || false,
    otelEnabled: builderOptions.meta?.otelEnabled || false,
    otelVersion: builderOptions.meta?.otelVersion || '',
    traceIdColumn: getColumnByHint(builderOptions, ColumnHint.TraceId),
    spanIdColumn: getColumnByHint(builderOptions, ColumnHint.TraceSpanId),
    parentSpanIdColumn: getColumnByHint(builderOptions, ColumnHint.TraceParentSpanId),
    serviceNameColumn: getColumnByHint(builderOptions, ColumnHint.TraceServiceName),
    operationNameColumn: getColumnByHint(builderOptions, ColumnHint.TraceOperationName),
    startTimeColumn: getColumnByHint(builderOptions, ColumnHint.Time),
    durationTimeColumn: getColumnByHint(builderOptions, ColumnHint.TraceDurationTime),
    durationUnit: builderOptions.meta?.traceDurationUnit || TimeUnit.Nanoseconds,
    tagsColumn: getColumnByHint(builderOptions, ColumnHint.TraceTags),
    serviceTagsColumn: getColumnByHint(builderOptions, ColumnHint.TraceServiceTags),
    traceId: builderOptions.meta?.traceId || '',
    orderBy: builderOptions.orderBy || [],
    limit: builderOptions.limit || 0,
    filters: builderOptions.filters || [],
  }), [builderOptions]);

  const onOptionChange = useBuilderOptionChanges<TraceQueryBuilderState>(next => {
    const nextColumns = [
      next.traceIdColumn,
      next.spanIdColumn,
      next.parentSpanIdColumn,
      next.serviceNameColumn,
      next.operationNameColumn,
      next.startTimeColumn,
      next.durationTimeColumn,
      next.tagsColumn,
      next.serviceTagsColumn
    ].filter(c => c !== undefined) as SelectedColumn[];

    builderOptionsDispatch(setOptions({
      columns: nextColumns,
      orderBy: next.orderBy,
      limit: next.limit,
      filters: next.filters,
      meta: {
        isTraceIdMode: next.isTraceIdMode,
        traceDurationUnit: next.durationUnit,
        traceId: next.traceId,
      }
    }));
  }, builderState);

  useTraceDefaultsOnMount(datasource, isNewQuery, builderOptions, builderOptionsDispatch);
  useOtelColumns(builderState.otelEnabled, builderState.otelVersion, builderOptionsDispatch);
  useDefaultFilters(builderOptions.table, builderState.isTraceIdMode, isNewQuery, builderOptionsDispatch);

  const configWarning = showConfigWarning && (
    <Alert title="" severity="warning" buttonContent="Close" onRemove={() => setConfigWarningOpen(false)}>
      <VerticalGroup>
        <div>
          {'To speed up your query building, enter your default trace configuration in your '}
          <a style={{ textDecoration: 'underline' }} href={`/connections/datasources/edit/${encodeURIComponent(datasource.uid)}#traces-config`}>ClickHouse Data Source settings</a>
        </div>
      </VerticalGroup>
    </Alert>
  );

  return (
    <div>
      <ModeSwitch
        labelA={labels.traceSearchModeLabel}
        labelB={labels.traceIdModeLabel}
        value={builderState.isTraceIdMode}
        onChange={onOptionChange('isTraceIdMode')}
        label={labels.traceModeLabel}
        tooltip={labels.traceModeTooltip}
      />

      <Collapse label={labels.columnsSection}
        collapsible
        isOpen={isColumnsOpen}
        onToggle={setColumnsOpen}
      >
        { configWarning }
        <OtelVersionSelect
          enabled={builderState.otelEnabled}
          onEnabledChange={e => builderOptionsDispatch(setOtelEnabled(e))}
          selectedVersion={builderState.otelVersion}
          onVersionChange={v => builderOptionsDispatch(setOtelVersion(v))}
          wide
        />
        <div className="gf-form">
          <ColumnSelect
            disabled={builderState.otelEnabled}
            allColumns={allColumns}
            selectedColumn={builderState.traceIdColumn}
            invalid={!builderState.traceIdColumn}
            onColumnChange={onOptionChange('traceIdColumn')}
            columnHint={ColumnHint.TraceId}
            label={labels.columns.traceId.label}
            tooltip={labels.columns.traceId.tooltip}
            wide
          />
          <ColumnSelect
            disabled={builderState.otelEnabled}
            allColumns={allColumns}
            selectedColumn={builderState.spanIdColumn}
            invalid={!builderState.spanIdColumn}
            onColumnChange={onOptionChange('spanIdColumn')}
            columnHint={ColumnHint.TraceSpanId}
            label={labels.columns.spanId.label}
            tooltip={labels.columns.spanId.tooltip}
            wide
            inline
          />
        </div>
        <div className="gf-form">
          <ColumnSelect
            disabled={builderState.otelEnabled}
            allColumns={allColumns}
            selectedColumn={builderState.parentSpanIdColumn}
            invalid={!builderState.parentSpanIdColumn}
            onColumnChange={onOptionChange('parentSpanIdColumn')}
            columnHint={ColumnHint.TraceParentSpanId}
            label={labels.columns.parentSpanId.label}
            tooltip={labels.columns.parentSpanId.tooltip}
            wide
          />
          <ColumnSelect
            disabled={builderState.otelEnabled}
            allColumns={allColumns}
            selectedColumn={builderState.serviceNameColumn}
            invalid={!builderState.serviceNameColumn}
            onColumnChange={onOptionChange('serviceNameColumn')}
            columnHint={ColumnHint.TraceServiceName}
            label={labels.columns.serviceName.label}
            tooltip={labels.columns.serviceName.tooltip}
            wide
            inline
          />
        </div>
        <div className="gf-form">
          <ColumnSelect
            disabled={builderState.otelEnabled}
            allColumns={allColumns}
            selectedColumn={builderState.operationNameColumn}
            invalid={!builderState.operationNameColumn}
            onColumnChange={onOptionChange('operationNameColumn')}
            columnHint={ColumnHint.TraceOperationName}
            label={labels.columns.operationName.label}
            tooltip={labels.columns.operationName.tooltip}
            wide
          />
          <ColumnSelect
            disabled={builderState.otelEnabled}
            allColumns={allColumns}
            selectedColumn={builderState.startTimeColumn}
            invalid={!builderState.startTimeColumn}
            onColumnChange={onOptionChange('startTimeColumn')}
            columnHint={ColumnHint.Time}
            label={labels.columns.startTime.label}
            tooltip={labels.columns.startTime.tooltip}
            wide
            inline
          />
        </div>
        <div className="gf-form">
          <ColumnSelect
            disabled={builderState.otelEnabled}
            allColumns={allColumns}
            selectedColumn={builderState.durationTimeColumn}
            invalid={!builderState.durationTimeColumn}
            onColumnChange={onOptionChange('durationTimeColumn')}
            columnHint={ColumnHint.TraceDurationTime}
            label={labels.columns.durationTime.label}
            tooltip={labels.columns.durationTime.tooltip}
            wide
          />
          <DurationUnitSelect
            disabled={builderState.otelEnabled}
            unit={builderState.durationUnit}
            onChange={onOptionChange('durationUnit')}
            inline
          />
        </div>
        <div className="gf-form">
          <ColumnSelect
            disabled={builderState.otelEnabled}
            allColumns={allColumns}
            selectedColumn={builderState.tagsColumn}
            invalid={!builderState.tagsColumn}
            onColumnChange={onOptionChange('tagsColumn')}
            columnHint={ColumnHint.TraceTags}
            label={labels.columns.tags.label}
            tooltip={labels.columns.tags.tooltip}
            wide
          />
          <ColumnSelect
            disabled={builderState.otelEnabled}
            allColumns={allColumns}
            selectedColumn={builderState.serviceTagsColumn}
            invalid={!builderState.serviceTagsColumn}
            onColumnChange={onOptionChange('serviceTagsColumn')}
            columnHint={ColumnHint.TraceServiceTags}
            label={labels.columns.serviceTags.label}
            tooltip={labels.columns.serviceTags.tooltip}
            wide
            inline
          />
        </div>
      </Collapse>
      <Collapse label={labels.filtersSection}
        collapsible
        isOpen={isFiltersOpen}
        onToggle={setFiltersOpen}
      >
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
          datasource={datasource}
          database={builderOptions.database}
          table={builderOptions.table}
        />
      </Collapse>
      { builderState.isTraceIdMode && <TraceIdInput traceId={builderState.traceId} onChange={onOptionChange('traceId')} /> }
    </div>
  );
}
