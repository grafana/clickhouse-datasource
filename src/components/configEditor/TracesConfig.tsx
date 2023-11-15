
import React from 'react';
import { ConfigSection, ConfigSubSection } from '@grafana/experimental';
import { Input, Field } from '@grafana/ui';
import { OtelVersionSelect } from 'components/queryBuilder/OtelVersionSelect';
import { ColumnHint, TimeUnit } from 'types/queryBuilder';
import { versions as otelVersions } from 'otel';
import { LabeledInput } from './LabeledInput';
import { DurationUnitSelect } from 'components/queryBuilder/DurationUnitSelect';
import { CHTracesConfig } from 'types/config';
import allLabels from 'labels';

interface TraceConfigProps {
  tracesConfig?: CHTracesConfig;
  onDefaultDatabaseChange: (v: any) => void;
  onDefaultTableChange: (v: any) => void;
  onOtelEnabledChange: (v: any) => void;
  onOtelVersionChange: (v: any) => void;
  onTraceIdColumnChange: (v: any) => void;
  onSpanIdColumnChange: (v: any) => void;
  onOperationNameColumnChange: (v: any) => void;
  onParentSpanIdColumnChange: (v: any) => void;
  onServiceNameColumnChange: (v: any) => void;
  onDurationColumnChange: (v: any) => void;
  onDurationUnitChange: (v: any) => void;
  onStartTimeColumnChange: (v: any) => void;
  onTagsColumnChange: (v: any) => void;
  onServiceTagsColumnChange: (v: any) => void;
}

export const TracesConfig = (props: TraceConfigProps) => {
  const {
    onDefaultDatabaseChange, onDefaultTableChange,
    onOtelEnabledChange, onOtelVersionChange,
    onTraceIdColumnChange, onSpanIdColumnChange, onOperationNameColumnChange, onParentSpanIdColumnChange,
    onServiceNameColumnChange, onDurationColumnChange, onDurationUnitChange, onStartTimeColumnChange,
    onTagsColumnChange, onServiceTagsColumnChange,
  } = props;
  let {
    defaultDatabase, defaultTable,
    otelEnabled, otelVersion,
    traceIdColumn, spanIdColumn, operationNameColumn, parentSpanIdColumn, serviceNameColumn,
    durationColumn, durationUnit, startTimeColumn, tagsColumn, serviceTagsColumn
  } = (props.tracesConfig || {}) as CHTracesConfig;
  const labels = allLabels.components.Config.TracesConfig;

  const otelConfig = otelVersions.find(v => v.version === otelVersion);
  if (otelEnabled && otelConfig) {
    startTimeColumn = otelConfig.traceColumnMap.get(ColumnHint.Time);
    traceIdColumn = otelConfig.traceColumnMap.get(ColumnHint.TraceId);
    spanIdColumn = otelConfig.traceColumnMap.get(ColumnHint.TraceSpanId);
    parentSpanIdColumn = otelConfig.traceColumnMap.get(ColumnHint.TraceParentSpanId);
    serviceNameColumn = otelConfig.traceColumnMap.get(ColumnHint.TraceServiceName);
    operationNameColumn = otelConfig.traceColumnMap.get(ColumnHint.TraceOperationName);
    durationColumn = otelConfig.traceColumnMap.get(ColumnHint.TraceDurationTime);
    tagsColumn = otelConfig.traceColumnMap.get(ColumnHint.TraceTags);
    serviceTagsColumn = otelConfig.traceColumnMap.get(ColumnHint.TraceServiceTags);
    durationUnit = otelConfig.traceDurationUnit.toString();
  }

  return (
    <ConfigSection
      title={labels.title}
      description={labels.description}
    >
      <Field
        label={labels.defaultDatabase.label}
        description={labels.defaultDatabase.description}
      >
        <Input
          name={labels.defaultDatabase.name}
          width={40}
          value={defaultDatabase || ''}
          onChange={e => onDefaultDatabaseChange(e.currentTarget.value)}
          label={labels.defaultDatabase.label}
          aria-label={labels.defaultDatabase.label}
          placeholder={labels.defaultDatabase.placeholder}
        />
      </Field>
      <Field
        label={labels.defaultTable.label}
        description={labels.defaultTable.description}
      >
        <Input
          name={labels.defaultTable.name}
          width={40}
          value={defaultTable || ''}
          onChange={e => onDefaultTableChange(e.currentTarget.value)}
          label={labels.defaultTable.label}
          aria-label={labels.defaultTable.label}
          placeholder={labels.defaultTable.placeholder}
        />
      </Field>
      <ConfigSubSection
        title={labels.columns.title}
        description={labels.columns.description}
      >
        <OtelVersionSelect
          enabled={otelEnabled || false}
          selectedVersion={otelVersion || ''}
          onEnabledChange={onOtelEnabledChange}
          onVersionChange={onOtelVersionChange}
          defaultToLatest
          wide
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.traceId.label}
          tooltip={labels.columns.traceId.tooltip}
          value={traceIdColumn || ''}
          onChange={onTraceIdColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.spanId.label}
          tooltip={labels.columns.spanId.tooltip}
          value={spanIdColumn || ''}
          onChange={onSpanIdColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.operationName.label}
          tooltip={labels.columns.operationName.tooltip}
          value={operationNameColumn || ''}
          onChange={onOperationNameColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.parentSpanId.label}
          tooltip={labels.columns.parentSpanId.tooltip}
          value={parentSpanIdColumn || ''}
          onChange={onParentSpanIdColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.serviceName.label}
          tooltip={labels.columns.serviceName.tooltip}
          value={serviceNameColumn || ''}
          onChange={onServiceNameColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.durationTime.label}
          tooltip={labels.columns.durationTime.tooltip}
          value={durationColumn || ''}
          onChange={onDurationColumnChange}
        />
        <DurationUnitSelect
          disabled={otelEnabled}
          unit={durationUnit as TimeUnit || TimeUnit.Nanoseconds}
          onChange={onDurationUnitChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.startTime.label}
          tooltip={labels.columns.startTime.tooltip}
          value={startTimeColumn || ''}
          onChange={onStartTimeColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.tags.label}
          tooltip={labels.columns.tags.tooltip}
          value={tagsColumn || ''}
          onChange={onTagsColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.serviceTags.label}
          tooltip={labels.columns.serviceTags.tooltip}
          value={serviceTagsColumn || ''}
          onChange={onServiceTagsColumnChange}
        />
      </ConfigSubSection>
    </ConfigSection>
  );
}
