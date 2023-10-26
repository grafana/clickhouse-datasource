import React, { useEffect, useMemo, useState } from 'react';
import { Filter, QueryBuilderOptions, SelectedColumn, ColumnHint, TimeUnit } from 'types/queryBuilder';
import { ColumnSelect } from '../ColumnSelect';
import { FiltersEditor } from '../FilterEditor';
import allLabels from 'labels';
import { ModeSwitch } from '../ModeSwitch';
import { getColumnByHint } from 'components/queryBuilder/utils';
import { Alert, Collapse, InlineFormLabel, Input, VerticalGroup } from '@grafana/ui';
import { DurationUnitSelect } from 'components/queryBuilder/DurationUnitSelect';
import { Datasource } from 'data/CHDatasource';
import { useBuilderOptionChanges } from 'hooks/useBuilderOptionChanges';
import useColumns from 'hooks/useColumns';

interface TraceQueryBuilderProps {
  datasource: Datasource;
  builderOptions: QueryBuilderOptions,
  onBuilderOptionsChange: (nextBuilderOptions: Partial<QueryBuilderOptions>) => void;
}

interface TraceQueryBuilderState {
  isSearchMode: boolean;
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
  filters: Filter[];
}

export const TraceQueryBuilder = (props: TraceQueryBuilderProps) => {
  const { datasource, builderOptions, onBuilderOptionsChange } = props;
  const allColumns = useColumns(datasource, builderOptions.database, builderOptions.table);
  const showConfigWarning = datasource.getDefaultTraceColumns().size === 0;
  const [isColumnsOpen, setColumnsOpen] = useState<boolean>(showConfigWarning); // Toggle Columns collapsable section
  const [isFiltersOpen, setFiltersOpen] = useState<boolean>(true); // Toggle Filters collapsable section
  const labels = allLabels.components.TraceQueryBuilder;
  const builderState: TraceQueryBuilderState = useMemo(() => ({
    isSearchMode: builderOptions.meta?.isTraceSearchMode || false,
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
    filters: builderOptions.filters || [],
  }), [builderOptions]);

  useEffect(() => {
    const shouldApplyDefaults = (builderOptions.columns || []).length === 0 && (builderOptions.orderBy || []).length === 0;
    if (!shouldApplyDefaults) {
      return;
    }

    const defaultDb = datasource.getDefaultTraceDatabase() || datasource.getDefaultDatabase();
    const defaultTable = datasource.getDefaultTraceTable() || datasource.getDefaultTable();
    const defaultDurationUnit = datasource.getDefaultTraceDurationUnit();
    const otelVersion = datasource.getTraceOtelVersion();
    const defaultColumns = datasource.getDefaultTraceColumns();

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
        traceDurationUnit: defaultDurationUnit
      }
    });

    // Run on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    onBuilderOptionsChange({
      columns: nextColumns,
      filters: next.filters,
      meta: {
        isTraceSearchMode: next.isSearchMode,
        traceDurationUnit: next.durationUnit,
        traceId: next.traceId,
      }
    });
  }, builderState);
  
  const configWarning = showConfigWarning && (
    <Alert title="" severity="warning">
      <VerticalGroup>
        <div>
          {'To speed up your query building, enter your default trace configuration in your '}
          <a style={{ textDecoration: 'underline' }} href={`/connections/datasources/edit/${encodeURIComponent(datasource.uid)}`}>ClickHouse Data Source settings</a>
        </div>
      </VerticalGroup>
    </Alert>
  );

  return (
    <div>
      <ModeSwitch
        labelA={labels.traceIdModeLabel}
        labelB={labels.traceSearchModeLabel}
        value={builderState.isSearchMode}
        onChange={onOptionChange('isSearchMode')}
        label={labels.traceModeLabel}
        tooltip={labels.traceModeTooltip}
      />

      <Collapse label={labels.columnsSection}
        collapsible
        isOpen={isColumnsOpen}
        onToggle={setColumnsOpen}
      >
        { configWarning }
        <div className="gf-form">
          <ColumnSelect
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
            unit={builderState.durationUnit}
            onChange={onOptionChange('durationUnit')}
            inline
          />
        </div>
        <div className="gf-form">
          <ColumnSelect
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
      { builderState.isSearchMode ? (
        <Collapse label={labels.filtersSection}
          collapsible
          isOpen={isFiltersOpen}
          onToggle={setFiltersOpen}
        >
          <FiltersEditor
            allColumns={allColumns}
            filters={builderState.filters}
            onFiltersChange={onOptionChange('filters')}
          />
        </Collapse>
      ) :
        <TraceIdInput traceId={builderState.traceId} onChange={onOptionChange('traceId')} />
      }
    </div>
  );
}

interface TraceIdInputProps {
  traceId: string;
  onChange: (traceId: string) => void;
};

const TraceIdInput = (props: TraceIdInputProps) => {
  const [inputId, setInputId] = useState<string>('');
  const { traceId, onChange } = props;
  const { label, tooltip } = allLabels.components.TraceQueryBuilder.columns.traceIdFilter;

  useEffect(() => {
    setInputId(traceId);
  }, [traceId])

  return (
    <div className="gf-form">
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <Input
        width={40}
        value={inputId}
        type="string"
        min={1}
        onChange={e => setInputId(e.currentTarget.value)}
        onBlur={() => onChange(inputId)}
      />
    </div>
  )
}
