import React from 'react';
import { ConfigSection, ConfigSubSection } from 'components/experimental/ConfigSection';
import { Input, Field, InlineFormLabel, TagsInput } from '@grafana/ui';
import { OtelVersionSelect } from 'components/queryBuilder/OtelVersionSelect';
import { ColumnHint } from 'types/queryBuilder';
import otel from 'otel';
import { LabeledInput } from './LabeledInput';
import { CHLogsConfig, defaultCHAdditionalSettingsConfig } from 'types/config';
import allLabels from 'labels';
import { columnLabelToPlaceholder } from 'data/utils';
import { Switch } from 'components/queryBuilder/Switch';

interface LogsConfigProps {
  logsConfig?: CHLogsConfig;
  onDefaultDatabaseChange: (v: string) => void;
  onDefaultTableChange: (v: string) => void;
  onOtelEnabledChange: (v: boolean) => void;
  onOtelVersionChange: (v: string) => void;
  onTimeColumnChange: (v: string) => void;
  onLevelColumnChange: (v: string) => void;
  onMessageColumnChange: (v: string) => void;
  onSelectContextColumnsChange: (v: boolean) => void;
  onContextColumnsChange: (v: string[]) => void;
  onShowTableSchemaChange?: (v: boolean) => void;
}

export const LogsConfig = (props: LogsConfigProps) => {
  const {
    onDefaultDatabaseChange,
    onDefaultTableChange,
    onOtelEnabledChange,
    onOtelVersionChange,
    onTimeColumnChange,
    onLevelColumnChange,
    onMessageColumnChange,
    onSelectContextColumnsChange,
    onContextColumnsChange,
    onShowTableSchemaChange,
  } = props;
  let {
    defaultDatabase,
    defaultTable,
    otelEnabled,
    otelVersion,
    timeColumn,
    levelColumn,
    messageColumn,
    selectContextColumns,
    contextColumns,
    showTableSchema,
  } = props.logsConfig || {};
  const labels = allLabels.components.Config.LogsConfig;

  const otelConfig = otel.getVersion(otelVersion);
  if (otelEnabled && otelConfig) {
    timeColumn = otelConfig.logColumnMap.get(ColumnHint.Time);
    levelColumn = otelConfig.logColumnMap.get(ColumnHint.LogLevel);
    messageColumn = otelConfig.logColumnMap.get(ColumnHint.LogMessage);
  }

  const onContextColumnsChangeTrimmed = (columns: string[]) =>
    onContextColumnsChange(columns.map((c) => c.trim()).filter((c) => c));

  return (
    <ConfigSection title={labels.title} description={labels.description}>
      <div id="logs-config" />
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
          placeholder={defaultCHAdditionalSettingsConfig.logs?.defaultTable!}
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
      <br />
      <ConfigSubSection title={labels.contextColumns.title} description={labels.contextColumns.description}>
        <Switch
          label={labels.contextColumns.selectContextColumns.label}
          tooltip={labels.contextColumns.selectContextColumns.tooltip}
          value={selectContextColumns || false}
          onChange={onSelectContextColumnsChange}
          wide
        />
        <div className="gf-form">
          <InlineFormLabel width={12} className="query-keyword" tooltip={labels.contextColumns.columns.tooltip}>
            {labels.contextColumns.columns.label}
          </InlineFormLabel>
          <TagsInput
            placeholder={labels.contextColumns.columns.placeholder}
            tags={contextColumns || []}
            onChange={onContextColumnsChangeTrimmed}
            width={60}
          />
        </div>
      </ConfigSubSection>
      {onShowTableSchemaChange && (
        <div style={{ marginTop: 16 }}>
          <ConfigSubSection
            title="Log Details Schema"
            description="Display table schema information in log details panel"
          >
            <Switch
              label="Show table schema in log details"
              tooltip="When enabled, displays all available table columns in log details, even if they are not selected in the query. Useful for discovering available fields without using SELECT *."
              value={showTableSchema ?? true}
              onChange={onShowTableSchemaChange}
              wide
            />
          </ConfigSubSection>
        </div>
      )}
    </ConfigSection>
  );
};
