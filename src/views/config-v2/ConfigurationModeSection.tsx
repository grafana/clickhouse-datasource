import React from 'react';
import {
  DataSourcePluginOptionsEditorProps,
  onUpdateDatasourceJsonDataOption,
  onUpdateDatasourceJsonDataOptionChecked,
} from '@grafana/data';
import { Box, CollapsableSection, Divider, Field, RadioButtonGroup, Text } from '@grafana/ui';
import { LogsConfig } from 'components/configEditor/LogsConfig';
import { QuerySettingsConfig } from 'components/configEditor/QuerySettingsConfig';
import { TracesConfig } from 'components/configEditor/TracesConfig';
import { CHConfig, CHLogsConfig, CHSecureConfig, CHTracesConfig, ConfigMode, SignalType } from 'types/config';
import { TimeUnit } from 'types/queryBuilder';
import { CONFIG_SECTION_HEADERS, CONTAINER_MIN_WIDTH } from './constants';
import {
  trackClickhouseConfigV2LogsConfig,
  trackClickhouseConfigV2QuerySettings,
  trackClickhouseConfigV2TracesConfig,
} from './tracking';

export interface Props extends DataSourcePluginOptionsEditorProps<CHConfig, CHSecureConfig> {}

export const ConfigurationModeSection = (props: Props) => {
  const { options, onOptionsChange } = props;
  const { jsonData } = options;
  const configMode = jsonData.configMode || (jsonData.signalType ? 'single-table' : 'classic');
  const isSingleTableMode = configMode === 'single-table';
  const selectedSignalType = isSingleTableMode ? jsonData.signalType || 'logs' : undefined;

  const onLogsConfigChange = (key: keyof CHLogsConfig, value: string | boolean | string[]) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...options.jsonData,
        logs: {
          ...(options.jsonData.logs || {}),
          [key]: value,
        },
      },
    });
  };

  const onUpdateLogsConfig = (key: keyof CHLogsConfig, value: string | boolean | string[]) => {
    trackClickhouseConfigV2LogsConfig({ [key]: value });
    onLogsConfigChange(key, value);
  };

  const onTracesConfigChange = (key: keyof CHTracesConfig, value: string | boolean | TimeUnit) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...options.jsonData,
        traces: {
          ...options.jsonData.traces,
          durationUnit: options.jsonData.traces?.durationUnit || TimeUnit.Nanoseconds,
          [key]: value,
        },
      },
    });
  };

  const onUpdateTracesConfig = (key: keyof CHTracesConfig, value: string | boolean | TimeUnit) => {
    trackClickhouseConfigV2TracesConfig({ [key]: value });
    onTracesConfigChange(key, value);
  };

  return (
    <Box
      borderStyle="solid"
      borderColor="weak"
      padding={2}
      marginBottom={4}
      id={`${CONFIG_SECTION_HEADERS[3].id}`}
      minWidth={CONTAINER_MIN_WIDTH}
    >
      <CollapsableSection
        label={<Text variant="h3">{CONFIG_SECTION_HEADERS[3].label}</Text>}
        isOpen={!!CONFIG_SECTION_HEADERS[3].isOpen}
      >
        <Text variant="body" color="secondary">
          Choose how this data source is used. Single source provides a focused query editor for one table. All
          databases gives full access to explore any database and table.
        </Text>
        <Field label="Mode">
          <RadioButtonGroup<ConfigMode>
            options={[
              { label: 'All databases', value: 'classic' },
              { label: 'Single source', value: 'single-table' },
            ]}
            value={configMode}
            onChange={(v) => {
              const newJsonData = { ...options.jsonData, configMode: v };
              if (v === 'classic') {
                newJsonData.signalType = undefined;
              } else if (!newJsonData.signalType) {
                newJsonData.signalType = 'logs';
              }
              onOptionsChange({ ...options, jsonData: newJsonData });
            }}
          />
        </Field>
        {isSingleTableMode && (
          <Field label="Signal type" description="What kind of data does this table contain?">
            <RadioButtonGroup<SignalType>
              options={[
                { label: 'Logs', value: 'logs', description: 'Log search with severity, message, and attributes' },
                { label: 'Traces', value: 'traces', description: 'Distributed tracing with spans and service maps' },
              ]}
              value={selectedSignalType}
              onChange={(v) => {
                onOptionsChange({
                  ...options,
                  jsonData: {
                    ...options.jsonData,
                    configMode: 'single-table',
                    signalType: v,
                  },
                });
              }}
            />
          </Field>
        )}

        {selectedSignalType === 'logs' && (
          <>
            <Divider />
            <LogsConfig
              variant="single-table"
              logsConfig={jsonData.logs}
              onDefaultDatabaseChange={(db) => onUpdateLogsConfig('defaultDatabase', db)}
              onDefaultTableChange={(table) => onUpdateLogsConfig('defaultTable', table)}
              onOtelEnabledChange={(v) => onUpdateLogsConfig('otelEnabled', v)}
              onOtelVersionChange={(v) => onUpdateLogsConfig('otelVersion', v)}
              onFilterTimeColumnChange={(c) => onUpdateLogsConfig('filterTimeColumn', c)}
              onTimeColumnChange={(c) => onUpdateLogsConfig('timeColumn', c)}
              onLevelColumnChange={(c) => onUpdateLogsConfig('levelColumn', c)}
              onMessageColumnChange={(c) => onUpdateLogsConfig('messageColumn', c)}
              onSelectContextColumnsChange={(c) => onUpdateLogsConfig('selectContextColumns', c)}
              onContextColumnsChange={(c) => onUpdateLogsConfig('contextColumns', c)}
              onShowLogLinksChange={(v) => onUpdateLogsConfig('showLogLinks', v)}
            />
          </>
        )}

        {selectedSignalType === 'traces' && (
          <>
            <Divider />
            <TracesConfig
              variant="single-table"
              tracesConfig={jsonData.traces}
              onDefaultDatabaseChange={(db) => onUpdateTracesConfig('defaultDatabase', db)}
              onDefaultTableChange={(table) => onUpdateTracesConfig('defaultTable', table)}
              onOtelEnabledChange={(v) => onUpdateTracesConfig('otelEnabled', v)}
              onOtelVersionChange={(v) => onUpdateTracesConfig('otelVersion', v)}
              onTraceIdColumnChange={(c) => onUpdateTracesConfig('traceIdColumn', c)}
              onSpanIdColumnChange={(c) => onUpdateTracesConfig('spanIdColumn', c)}
              onOperationNameColumnChange={(c) => onUpdateTracesConfig('operationNameColumn', c)}
              onParentSpanIdColumnChange={(c) => onUpdateTracesConfig('parentSpanIdColumn', c)}
              onServiceNameColumnChange={(c) => onUpdateTracesConfig('serviceNameColumn', c)}
              onDurationColumnChange={(c) => onUpdateTracesConfig('durationColumn', c)}
              onDurationUnitChange={(c) => onUpdateTracesConfig('durationUnit', c)}
              onStartTimeColumnChange={(c) => onUpdateTracesConfig('startTimeColumn', c)}
              onTagsColumnChange={(c) => onUpdateTracesConfig('tagsColumn', c)}
              onServiceTagsColumnChange={(c) => onUpdateTracesConfig('serviceTagsColumn', c)}
              onKindColumnChange={(c) => onUpdateTracesConfig('kindColumn', c)}
              onStatusCodeColumnChange={(c) => onUpdateTracesConfig('statusCodeColumn', c)}
              onStatusMessageColumnChange={(c) => onUpdateTracesConfig('statusMessageColumn', c)}
              onStateColumnChange={(c) => onUpdateTracesConfig('stateColumn', c)}
              onInstrumentationLibraryNameColumnChange={(c) =>
                onUpdateTracesConfig('instrumentationLibraryNameColumn', c)
              }
              onInstrumentationLibraryVersionColumnChange={(c) =>
                onUpdateTracesConfig('instrumentationLibraryVersionColumn', c)
              }
              onFlattenNestedChange={(c) => onUpdateTracesConfig('flattenNested', c)}
              onEventsColumnPrefixChange={(c) => onUpdateTracesConfig('traceEventsColumnPrefix', c)}
              onLinksColumnPrefixChange={(c) => onUpdateTracesConfig('traceLinksColumnPrefix', c)}
              onShowTraceLinksChange={(v) => onUpdateTracesConfig('showTraceLinks', v)}
              onTraceTimestampTableSuffixChange={(v) => onUpdateTracesConfig('traceTimestampTableSuffix', v)}
            />
          </>
        )}

        {isSingleTableMode && (
          <>
            <Divider />
            <QuerySettingsConfig
              dialTimeout={jsonData.dialTimeout}
              queryTimeout={jsonData.queryTimeout}
              connMaxLifetime={jsonData.connMaxLifetime}
              maxIdleConns={jsonData.maxIdleConns}
              maxOpenConns={jsonData.maxOpenConns}
              validateSql={jsonData.validateSql}
              onDialTimeoutChange={(e) => {
                trackClickhouseConfigV2QuerySettings({ dialTimeout: Number(e.currentTarget.value) });
                onUpdateDatasourceJsonDataOption(props, 'dialTimeout')(e);
              }}
              onQueryTimeoutChange={(e) => {
                trackClickhouseConfigV2QuerySettings({ queryTimeout: Number(e.currentTarget.value) });
                onUpdateDatasourceJsonDataOption(props, 'queryTimeout')(e);
              }}
              onConnMaxLifetimeChange={(e) => {
                trackClickhouseConfigV2QuerySettings({ connMaxLifetime: Number(e.currentTarget.value) });
                onUpdateDatasourceJsonDataOption(props, 'connMaxLifetime')(e);
              }}
              onConnMaxIdleConnsChange={(e) => {
                trackClickhouseConfigV2QuerySettings({ maxIdleConns: Number(e.currentTarget.value) });
                onUpdateDatasourceJsonDataOption(props, 'maxIdleConns')(e);
              }}
              onConnMaxOpenConnsChange={(e) => {
                trackClickhouseConfigV2QuerySettings({ maxOpenConns: Number(e.currentTarget.value) });
                onUpdateDatasourceJsonDataOption(props, 'maxOpenConns')(e);
              }}
              onValidateSqlChange={(e) => {
                trackClickhouseConfigV2QuerySettings({ validateSql: e.currentTarget.checked });
                onUpdateDatasourceJsonDataOptionChecked(props, 'validateSql')(e);
              }}
            />
          </>
        )}
      </CollapsableSection>
    </Box>
  );
};
