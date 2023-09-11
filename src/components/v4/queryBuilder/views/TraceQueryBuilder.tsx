import React, { useEffect, useState } from 'react';
import { BuilderMode, Filter, TableColumn, QueryBuilderOptions, SelectedColumn, ColumnHint } from 'types/queryBuilder';
import { ColumnSelect } from '../ColumnSelect';
import { FiltersEditor } from '../FilterEditor';
import allSelectors from 'v4/selectors';
import { ModeSwitch } from '../ModeSwitch';
import { getColumnByHint } from 'components/queryBuilder/utils';

interface TraceQueryBuilderProps {
  allColumns: TableColumn[];
  builderOptions: QueryBuilderOptions,
  onBuilderOptionsChange: (builderOptions: QueryBuilderOptions) => void;
}

export const TraceQueryBuilder = (props: TraceQueryBuilderProps) => {
  const { allColumns, builderOptions, onBuilderOptionsChange } = props;
  const [isSearchMode, setSearchMode] = useState<boolean>(false);
  const [traceIdColumn, setTraceIdColumn] = useState<SelectedColumn>();
  const [spanIdColumn, setSpanIdColumn] = useState<SelectedColumn>();
  const [parentSpanIdColumn, setParentSpanIdColumn] = useState<SelectedColumn>();
  const [serviceNameColumn, setServiceNameColumn] = useState<SelectedColumn>();
  const [operationNameColumn, setOperationNameColumn] = useState<SelectedColumn>();
  const [startTimeColumn, setStartTimeColumn] = useState<SelectedColumn>();
  const [durationTimeColumn, setDurationTimeColumn] = useState<SelectedColumn>();
  const [, setDurationUnit] = useState<string>();
  const [tagsColumn, setTagsColumn] = useState<SelectedColumn>();
  const [serviceTagsColumn, setServiceTagsColumn] = useState<SelectedColumn>();
  const [, setTraceId] = useState<string>();
  const [filters, setFilters] = useState<Filter[]>([]);
  const selectors = allSelectors.components.TraceQueryBuilder;

  useEffect(() => {
    if (!builderOptions) {
      return;
    }

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
    });

    // TODO: ignore when builderOptions changes?
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceIdColumn, spanIdColumn, parentSpanIdColumn, serviceNameColumn, operationNameColumn, startTimeColumn, durationTimeColumn, tagsColumn, serviceTagsColumn]);
  
  return (
    <div>
      <ModeSwitch
        labelA={selectors.traceIdModeLabel}
        labelB={selectors.traceSearchModeLabel}
        value={isSearchMode}
        onChange={setSearchMode}
        label={selectors.traceModeLabel}
        tooltip={selectors.traceModeTooltip}
      />

      <div className="gf-form">
        <ColumnSelect
          allColumns={allColumns}
          selectedColumn={traceIdColumn}
          onColumnChange={setTraceIdColumn}
          columnHint={ColumnHint.TraceId}
          label={selectors.fields.traceId.label}
          tooltip={selectors.fields.traceId.tooltip}
          wide
        />
        <ColumnSelect
          allColumns={allColumns}
          selectedColumn={spanIdColumn}
          onColumnChange={setSpanIdColumn}
          columnHint={ColumnHint.TraceSpanId}
          label={selectors.fields.spanId.label}
          tooltip={selectors.fields.spanId.tooltip}
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
          label={selectors.fields.parentSpanId.label}
          tooltip={selectors.fields.parentSpanId.tooltip}
          wide
        />
        <ColumnSelect
          allColumns={allColumns}
          selectedColumn={serviceNameColumn}
          onColumnChange={setServiceNameColumn}
          columnHint={ColumnHint.TraceServiceName}
          label={selectors.fields.serviceName.label}
          tooltip={selectors.fields.serviceName.tooltip}
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
          label={selectors.fields.operationName.label}
          tooltip={selectors.fields.operationName.tooltip}
          wide
        />
        <ColumnSelect
          allColumns={allColumns}
          selectedColumn={startTimeColumn}
          onColumnChange={setStartTimeColumn}
          columnHint={ColumnHint.TraceStartTime}
          label={selectors.fields.startTime.label}
          tooltip={selectors.fields.startTime.tooltip}
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
          label={selectors.fields.durationTime.label}
          tooltip={selectors.fields.durationTime.tooltip}
          wide
        />
        {/* <ColumnSelect
          allColumns={allColumns}
          selectedColumn={durationUnit}
          onColumnChange={setDurationUnit}
          label={selectors.fields.durationUnit.label}
          tooltip={selectors.fields.durationUnit.tooltip}
          wide
          inline
        /> */}
      </div>
      <div className="gf-form">
        <ColumnSelect
          allColumns={allColumns}
          selectedColumn={tagsColumn}
          onColumnChange={setTagsColumn}
          columnHint={ColumnHint.TraceTags}
          label={selectors.fields.tags.label}
          tooltip={selectors.fields.tags.tooltip}
          wide
        />
        <ColumnSelect
          allColumns={allColumns}
          selectedColumn={serviceTagsColumn}
          onColumnChange={setServiceTagsColumn}
          columnHint={ColumnHint.TraceServiceTags}
          label={selectors.fields.serviceTags.label}
          tooltip={selectors.fields.serviceTags.tooltip}
          wide
          inline
        />
      </div>
      <FiltersEditor filters={filters} onFiltersChange={setFilters} allColumns={allColumns} />
    </div>
  );
}
