import React from 'react';
import { ConfigSection, ConfigSubSection } from '@grafana/experimental';
import { Input, Field } from '@grafana/ui';
import { OtelVersionSelect } from 'components/queryBuilder/OtelVersionSelect';
import { ColumnHint } from 'types/queryBuilder';
import { versions as otelVersions } from 'otel';
import { LabeledInput } from './LabeledInput';

interface LogsConfigProps {
  defaultDatabase?: string;
  defaultTable?: string;
  onDefaultDatabaseChange: (v: any) => void;
  onDefaultTableChange: (v: any) => void;

  otelEnabled?: boolean;
  otelVersion?: string;
  onOtelEnabledChange: (v: any) => void;
  onOtelVersionChange: (v: any) => void;

  timeColumn?: string;
  levelColumn?: string;
  messageColumn?: string;
  onTimeColumnChange: (v: any) => void;
  onLevelColumnChange: (v: any) => void;
  onMessageColumnChange: (v: any) => void;
}

export const LogsConfig = (props: LogsConfigProps) => {
  const { defaultDatabase, defaultTable, onDefaultDatabaseChange, onDefaultTableChange } = props;
  const { otelEnabled, otelVersion, onOtelEnabledChange, onOtelVersionChange } = props;
  const { onTimeColumnChange, onLevelColumnChange, onMessageColumnChange } = props;
  let { timeColumn, levelColumn, messageColumn } = props;

  const otelConfig = otelVersions.find(v => v.version === otelVersion);
  if (otelEnabled && otelConfig) {
    timeColumn = otelConfig.logColumnMap.get(ColumnHint.Time);
    levelColumn = otelConfig.logColumnMap.get(ColumnHint.LogLevel);
    messageColumn = otelConfig.logColumnMap.get(ColumnHint.LogMessage);
  }

  return (
    <ConfigSection
      title="Logs configuration"
      description="(Optional) default settings for log queries"
    >
      <Field
        label={"Default logs database"}
        description={"the default database used by the logs query builder"}
      >
        <Input
          name="defaultDatabase"
          width={40}
          value={defaultDatabase || ''}
          onChange={e => onDefaultDatabaseChange(e.currentTarget.value)}
          label="Default logs database"
          aria-label="Default logs database"
          placeholder="default"
        />
      </Field>
      <Field
        label={"Default logs table"}
        description={"The default table used by the logs query builder"}
      >
        <Input
          name="defaultTable"
          width={40}
          value={defaultTable || ''}
          onChange={e => onDefaultTableChange(e.currentTarget.value)}
          label="Default logs table"
          aria-label="Default logs table"
          placeholder="logs"
        />
      </Field>
     <ConfigSubSection
        title="Default columns"
        description="Default columns for log queries. Leave empty to disable."
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
          label="Time column"
          tooltip="Column for the log time"
          value={timeColumn || ''}
          onChange={onTimeColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label="Log Level column"
          tooltip="Column for log level / severity"
          value={levelColumn || ''}
          onChange={onLevelColumnChange}
        />
        <LabeledInput
          disabled={otelEnabled}
          label="Log Message column"
          tooltip="Column for log message"
          value={messageColumn || ''}
          onChange={onMessageColumnChange}
        />
      </ConfigSubSection>
    </ConfigSection>
  );
}
