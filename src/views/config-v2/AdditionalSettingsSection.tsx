import { ConfigSubSection } from 'components/experimental/ConfigSection';
import allLabels from '../../labels';
import React, { ChangeEvent, useState } from 'react';
import { DataSourcePluginOptionsEditorProps, onUpdateDatasourceJsonDataOption } from '@grafana/data';
import { AliasTableEntry, CHConfig, CHCustomSetting, CHLogsConfig, CHSecureConfig, CHTracesConfig } from 'types/config';
import { AliasTableConfig } from 'components/configEditor/AliasTableConfig';
import { DefaultDatabaseTableConfig } from 'components/configEditor/DefaultDatabaseTableConfig';
import { LogsConfig } from 'components/configEditor/LogsConfig';
import { QuerySettingsConfig } from 'components/configEditor/QuerySettingsConfig';
import { TracesConfig } from 'components/configEditor/TracesConfig';
import { config } from '@grafana/runtime';
import { TimeUnit } from 'types/queryBuilder';
import { useConfigDefaults } from 'views/CHConfigEditorHooks';
import { gte as versionGte } from 'semver';
import {
  Field,
  Divider,
  Stack,
  Input,
  Button,
  Switch,
  Box,
  CollapsableSection,
  Text,
  Badge,
  useStyles2,
} from '@grafana/ui';
import { CONFIG_SECTION_HEADERS, CONTAINER_MIN_WIDTH } from './constants';
import {
  trackClickhouseConfigV2CustomSettingClicked,
  trackClickhouseConfigV2DefaultDbInput,
  trackClickhouseConfigV2DefaultTableInput,
  trackClickhouseConfigV2EnableRowLimitToggle,
  trackClickhouseConfigV2LogsConfig,
  trackClickhouseConfigV2QuerySettings,
  trackClickhouseConfigV2TracesConfig,
} from './tracking';
import { css } from '@emotion/css';

export interface Props extends DataSourcePluginOptionsEditorProps<CHConfig, CHSecureConfig> {}

export const AdditionalSettingsSection = (props: Props) => {
  const { options, onOptionsChange } = props;
  const { jsonData } = options;
  const labels = allLabels.components.Config.ConfigEditor;
  const styles = useStyles2(getStyles);

  useConfigDefaults(options, onOptionsChange);

  const [customSettings, setCustomSettings] = useState(jsonData.customSettings || []);

  const onSwitchToggle = (
    key: keyof Pick<
      CHConfig,
      'secure' | 'validateSql' | 'enableSecureSocksProxy' | 'forwardGrafanaHeaders' | 'enableRowLimit'
    >,
    value: boolean
  ) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...options.jsonData,
        [key]: value,
      },
    });
  };

  const onLogsConfigChange = (key: keyof CHLogsConfig, value: string | boolean | string[]) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...options.jsonData,
        logs: {
          ...options.jsonData.logs,
          [key]: value,
        },
      },
    });
  };

  const onTracesConfigChange = (key: keyof CHTracesConfig, value: string | boolean) => {
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

  const onAliasTableConfigChange = (aliasTables: AliasTableEntry[]) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...options.jsonData,
        aliasTables,
      },
    });
  };

  const onCustomSettingsChange = (customSettings: CHCustomSetting[]) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...options.jsonData,
        customSettings: customSettings.filter((s) => !!s.setting && !!s.value),
      },
    });
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
        label={
          <>
            <Text variant="h3">4. {CONFIG_SECTION_HEADERS[3].label}</Text>
            <Badge text="optional" color="blue" className={styles.badge} />
          </>
        }
        isOpen={!!CONFIG_SECTION_HEADERS[3].isOpen}
      >
        <DefaultDatabaseTableConfig
          defaultDatabase={jsonData.defaultDatabase}
          defaultTable={jsonData.defaultTable}
          onDefaultDatabaseChange={(e) => {
            trackClickhouseConfigV2DefaultDbInput();
            onUpdateDatasourceJsonDataOption(props, 'defaultDatabase')(e);
          }}
          onDefaultTableChange={(e) => {
            trackClickhouseConfigV2DefaultTableInput();
            onUpdateDatasourceJsonDataOption(props, 'defaultTable')(e);
          }}
        />
        <Divider />
        <QuerySettingsConfig
          connMaxLifetime={jsonData.connMaxLifetime}
          dialTimeout={jsonData.dialTimeout}
          maxIdleConns={jsonData.maxIdleConns}
          maxOpenConns={jsonData.maxOpenConns}
          queryTimeout={jsonData.queryTimeout}
          validateSql={jsonData.validateSql}
          onDialTimeoutChange={(e) => {
            console.log('e', e);
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
            onUpdateDatasourceJsonDataOption(props, 'validateSql')(e);
          }}
        />
        <Divider />
        <LogsConfig
          logsConfig={jsonData.logs}
          onDefaultDatabaseChange={(db) => {
            trackClickhouseConfigV2LogsConfig({ defaultDatabase: db });
            onLogsConfigChange('defaultDatabase', db);
          }}
          onDefaultTableChange={(table) => {
            trackClickhouseConfigV2LogsConfig({ defaultTable: table });
            onLogsConfigChange('defaultTable', table);
          }}
          onOtelEnabledChange={(v) => {
            trackClickhouseConfigV2LogsConfig({ otelEnabled: v });
            onLogsConfigChange('otelEnabled', v);
          }}
          onOtelVersionChange={(v) => {
            trackClickhouseConfigV2LogsConfig({ version: v });
            onLogsConfigChange('otelVersion', v);
          }}
          onTimeColumnChange={(c) => {
            trackClickhouseConfigV2LogsConfig({ timeColumn: c });
            onLogsConfigChange('timeColumn', c);
          }}
          onLevelColumnChange={(c) => {
            trackClickhouseConfigV2LogsConfig({ levelColumn: c });
            onLogsConfigChange('levelColumn', c);
          }}
          onMessageColumnChange={(c) => {
            trackClickhouseConfigV2LogsConfig({ messageColumn: c });
            onLogsConfigChange('messageColumn', c);
          }}
          onSelectContextColumnsChange={(c) => {
            trackClickhouseConfigV2LogsConfig({ selectContextColumns: c });
            onLogsConfigChange('selectContextColumns', c);
          }}
          onContextColumnsChange={(c) => {
            trackClickhouseConfigV2LogsConfig({ contextColumns: c });
            onLogsConfigChange('contextColumns', c);
          }}
        />

        <Divider />
        <TracesConfig
          tracesConfig={jsonData.traces}
          onDefaultDatabaseChange={(db) => {
            trackClickhouseConfigV2TracesConfig({ defaultDatabase: db });
            onTracesConfigChange('defaultDatabase', db);
          }}
          onDefaultTableChange={(table) => {
            trackClickhouseConfigV2TracesConfig({ defaultTable: table });
            onTracesConfigChange('defaultTable', table);
          }}
          onOtelEnabledChange={(v) => {
            trackClickhouseConfigV2TracesConfig({ otelEnabled: v });
            onTracesConfigChange('otelEnabled', v);
          }}
          onOtelVersionChange={(v) => {
            trackClickhouseConfigV2TracesConfig({ version: v });
            onTracesConfigChange('otelVersion', v);
          }}
          onTraceIdColumnChange={(c) => {
            trackClickhouseConfigV2TracesConfig({ traceIdColumn: c });
            onTracesConfigChange('traceIdColumn', c);
          }}
          onSpanIdColumnChange={(c) => {
            trackClickhouseConfigV2TracesConfig({ spanIdColumn: c });
            onTracesConfigChange('spanIdColumn', c);
          }}
          onOperationNameColumnChange={(c) => {
            trackClickhouseConfigV2TracesConfig({ operationNameColumn: c });
            onTracesConfigChange('operationNameColumn', c);
          }}
          onParentSpanIdColumnChange={(c) => {
            trackClickhouseConfigV2TracesConfig({ parentSpanIdColumn: c });
            onTracesConfigChange('parentSpanIdColumn', c);
          }}
          onServiceNameColumnChange={(c) => {
            trackClickhouseConfigV2TracesConfig({ serviceNameColumn: c });
            onTracesConfigChange('serviceNameColumn', c);
          }}
          onDurationColumnChange={(c) => {
            trackClickhouseConfigV2TracesConfig({ durationColumn: c });
            onTracesConfigChange('durationColumn', c);
          }}
          onDurationUnitChange={(c) => {
            trackClickhouseConfigV2TracesConfig({ durationUnit: c });
            onTracesConfigChange('durationUnit', c);
          }}
          onStartTimeColumnChange={(c) => {
            trackClickhouseConfigV2TracesConfig({ startTimeColumn: c });
            onTracesConfigChange('startTimeColumn', c);
          }}
          onTagsColumnChange={(c) => {
            trackClickhouseConfigV2TracesConfig({ tagsColumn: c });
            onTracesConfigChange('tagsColumn', c);
          }}
          onServiceTagsColumnChange={(c) => {
            trackClickhouseConfigV2TracesConfig({ serviceTagsColumn: c });
            onTracesConfigChange('serviceTagsColumn', c);
          }}
          onKindColumnChange={(c) => {
            trackClickhouseConfigV2TracesConfig({ kindColumn: c });
            onTracesConfigChange('kindColumn', c);
          }}
          onStatusCodeColumnChange={(c) => {
            trackClickhouseConfigV2TracesConfig({ statusCodeColumn: c });
            onTracesConfigChange('statusCodeColumn', c);
          }}
          onStatusMessageColumnChange={(c) => {
            trackClickhouseConfigV2TracesConfig({ statusMessageColumn: c });
            onTracesConfigChange('statusMessageColumn', c);
          }}
          onStateColumnChange={(c) => {
            trackClickhouseConfigV2TracesConfig({ stateColumn: c });
            onTracesConfigChange('stateColumn', c);
          }}
          onInstrumentationLibraryNameColumnChange={(c) => {
            trackClickhouseConfigV2TracesConfig({ instrumentationLibraryNameColumn: c });
            onTracesConfigChange('instrumentationLibraryNameColumn', c);
          }}
          onInstrumentationLibraryVersionColumnChange={(c) => {
            trackClickhouseConfigV2TracesConfig({ instrumentationLibraryVersionColumn: c });
            onTracesConfigChange('instrumentationLibraryVersionColumn', c);
          }}
          onFlattenNestedChange={(c) => {
            trackClickhouseConfigV2TracesConfig({ flattenNested: c });
            onTracesConfigChange('flattenNested', c);
          }}
          onEventsColumnPrefixChange={(c) => {
            trackClickhouseConfigV2TracesConfig({ traceEventsColumnPrefix: c });
            onTracesConfigChange('traceEventsColumnPrefix', c);
          }}
          onLinksColumnPrefixChange={(c) => {
            trackClickhouseConfigV2TracesConfig({ traceLinksColumnPrefix: c });
            onTracesConfigChange('traceLinksColumnPrefix', c);
          }}
        />
        <Divider />
        <AliasTableConfig aliasTables={jsonData.aliasTables} onAliasTablesChange={onAliasTableConfigChange} />
        <Divider />
        <Field label={labels.enableRowLimit.label} description={labels.enableRowLimit.tooltip}>
          <Switch
            className="gf-form"
            value={jsonData.enableRowLimit || false}
            data-testid={labels.enableRowLimit.testid}
            onChange={(e) => {
              trackClickhouseConfigV2EnableRowLimitToggle({ rowLimitEnabled: e.currentTarget.checked });
              onSwitchToggle('enableRowLimit', e.currentTarget.checked);
            }}
          />
        </Field>
        {config.secureSocksDSProxyEnabled && versionGte(config.buildInfo.version, '10.0.0') && (
          <Field label={labels.secureSocksProxy.label} description={labels.secureSocksProxy.tooltip}>
            <Switch
              className="gf-form"
              value={jsonData.enableSecureSocksProxy || false}
              onChange={(e) => onSwitchToggle('enableSecureSocksProxy', e.currentTarget.checked)}
            />
          </Field>
        )}
        <ConfigSubSection title="Custom Settings">
          {customSettings.map(({ setting, value }, i) => {
            return (
              <Stack key={i} direction="row">
                <Field label={`Setting`} aria-label={`Setting`}>
                  <Input
                    value={setting}
                    placeholder={'Setting'}
                    onChange={(changeEvent: ChangeEvent<HTMLInputElement>) => {
                      let newSettings = customSettings.concat();
                      newSettings[i] = { setting: changeEvent.target.value, value };
                      setCustomSettings(newSettings);
                    }}
                    onBlur={() => onCustomSettingsChange(customSettings)}
                  ></Input>
                </Field>
                <Field label={'Value'} aria-label={`Value`}>
                  <Input
                    value={value}
                    placeholder={'Value'}
                    onChange={(changeEvent: ChangeEvent<HTMLInputElement>) => {
                      let newSettings = customSettings.concat();
                      newSettings[i] = { setting, value: changeEvent.target.value };
                      setCustomSettings(newSettings);
                    }}
                    onBlur={() => {
                      onCustomSettingsChange(customSettings);
                    }}
                  ></Input>
                </Field>
              </Stack>
            );
          })}
          <Button
            variant="secondary"
            icon="plus"
            type="button"
            onClick={() => {
              trackClickhouseConfigV2CustomSettingClicked();
              setCustomSettings([...customSettings, { setting: '', value: '' }]);
            }}
          >
            Add custom setting
          </Button>
        </ConfigSubSection>
      </CollapsableSection>
    </Box>
  );
};

const getStyles = () => ({
  badge: css({
    marginLeft: 'auto',
  }),
});
