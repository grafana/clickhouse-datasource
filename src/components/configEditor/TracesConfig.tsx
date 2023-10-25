
import React from 'react';
import { ConfigSection, ConfigSubSection } from '@grafana/experimental';
import { Input, Field } from '@grafana/ui';
import { OtelVersionSelect } from 'components/queryBuilder/OtelVersionSelect';
import { ColumnHint, TimeUnit } from 'types/queryBuilder';
import { versions as otelVersions } from 'otel';
import { LabeledInput } from './LabeledInput';
import { DurationUnitSelect } from 'components/queryBuilder/DurationUnitSelect';

interface TraceConfigProps {
  defaultDatabase?: string;
  defaultTable?: string;
  onDefaultDatabaseChange: (v: any) => void;
  onDefaultTableChange: (v: any) => void;

  otelEnabled?: boolean;
  otelVersion?: string;
  onOtelEnabledChange: (v: any) => void;
  onOtelVersionChange: (v: any) => void;

  traceIdColumn?: string;
  spanIdColumn?: string;
  operationNameColumn?: string;
  parentSpanIdColumn?: string;
  serviceNameColumn?: string;
  durationColumn?: string;
  durationUnit?: string;
  startTimeColumn?: string;
  tagsColumn?: string;
  serviceTagsColumn?: string;
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
  const { defaultDatabase, defaultTable, onDefaultDatabaseChange, onDefaultTableChange } = props;
  const { otelEnabled, otelVersion, onOtelEnabledChange, onOtelVersionChange } = props;
  const {
    onTraceIdColumnChange, onSpanIdColumnChange, onOperationNameColumnChange, onParentSpanIdColumnChange,
    onServiceNameColumnChange, onDurationColumnChange, onDurationUnitChange, onStartTimeColumnChange,
    onTagsColumnChange, onServiceTagsColumnChange,
  } = props;
  let {
    traceIdColumn, spanIdColumn, operationNameColumn, parentSpanIdColumn, serviceNameColumn,
    durationColumn, durationUnit, startTimeColumn, tagsColumn, serviceTagsColumn
  } = props;

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
      title="Traces configuration"
      description="(Optional) Default settings for trace queries"
    >
      <Field
        label={"Default trace database"}
        description={"the default database used by the trace query builder"}
      >
        <Input
          name="defaultDatabase"
          width={40}
          value={defaultDatabase || ''}
          onChange={e => onDefaultDatabaseChange(e.currentTarget.value)}
          label="Default trace database"
          aria-label="Default trace database"
          placeholder="default"
        />
      </Field>
      <Field
        label={"Default trace table"}
        description={"The default table used by the trace query builder"}
      >
        <Input
          name="defaultTable"
          width={40}
          value={defaultTable || ''}
          onChange={e => onDefaultTableChange(e.currentTarget.value)}
          label="Default trace table"
          aria-label="Default trace table"
          placeholder="traces"
        />
      </Field>
      <ConfigSubSection
        title="Default columns"
        description="Default columns for trace queries. Leave empty to disable."
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
          label="Trace ID column"
          tooltip="Column for the trace ID"
          value={traceIdColumn || ''}
          onChange={onTraceIdColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label="Span ID column"
          tooltip="Column for the span ID"
          value={spanIdColumn || ''}
          onChange={onSpanIdColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label="Operation name column"
          tooltip="Column for the operation name"
          value={operationNameColumn || ''}
          onChange={onOperationNameColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label="Parent Span ID column"
          tooltip="Column for the parent span ID"
          value={parentSpanIdColumn || ''}
          onChange={onParentSpanIdColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label="Service name column"
          tooltip="Column for the service name"
          value={serviceNameColumn || ''}
          onChange={onServiceNameColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label="Duration column"
          tooltip="Column for the trace duration"
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
          label="Start time column"
          tooltip="Column for the start time"
          value={startTimeColumn || ''}
          onChange={onStartTimeColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label="Tags column"
          tooltip="Column for the trace tags"
          value={tagsColumn || ''}
          onChange={onTagsColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label="Service Tags column"
          tooltip="Column for the trace service tags"
          value={serviceTagsColumn || ''}
          onChange={onServiceTagsColumnChange}
        />
      </ConfigSubSection>
    </ConfigSection>
  );
}
