import React from 'react';
import { ConfigSection, ConfigSubSection } from '@grafana/experimental';
import { Input, Field } from '@grafana/ui';
import { OtelVersionSelect } from 'components/queryBuilder/OtelVersionSelect';
import { ColumnHint } from 'types/queryBuilder';
import otel from 'otel';
import { LabeledInput } from './LabeledInput';
import { CHLogsConfig } from 'types/config';
import allLabels from 'labels';
import { columnLabelToPlaceholder } from 'data/utils';

interface LogsConfigProps {
  logsConfig?: CHLogsConfig;
  onDefaultDatabaseChange: (v: string) => void;
  onDefaultTableChange: (v: string) => void;
  onOtelEnabledChange: (v: boolean) => void;
  onOtelVersionChange: (v: string) => void;
  onTimeColumnChange: (v: string) => void;
  onLevelColumnChange: (v: string) => void;
  onMessageColumnChange: (v: string) => void;
}

export const LogsConfig = (props: LogsConfigProps) => {
  const {
    onDefaultDatabaseChange, onDefaultTableChange,
    onOtelEnabledChange, onOtelVersionChange,
    onTimeColumnChange, onLevelColumnChange, onMessageColumnChange
  } = props;
  let {
    defaultDatabase, defaultTable,
    otelEnabled, otelVersion,
    timeColumn, levelColumn, messageColumn
  } = (props.logsConfig || {});
  const labels = allLabels.components.Config.LogsConfig;

  const otelConfig = otel.getVersion(otelVersion);
  if (otelEnabled && otelConfig) {
    timeColumn = otelConfig.logColumnMap.get(ColumnHint.Time);
    levelColumn = otelConfig.logColumnMap.get(ColumnHint.LogLevel);
    messageColumn = otelConfig.logColumnMap.get(ColumnHint.LogMessage);
  }

  return (
    <ConfigSection
      title={labels.title}
      description={labels.description}
    >
      <div id="logs-config" />
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
          wide
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.time.label}
          placeholder={columnLabelToPlaceholder(labels.columns.time.label)}
          tooltip={labels.columns.time.tooltip}
          value={timeColumn || ''}
          onChange={onTimeColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.level.label}
          placeholder={columnLabelToPlaceholder(labels.columns.level.label)}
          tooltip={labels.columns.level.tooltip}
          value={levelColumn || ''}
          onChange={onLevelColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label={labels.columns.message.label}
          placeholder={columnLabelToPlaceholder(labels.columns.message.label)}
          tooltip={labels.columns.message.tooltip}
          value={messageColumn || ''}
          onChange={onMessageColumnChange}
        />
      </ConfigSubSection>
    </ConfigSection>
  );
}
