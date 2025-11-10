import { ConfigSubSection } from 'components/experimental/ConfigSection';
import allLabels from './labelsV2';
import React, { ChangeEvent, useMemo, useState } from 'react';
import {
  DataSourcePluginOptionsEditorProps,
  onUpdateDatasourceJsonDataOption,
  onUpdateDatasourceJsonDataOptionChecked,
} from '@grafana/data';
import {
  AliasTableEntry,
  CHConfig,
  CHCustomSetting,
  CHLogsConfig,
  CHSecureConfig,
  CHTracesConfig,
  defaultCHAdditionalSettingsConfig,
} from 'types/config';
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

  const onUpdateLogsConfig = (key: keyof CHLogsConfig, value: string | boolean | string[]) => {
    trackClickhouseConfigV2LogsConfig({ [key]: value });
    onLogsConfigChange(key, value);
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

  const onUpdateTracesConfig = (key: keyof CHTracesConfig, value: string | boolean) => {
    trackClickhouseConfigV2TracesConfig({ [key]: value });
    onTracesConfigChange(key, value);
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

  const shallowSettingsCompare = (currentSettings: any, defaultSettings: any): boolean => {
    // needed for dealing with proxy object from currentSettings
    currentSettings = Object.assign({}, currentSettings);

    const currentSettingsKeys = Object.keys(currentSettings);
    const defaultSettingsKeys = Object.keys(defaultSettings);

    if (currentSettingsKeys.length !== defaultSettingsKeys.length) {
      return false;
    }

    for (const key of currentSettingsKeys) {
      if (!defaultSettingsKeys.includes(key)) {
        return false;
      }
      if (currentSettings[key].length === 0 && defaultSettings[key].length === 0) {
        continue;
      }
      if (currentSettings[key] !== defaultSettings[key]) {
        return false;
      }
    }
    return true;
  };

  const shouldBeOpen = useMemo(() => {
    return (
      jsonData.defaultDatabase ||
      jsonData.defaultTable ||
      jsonData.connMaxLifetime ||
      jsonData.dialTimeout ||
      jsonData.maxIdleConns ||
      jsonData.maxOpenConns ||
      jsonData.queryTimeout ||
      jsonData.validateSql ||
      !shallowSettingsCompare(jsonData.logs, defaultCHAdditionalSettingsConfig.logs) ||
      !shallowSettingsCompare(jsonData.traces, defaultCHAdditionalSettingsConfig.traces) ||
      (jsonData.aliasTables && jsonData.aliasTables.length > 0) ||
      jsonData.enableRowLimit ||
      jsonData.enableSecureSocksProxy ||
      customSettings.length > 0
    );
  }, [jsonData, customSettings]);

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
            <Text variant="h3">{CONFIG_SECTION_HEADERS[3].label}</Text>
            <Badge text="optional" color="darkgrey" className={styles.badge} />
          </>
        }
        isOpen={!!shouldBeOpen}
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
        <Divider />
        <LogsConfig
          logsConfig={jsonData.logs}
          onDefaultDatabaseChange={(db) => onUpdateLogsConfig('defaultDatabase', db)}
          onDefaultTableChange={(table) => onUpdateLogsConfig('defaultTable', table)}
          onOtelEnabledChange={(v) => onUpdateLogsConfig('otelEnabled', v)}
          onOtelVersionChange={(v) => onUpdateLogsConfig('otelVersion', v)}
          onTimeColumnChange={(c) => onUpdateLogsConfig('timeColumn', c)}
          onLevelColumnChange={(c) => onUpdateLogsConfig('levelColumn', c)}
          onMessageColumnChange={(c) => onUpdateLogsConfig('messageColumn', c)}
          onSelectContextColumnsChange={(c) => onUpdateLogsConfig('selectContextColumns', c)}
          onContextColumnsChange={(c) => onUpdateLogsConfig('contextColumns', c)}
        />

        <Divider />
        <TracesConfig
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
          onInstrumentationLibraryNameColumnChange={(c) => onUpdateTracesConfig('instrumentationLibraryNameColumn', c)}
          onInstrumentationLibraryVersionColumnChange={(c) =>
            onUpdateTracesConfig('instrumentationLibraryVersionColumn', c)
          }
          onFlattenNestedChange={(c) => onUpdateTracesConfig('flattenNested', c)}
          onEventsColumnPrefixChange={(c) => onUpdateTracesConfig('traceEventsColumnPrefix', c)}
          onLinksColumnPrefixChange={(c) => onUpdateTracesConfig('traceLinksColumnPrefix', c)}
        />
        <Divider />
        <AliasTableConfig aliasTables={jsonData.aliasTables} onAliasTablesChange={onAliasTableConfigChange} />
        <Divider />
        <Field label={labels.enableRowLimit.label} description={labels.enableRowLimit.tooltip}>
          <Switch
            value={jsonData.enableRowLimit || false}
            data-testid={labels.enableRowLimit.testid}
            onChange={(e) => {
              trackClickhouseConfigV2EnableRowLimitToggle({ rowLimitEnabled: e.currentTarget.checked });
              onUpdateDatasourceJsonDataOptionChecked(props, 'enableRowLimit')(e);
            }}
          />
        </Field>
        {config.secureSocksDSProxyEnabled && versionGte(config.buildInfo.version, '10.0.0') && (
          <Field label={labels.secureSocksProxy.label} description={labels.secureSocksProxy.tooltip}>
            <Switch
              value={jsonData.enableSecureSocksProxy || false}
              onChange={(e) => onUpdateDatasourceJsonDataOptionChecked(props, 'enableSecureSocksProxy')(e)}
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
