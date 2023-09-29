import React, { useEffect, useState } from 'react';
import { BuilderMode, Filter, TableColumn, QueryBuilderOptions, SelectedColumn, ColumnHint, TimeUnit } from 'types/queryBuilder';
import { ColumnSelect } from '../ColumnSelect';
import { FiltersEditor } from '../FilterEditor';
import allLabels from 'labels';
import { ModeSwitch } from '../ModeSwitch';
import { getColumnByHint } from 'components/queryBuilder/utils';
import { Collapse, InlineFormLabel, Input, Select } from '@grafana/ui';
import { SelectableValue } from '@grafana/data';
import { styles } from 'styles';

interface TraceQueryBuilderProps {
  allColumns: ReadonlyArray<TableColumn>;
  builderOptions: QueryBuilderOptions,
  onBuilderOptionsChange: (builderOptions: QueryBuilderOptions) => void;
}

export const TraceQueryBuilder = (props: TraceQueryBuilderProps) => {
  const { allColumns, builderOptions, onBuilderOptionsChange } = props;
  const [isSearchMode, setSearchMode] = useState<boolean>(false); // Toggle for Trace ID vs Trace Search mode
  const [isColumnsOpen, setColumnsOpen] = useState<boolean>(true); // Toggle Columns collapsable section
  const [isFiltersOpen, setFiltersOpen] = useState<boolean>(true); // Toggle Filters collapsable section
  const [traceIdColumn, setTraceIdColumn] = useState<SelectedColumn>();
  const [spanIdColumn, setSpanIdColumn] = useState<SelectedColumn>();
  const [parentSpanIdColumn, setParentSpanIdColumn] = useState<SelectedColumn>();
  const [serviceNameColumn, setServiceNameColumn] = useState<SelectedColumn>();
  const [operationNameColumn, setOperationNameColumn] = useState<SelectedColumn>();
  const [startTimeColumn, setStartTimeColumn] = useState<SelectedColumn>();
  const [durationTimeColumn, setDurationTimeColumn] = useState<SelectedColumn>();
  const [durationUnit, setDurationUnit] = useState<TimeUnit>(TimeUnit.Nanoseconds);
  const [tagsColumn, setTagsColumn] = useState<SelectedColumn>();
  const [serviceTagsColumn, setServiceTagsColumn] = useState<SelectedColumn>();
  const [traceId, setTraceId] = useState<string>('');
  const [filters, setFilters] = useState<Filter[]>([]);
  const labels = allLabels.components.TraceQueryBuilder;

  useEffect(() => {
    builderOptions.meta?.isTraceSearchMode !== undefined && setSearchMode(builderOptions.meta.isTraceSearchMode);
    setTraceIdColumn(getColumnByHint(builderOptions, ColumnHint.TraceId));
    setSpanIdColumn(getColumnByHint(builderOptions, ColumnHint.TraceSpanId));
    setParentSpanIdColumn(getColumnByHint(builderOptions, ColumnHint.TraceParentSpanId));
    setServiceNameColumn(getColumnByHint(builderOptions, ColumnHint.TraceServiceName));
    setOperationNameColumn(getColumnByHint(builderOptions, ColumnHint.TraceOperationName));
    setStartTimeColumn(getColumnByHint(builderOptions, ColumnHint.TraceStartTime));
    setDurationTimeColumn(getColumnByHint(builderOptions, ColumnHint.TraceDurationTime));
    builderOptions.meta?.traceDurationUnit && setDurationUnit(builderOptions.meta.traceDurationUnit);
    setTagsColumn(getColumnByHint(builderOptions, ColumnHint.TraceTags));
    setServiceTagsColumn(getColumnByHint(builderOptions, ColumnHint.TraceServiceTags));
    builderOptions.meta?.traceId && setTraceId(builderOptions.meta.traceId);
    builderOptions.filters && setFilters(builderOptions.filters);

    // Run on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const nextColumns = [
      traceIdColumn,
      spanIdColumn,
      parentSpanIdColumn,
      serviceNameColumn,
      operationNameColumn,
      startTimeColumn,
      durationTimeColumn,
      tagsColumn,
      serviceTagsColumn
    ].filter(c => c !== undefined) as SelectedColumn[];
    

    onBuilderOptionsChange({
      ...builderOptions,
      mode: BuilderMode.List,
      columns: nextColumns,
      filters,
      meta: {
        ...builderOptions.meta,
        isTraceSearchMode: isSearchMode,
        traceDurationUnit: durationUnit,
        traceId: traceId,
      }
    });

    // TODO: ignore when builderOptions changes?
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceIdColumn, spanIdColumn, parentSpanIdColumn, serviceNameColumn, operationNameColumn, startTimeColumn, durationTimeColumn, tagsColumn, serviceTagsColumn, filters, isSearchMode, durationUnit, traceId]);
  
  return (
    <div>
      <ModeSwitch
        labelA={labels.traceIdModeLabel}
        labelB={labels.traceSearchModeLabel}
        value={isSearchMode}
        onChange={setSearchMode}
        label={labels.traceModeLabel}
        tooltip={labels.traceModeTooltip}
      />

      <Collapse label={labels.columnsSection}
        collapsible
        isOpen={isColumnsOpen}
        onToggle={setColumnsOpen}
      >
        <div className="gf-form">
          <ColumnSelect
            allColumns={allColumns}
            selectedColumn={traceIdColumn}
            onColumnChange={setTraceIdColumn}
            columnHint={ColumnHint.TraceId}
            label={labels.columns.traceId.label}
            tooltip={labels.columns.traceId.tooltip}
            wide
          />
          <ColumnSelect
            allColumns={allColumns}
            selectedColumn={spanIdColumn}
            onColumnChange={setSpanIdColumn}
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
            selectedColumn={parentSpanIdColumn}
            onColumnChange={setParentSpanIdColumn}
            columnHint={ColumnHint.TraceParentSpanId}
            label={labels.columns.parentSpanId.label}
            tooltip={labels.columns.parentSpanId.tooltip}
            wide
          />
          <ColumnSelect
            allColumns={allColumns}
            selectedColumn={serviceNameColumn}
            onColumnChange={setServiceNameColumn}
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
            selectedColumn={operationNameColumn}
            onColumnChange={setOperationNameColumn}
            columnHint={ColumnHint.TraceOperationName}
            label={labels.columns.operationName.label}
            tooltip={labels.columns.operationName.tooltip}
            wide
          />
          <ColumnSelect
            allColumns={allColumns}
            selectedColumn={startTimeColumn}
            onColumnChange={setStartTimeColumn}
            columnHint={ColumnHint.TraceStartTime}
            label={labels.columns.startTime.label}
            tooltip={labels.columns.startTime.tooltip}
            wide
            inline
          />
        </div>
        <div className="gf-form">
          <ColumnSelect
            allColumns={allColumns}
            selectedColumn={durationTimeColumn}
            onColumnChange={setDurationTimeColumn}
            columnHint={ColumnHint.TraceDurationTime}
            label={labels.columns.durationTime.label}
            tooltip={labels.columns.durationTime.tooltip}
            wide
          />
          <DurationUnitSelect
            unit={durationUnit}
            onChange={setDurationUnit}
          />
        </div>
        <div className="gf-form">
          <ColumnSelect
            allColumns={allColumns}
            selectedColumn={tagsColumn}
            onColumnChange={setTagsColumn}
            columnHint={ColumnHint.TraceTags}
            label={labels.columns.tags.label}
            tooltip={labels.columns.tags.tooltip}
            wide
          />
          <ColumnSelect
            allColumns={allColumns}
            selectedColumn={serviceTagsColumn}
            onColumnChange={setServiceTagsColumn}
            columnHint={ColumnHint.TraceServiceTags}
            label={labels.columns.serviceTags.label}
            tooltip={labels.columns.serviceTags.tooltip}
            wide
            inline
          />
        </div>
      </Collapse>
      { isSearchMode ? (
        <Collapse label={labels.filtersSection}
          collapsible
          isOpen={isFiltersOpen}
          onToggle={setFiltersOpen}
        >
          <FiltersEditor filters={filters} onFiltersChange={setFilters} allColumns={allColumns} />
        </Collapse>
      ) :
        <TraceIdInput traceId={traceId} onChange={setTraceId} />
      }
    </div>
  );
}

interface DurationUnitSelectProps {
  unit: TimeUnit;
  onChange: (u: TimeUnit) => void;
};

const durationUnitOptions: ReadonlyArray<SelectableValue<TimeUnit>> = [
  { label: TimeUnit.Seconds, value: TimeUnit.Seconds },
  { label: TimeUnit.Milliseconds, value: TimeUnit.Milliseconds },
  { label: TimeUnit.Microseconds, value: TimeUnit.Microseconds },
  { label: TimeUnit.Nanoseconds, value: TimeUnit.Nanoseconds },
];

const DurationUnitSelect = (props: DurationUnitSelectProps) => {
  const { unit, onChange } = props;
  const { label, tooltip } = allLabels.components.TraceQueryBuilder.columns.durationUnit;

  return (
    <div className="gf-form">
      <InlineFormLabel width={12} className={`query-keyword ${styles.QueryEditor.inlineField}`} tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <Select<TimeUnit>
        options={durationUnitOptions as Array<SelectableValue<TimeUnit>>}
        value={unit}
        onChange={v => onChange(v.value!)}
        width={25}
        menuPlacement={'bottom'}
      />
    </div>
  );
};

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