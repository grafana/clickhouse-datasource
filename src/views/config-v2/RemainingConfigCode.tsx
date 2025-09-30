import { ConfigSection, ConfigSubSection } from 'components/experimental/ConfigSection';
import allLabels from './labels';
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
import { Field, CertificationKey, Divider, Stack, Input, Button, Switch } from '@grafana/ui';

export interface Props extends DataSourcePluginOptionsEditorProps<CHConfig, CHSecureConfig> {}

// This code will be formatted into the new design in future iterations
export const RemainingConfigCode = (props: Props) => {
    const { options, onOptionsChange } = props;
    const { jsonData, secureJsonFields } = options;
    const labels = allLabels.components.Config.ConfigEditor;
    const secureJsonData = (options.secureJsonData || {}) as CHSecureConfig;
    const hasTLSCACert = secureJsonFields && secureJsonFields.tlsCACert;
    const hasTLSClientCert = secureJsonFields && secureJsonFields.tlsClientCert;
    const hasTLSClientKey = secureJsonFields && secureJsonFields.tlsClientKey;

    useConfigDefaults(options, onOptionsChange);

    const hasAdditionalSettings = Boolean(
        window.location.hash || // if trying to link to section on page, open all settings (React breaks this?)
        options.jsonData.defaultDatabase ||
        options.jsonData.defaultTable ||
        options.jsonData.dialTimeout ||
        options.jsonData.queryTimeout ||
        options.jsonData.validateSql ||
        options.jsonData.enableSecureSocksProxy ||
        options.jsonData.customSettings ||
        options.jsonData.logs ||
        options.jsonData.traces
    );

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

    const onTLSSettingsChange = (
        key: keyof Pick<CHConfig, 'tlsSkipVerify' | 'tlsAuth' | 'tlsAuthWithCACert'>,
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

    const onCertificateChangeFactory = (key: keyof Omit<CHSecureConfig, 'password'>, value: string) => {
        onOptionsChange({
        ...options,
        secureJsonData: {
            ...secureJsonData,
            [key]: value,
        },
        });
    };
    const onResetClickFactory = (key: keyof Omit<CHSecureConfig, 'password'>) => {
        onOptionsChange({
        ...options,
        secureJsonFields: {
            ...secureJsonFields,
            [key]: false,
        },
        secureJsonData: {
            ...secureJsonData,
            [key]: '',
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
              [key]: value
            }
          }
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
              [key]: value
            }
          }
        });
      };

    const onAliasTableConfigChange = (aliasTables: AliasTableEntry[]) => {
        onOptionsChange({
        ...options,
        jsonData: {
            ...options.jsonData,
            aliasTables
        }
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
        <div>
            <ConfigSection title="TLS / SSL Settings">
        <Field
          label={labels.tlsSkipVerify.label}
          description={labels.tlsSkipVerify.tooltip}
        >
          <Switch
            className="gf-form"
            value={jsonData.tlsSkipVerify || false}
            onChange={(e) => onTLSSettingsChange('tlsSkipVerify', e.currentTarget.checked)}
          />
        </Field>
        <Field
          label={labels.tlsClientAuth.label}
          description={labels.tlsClientAuth.tooltip}
        >
          <Switch
            className="gf-form"
            value={jsonData.tlsAuth || false}
            onChange={(e) => onTLSSettingsChange('tlsAuth', e.currentTarget.checked)}
          />
        </Field>
        <Field
          label={labels.tlsAuthWithCACert.label}
          description={labels.tlsAuthWithCACert.tooltip}
        >
          <Switch
            className="gf-form"
            value={jsonData.tlsAuthWithCACert || false}
            onChange={(e) => onTLSSettingsChange('tlsAuthWithCACert', e.currentTarget.checked)}
          />
        </Field>
        {jsonData.tlsAuthWithCACert && (
          <CertificationKey
            hasCert={!!hasTLSCACert}
            onChange={(e) => onCertificateChangeFactory('tlsCACert', e.currentTarget.value)}
            placeholder={labels.tlsCACert.placeholder}
            label={labels.tlsCACert.label}
            onClick={() => onResetClickFactory('tlsCACert')}
          />
        )}
        {jsonData.tlsAuth && (
          <>
            <CertificationKey
              hasCert={!!hasTLSClientCert}
              onChange={(e) => onCertificateChangeFactory('tlsClientCert', e.currentTarget.value)}
              placeholder={labels.tlsClientCert.placeholder}
              label={labels.tlsClientCert.label}
              onClick={() => onResetClickFactory('tlsClientCert')}
            />
            <CertificationKey
              hasCert={!!hasTLSClientKey}
              placeholder={labels.tlsClientKey.placeholder}
              label={labels.tlsClientKey.label}
              onChange={(e) => onCertificateChangeFactory('tlsClientKey', e.currentTarget.value)}
              onClick={() => onResetClickFactory('tlsClientKey')}
            />
          </>
        )}
      </ConfigSection>
       <ConfigSection
        title="Additional settings"
        description="Additional settings are optional settings that can be configured for more control over your data source. This includes the default database, dial and query timeouts, SQL validation, and custom ClickHouse settings."
        isCollapsible
        isInitiallyOpen={hasAdditionalSettings}
      >
        <Divider />
        <DefaultDatabaseTableConfig
          defaultDatabase={jsonData.defaultDatabase}
          defaultTable={jsonData.defaultTable}
          onDefaultDatabaseChange={(e) => onUpdateDatasourceJsonDataOption(props, 'defaultDatabase')(e)}
          onDefaultTableChange={(e) => onUpdateDatasourceJsonDataOption(props, 'defaultTable')(e)}
        />
        
        <Divider />
        <QuerySettingsConfig
          connMaxLifetime={jsonData.connMaxLifetime}
          dialTimeout={jsonData.dialTimeout}
          maxIdleConns={jsonData.maxIdleConns}
          maxOpenConns={jsonData.maxOpenConns}
          queryTimeout={jsonData.queryTimeout}
          validateSql={jsonData.validateSql}
          onDialTimeoutChange={(e) => onUpdateDatasourceJsonDataOption(props, 'dialTimeout')(e)}
          onQueryTimeoutChange={(e) => onUpdateDatasourceJsonDataOption(props, 'queryTimeout')(e)}
          onConnMaxLifetimeChange={(e) => onUpdateDatasourceJsonDataOption(props, 'connMaxLifetime')(e)}
          onConnMaxIdleConnsChange={(e) => onUpdateDatasourceJsonDataOption(props, 'maxIdleConns')(e)}
          onConnMaxOpenConnsChange={(e) => onUpdateDatasourceJsonDataOption(props, 'maxOpenConns')(e)}
          onValidateSqlChange={(e) => onUpdateDatasourceJsonDataOption(props, 'validateSql')(e)}
        />

        <Divider />
        <LogsConfig
          logsConfig={jsonData.logs}
          onDefaultDatabaseChange={db => onLogsConfigChange('defaultDatabase', db)}
          onDefaultTableChange={table => onLogsConfigChange('defaultTable', table)}
          onOtelEnabledChange={v => onLogsConfigChange('otelEnabled', v)}
          onOtelVersionChange={v => onLogsConfigChange('otelVersion', v)}
          onTimeColumnChange={c => onLogsConfigChange('timeColumn', c)}
          onLevelColumnChange={c => onLogsConfigChange('levelColumn', c)}
          onMessageColumnChange={c => onLogsConfigChange('messageColumn', c)}
          onSelectContextColumnsChange={c => onLogsConfigChange('selectContextColumns', c)}
          onContextColumnsChange={c => onLogsConfigChange('contextColumns', c)}
        />

        <Divider />
        <TracesConfig
          tracesConfig={jsonData.traces}
          onDefaultDatabaseChange={db => onTracesConfigChange('defaultDatabase', db)}
          onDefaultTableChange={table => onTracesConfigChange('defaultTable', table)}
          onOtelEnabledChange={v => onTracesConfigChange('otelEnabled', v)}
          onOtelVersionChange={v => onTracesConfigChange('otelVersion', v)}
          onTraceIdColumnChange={c => onTracesConfigChange('traceIdColumn', c)}
          onSpanIdColumnChange={c => onTracesConfigChange('spanIdColumn', c)}
          onOperationNameColumnChange={c => onTracesConfigChange('operationNameColumn', c)}
          onParentSpanIdColumnChange={c => onTracesConfigChange('parentSpanIdColumn', c)}
          onServiceNameColumnChange={c => onTracesConfigChange('serviceNameColumn', c)}
          onDurationColumnChange={c => onTracesConfigChange('durationColumn', c)}
          onDurationUnitChange={c => onTracesConfigChange('durationUnit', c)}
          onStartTimeColumnChange={c => onTracesConfigChange('startTimeColumn', c)}
          onTagsColumnChange={c => onTracesConfigChange('tagsColumn', c)}
          onServiceTagsColumnChange={c => onTracesConfigChange('serviceTagsColumn', c)}
          onKindColumnChange={c => onTracesConfigChange('kindColumn', c)}
          onStatusCodeColumnChange={c => onTracesConfigChange('statusCodeColumn', c)}
          onStatusMessageColumnChange={c => onTracesConfigChange('statusMessageColumn', c)}
          onStateColumnChange={c => onTracesConfigChange('stateColumn', c)}
          onInstrumentationLibraryNameColumnChange={c => onTracesConfigChange('instrumentationLibraryNameColumn', c)}
          onInstrumentationLibraryVersionColumnChange={c => onTracesConfigChange('instrumentationLibraryVersionColumn', c)}
          onFlattenNestedChange={c => onTracesConfigChange('flattenNested', c)}
          onEventsColumnPrefixChange={c => onTracesConfigChange('traceEventsColumnPrefix', c)}
          onLinksColumnPrefixChange={c => onTracesConfigChange('traceLinksColumnPrefix', c)}
        />

        <Divider />
        <AliasTableConfig aliasTables={jsonData.aliasTables} onAliasTablesChange={onAliasTableConfigChange} />
        <Divider />
        <Field label={labels.enableRowLimit.label} description={labels.enableRowLimit.tooltip}>
          <Switch
            className="gf-form"
            value={jsonData.enableRowLimit || false}
            data-testid={labels.enableRowLimit.testid}
            onChange={(e) => onSwitchToggle('enableRowLimit', e.currentTarget.checked)}
          />
        </Field>
        {config.secureSocksDSProxyEnabled && versionGte(config.buildInfo.version, '10.0.0') && (
          <Field
            label={labels.secureSocksProxy.label}
            description={labels.secureSocksProxy.tooltip}
          >
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
              <Stack key={i} direction='row'>
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
              setCustomSettings([...customSettings, { setting: '', value: '' }]);
            }}
          >
            Add custom setting
          </Button>
        </ConfigSubSection>
      </ConfigSection>
        </div>
    )
};
