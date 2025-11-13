import React from 'react';
import { ConfigSection, ConfigSubSection } from 'components/experimental/ConfigSection';
import { Input, Field } from '@grafana/ui';
import { OtelVersionSelect } from 'components/queryBuilder/OtelVersionSelect';
import { ColumnHint, TimeUnit } from 'types/queryBuilder';
import otel from 'otel';
import { LabeledInput } from './LabeledInput';
import { DurationUnitSelect } from 'components/queryBuilder/DurationUnitSelect';
import { CHTracesConfig, defaultCHAdditionalSettingsConfig } from 'types/config';
import allLabels from 'labels';
import { columnLabelToPlaceholder } from 'data/utils';
import { Switch } from 'components/queryBuilder/Switch';

export interface TraceConfigProps {
  tracesConfig?: CHTracesConfig;
  onDefaultDatabaseChange: (v: string) => void;
  onDefaultTableChange: (v: string) => void;
  onOtelEnabledChange: (v: boolean) => void;
  onOtelVersionChange: (v: string) => void;
  onTraceIdColumnChange: (v: string) => void;
  onSpanIdColumnChange: (v: string) => void;
  onOperationNameColumnChange: (v: string) => void;
  onParentSpanIdColumnChange: (v: string) => void;
  onServiceNameColumnChange: (v: string) => void;
  onDurationColumnChange: (v: string) => void;
  onDurationUnitChange: (v: TimeUnit) => void;
  onStartTimeColumnChange: (v: string) => void;
  onTagsColumnChange: (v: string) => void;
  onServiceTagsColumnChange: (v: string) => void;
  onKindColumnChange: (v: string) => void;
  onStatusCodeColumnChange: (v: string) => void;
  onStatusMessageColumnChange: (v: string) => void;
  onStateColumnChange: (v: string) => void;
  onInstrumentationLibraryNameColumnChange: (v: string) => void;
  onInstrumentationLibraryVersionColumnChange: (v: string) => void;
  onFlattenNestedChange: (v: boolean) => void;
  onEventsColumnPrefixChange: (v: string) => void;
  onLinksColumnPrefixChange: (v: string) => void;
}

export const TracesConfig = (props: TraceConfigProps) => {
  const {
    onDefaultDatabaseChange,
    onDefaultTableChange,
    onOtelEnabledChange,
    onOtelVersionChange,
    onTraceIdColumnChange,
    onSpanIdColumnChange,
    onOperationNameColumnChange,
    onParentSpanIdColumnChange,
    onServiceNameColumnChange,
    onDurationColumnChange,
    onDurationUnitChange,
    onStartTimeColumnChange,
    onTagsColumnChange,
    onServiceTagsColumnChange,
    onKindColumnChange,
    onStatusCodeColumnChange,
    onStatusMessageColumnChange,
    onStateColumnChange,
    onInstrumentationLibraryNameColumnChange,
    onInstrumentationLibraryVersionColumnChange,
    onFlattenNestedChange,
    onEventsColumnPrefixChange,
    onLinksColumnPrefixChange,
  } = props;
  let {
    defaultDatabase,
    defaultTable,
    otelEnabled,
    otelVersion,
    traceIdColumn,
    spanIdColumn,
    operationNameColumn,
    parentSpanIdColumn,
    serviceNameColumn,
    durationColumn,
    durationUnit,
    startTimeColumn,
    tagsColumn,
    serviceTagsColumn,
    kindColumn,
    statusCodeColumn,
    statusMessageColumn,
    stateColumn,
    instrumentationLibraryNameColumn,
    instrumentationLibraryVersionColumn,
    flattenNested,
    traceEventsColumnPrefix,
    traceLinksColumnPrefix,
  } = (props.tracesConfig || {}) as CHTracesConfig;
  const labels = allLabels.components.Config.TracesConfig;

  const otelConfig = otel.getVersion(otelVersion);
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
    kindColumn = otelConfig.traceColumnMap.get(ColumnHint.TraceKind);
    statusCodeColumn = otelConfig.traceColumnMap.get(ColumnHint.TraceStatusCode);
    statusMessageColumn = otelConfig.traceColumnMap.get(ColumnHint.TraceStatusMessage);
    stateColumn = otelConfig.traceColumnMap.get(ColumnHint.TraceState);
    instrumentationLibraryNameColumn = otelConfig.traceColumnMap.get(ColumnHint.TraceInstrumentationLibraryName);
    instrumentationLibraryVersionColumn = otelConfig.traceColumnMap.get(ColumnHint.TraceInstrumentationLibraryVersion);
    durationUnit = otelConfig.traceDurationUnit.toString();
    flattenNested = otelConfig.flattenNested;
    traceEventsColumnPrefix = otelConfig.traceEventsColumnPrefix;
    traceLinksColumnPrefix = otelConfig.traceLinksColumnPrefix;
  }

  return (
    <ConfigSection title={labels.title} description={labels.description}>
      <div id="traces-config" />
      <Field label={labels.defaultDatabase.label} description={labels.defaultDatabase.description}>
        <Input
          name={labels.defaultDatabase.name}
          width={40}
          value={defaultDatabase || ''}
          onChange={(e) => onDefaultDatabaseChange(e.currentTarget.value)}
          label={labels.defaultDatabase.label}
          aria-label={labels.defaultDatabase.label}
          placeholder={labels.defaultDatabase.placeholder}
        />
      </Field>
      <Field label={labels.defaultTable.label} description={labels.defaultTable.description}>
        <Input
          name={labels.defaultTable.name}
          width={40}
          value={defaultTable || ''}
          onChange={(e) => onDefaultTableChange(e.currentTarget.value)}
          label={labels.defaultTable.label}
          aria-label={labels.defaultTable.label}
          placeholder={defaultCHAdditionalSettingsConfig.traces?.defaultTable!}
        />
      </Field>
      <ConfigSubSection title={labels.columns.title} description={labels.columns.description}>
        <OtelVersionSelect
          enabled={otelEnabled || false}
          selectedVersion={otelVersion || ''}
          onEnabledChange={onOtelEnabledChange}
          onVersionChange={onOtelVersionChange}
          wide
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.traceId.label}
          placeholder={columnLabelToPlaceholder(labels.columns.traceId.label)}
          tooltip={labels.columns.traceId.tooltip}
          value={traceIdColumn || ''}
          onChange={onTraceIdColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.spanId.label}
          placeholder={columnLabelToPlaceholder(labels.columns.spanId.label)}
          tooltip={labels.columns.spanId.tooltip}
          value={spanIdColumn || ''}
          onChange={onSpanIdColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.operationName.label}
          placeholder={columnLabelToPlaceholder(labels.columns.operationName.label)}
          tooltip={labels.columns.operationName.tooltip}
          value={operationNameColumn || ''}
          onChange={onOperationNameColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.parentSpanId.label}
          placeholder={columnLabelToPlaceholder(labels.columns.parentSpanId.label)}
          tooltip={labels.columns.parentSpanId.tooltip}
          value={parentSpanIdColumn || ''}
          onChange={onParentSpanIdColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.serviceName.label}
          placeholder={columnLabelToPlaceholder(labels.columns.serviceName.label)}
          tooltip={labels.columns.serviceName.tooltip}
          value={serviceNameColumn || ''}
          onChange={onServiceNameColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.durationTime.label}
          placeholder={columnLabelToPlaceholder(labels.columns.durationTime.label)}
          tooltip={labels.columns.durationTime.tooltip}
          value={durationColumn || ''}
          onChange={onDurationColumnChange}
        />
        <DurationUnitSelect
          disabled={otelEnabled}
          unit={(durationUnit as TimeUnit) || defaultCHAdditionalSettingsConfig.traces?.durationUnit}
          onChange={onDurationUnitChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.startTime.label}
          placeholder={columnLabelToPlaceholder(labels.columns.startTime.label)}
          tooltip={labels.columns.startTime.tooltip}
          value={startTimeColumn || ''}
          onChange={onStartTimeColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.tags.label}
          placeholder={columnLabelToPlaceholder(labels.columns.tags.label)}
          tooltip={labels.columns.tags.tooltip}
          value={tagsColumn || ''}
          onChange={onTagsColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.serviceTags.label}
          placeholder={columnLabelToPlaceholder(labels.columns.serviceTags.label)}
          tooltip={labels.columns.serviceTags.tooltip}
          value={serviceTagsColumn || ''}
          onChange={onServiceTagsColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.kind.label}
          placeholder={columnLabelToPlaceholder(labels.columns.kind.label)}
          tooltip={labels.columns.kind.tooltip}
          value={kindColumn || ''}
          onChange={onKindColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.statusCode.label}
          placeholder={columnLabelToPlaceholder(labels.columns.statusCode.label)}
          tooltip={labels.columns.statusCode.tooltip}
          value={statusCodeColumn || ''}
          onChange={onStatusCodeColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.statusMessage.label}
          placeholder={columnLabelToPlaceholder(labels.columns.statusMessage.label)}
          tooltip={labels.columns.statusMessage.tooltip}
          value={statusMessageColumn || ''}
          onChange={onStatusMessageColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.state.label}
          placeholder={columnLabelToPlaceholder(labels.columns.state.label)}
          tooltip={labels.columns.state.tooltip}
          value={stateColumn || ''}
          onChange={onStateColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.instrumentationLibraryName.label}
          placeholder={columnLabelToPlaceholder(labels.columns.instrumentationLibraryName.label)}
          tooltip={labels.columns.instrumentationLibraryName.tooltip}
          value={instrumentationLibraryNameColumn || ''}
          onChange={onInstrumentationLibraryNameColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.instrumentationLibraryVersion.label}
          placeholder={columnLabelToPlaceholder(labels.columns.instrumentationLibraryVersion.label)}
          tooltip={labels.columns.instrumentationLibraryVersion.tooltip}
          value={instrumentationLibraryVersionColumn || ''}
          onChange={onInstrumentationLibraryVersionColumnChange}
        />
        <Switch
          disabled={otelEnabled}
          label={labels.columns.flattenNested.label}
          tooltip={labels.columns.flattenNested.tooltip}
          value={flattenNested || false}
          onChange={onFlattenNestedChange}
          wide
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.eventsPrefix.label}
          placeholder={columnLabelToPlaceholder(labels.columns.eventsPrefix.label)}
          tooltip={labels.columns.eventsPrefix.tooltip}
          value={traceEventsColumnPrefix || ''}
          onChange={onEventsColumnPrefixChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.linksPrefix.label}
          placeholder={columnLabelToPlaceholder(labels.columns.linksPrefix.label)}
          tooltip={labels.columns.linksPrefix.tooltip}
          value={traceLinksColumnPrefix || ''}
          onChange={onLinksColumnPrefixChange}
        />
      </ConfigSubSection>
    </ConfigSection>
  );
};
