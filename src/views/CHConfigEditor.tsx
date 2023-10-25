import React, { ChangeEvent, useState } from 'react';
import {
  DataSourcePluginOptionsEditorProps,
  onUpdateDatasourceJsonDataOption,
  onUpdateDatasourceSecureJsonDataOption,
} from '@grafana/data';
import { RadioButtonGroup, Switch, Input, SecretInput, Button, Field, HorizontalGroup } from '@grafana/ui';
import { CertificationKey } from '../components/ui/CertificationKey';
import { Components } from './../selectors';
import { CHConfig, CHCustomSetting, CHSecureConfig, CHLogsConfig, Protocol, CHTracesConfig } from 'types/config';
import { gte } from 'semver';
import { ConfigSection, ConfigSubSection, DataSourceDescription } from '@grafana/experimental';
import { config } from '@grafana/runtime';
import { Divider } from 'components/Divider';
import { TimeUnit } from 'types/queryBuilder';
import { DefaultDatabaseTableConfig } from 'components/configEditor/DefaultDatabaseTableConfig';
import { QuerySettingsConfig } from 'components/configEditor/QuerySettingsConfig';
import { LogsConfig } from 'components/configEditor/LogsConfig';
import { TracesConfig } from 'components/configEditor/TracesConfig';

export interface ConfigEditorProps extends DataSourcePluginOptionsEditorProps<CHConfig> {}

export const ConfigEditor: React.FC<ConfigEditorProps> = (props) => {
  const { options, onOptionsChange } = props;
  const { jsonData, secureJsonFields } = options;
  const secureJsonData = (options.secureJsonData || {}) as CHSecureConfig;
  const hasTLSCACert = secureJsonFields && secureJsonFields.tlsCACert;
  const hasTLSClientCert = secureJsonFields && secureJsonFields.tlsClientCert;
  const hasTLSClientKey = secureJsonFields && secureJsonFields.tlsClientKey;
  const protocolOptions = [
    { label: 'Native', value: Protocol.Native },
    { label: 'HTTP', value: Protocol.Http },
  ];
  const onPortChange = (port: string) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...options.jsonData,
        port: +port,
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
  const onSwitchToggle = (
    key: keyof Pick<CHConfig, 'secure' | 'validateSql' | 'enableSecureSocksProxy'>,
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

  const onProtocolToggle = (protocol: Protocol) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...options.jsonData,
        protocol: protocol,
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
  const onResetPassword = () => {
    onOptionsChange({
      ...options,
      secureJsonFields: {
        ...options.secureJsonFields,
        password: false,
      },
      secureJsonData: {
        ...options.secureJsonData,
        password: '',
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
  const onLogsConfigChange = (key: keyof CHLogsConfig, value: string) => {
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
  const onTracesConfigChange = (key: keyof CHTracesConfig, value: string) => {
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

  const [customSettings, setCustomSettings] = useState(jsonData.customSettings || []);

  const hasAdditionalSettings = !!(
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

  return (
    <>
      <DataSourceDescription
        dataSourceName="Clickhouse"
        docsLink="https://grafana.com/grafana/plugins/grafana-clickhouse-datasource/"
        hasRequiredFields
      />
      <Divider />
      <ConfigSection title="Server">
        <Field
          required
          label={Components.ConfigEditor.ServerAddress.label}
          description={Components.ConfigEditor.ServerAddress.tooltip}
          invalid={!jsonData.host}
          error={'Server URL is required'}
        >
          <Input
            name="host"
            width={40}
            value={jsonData.host || ''}
            onChange={onUpdateDatasourceJsonDataOption(props, 'host')}
            label={Components.ConfigEditor.ServerAddress.label}
            aria-label={Components.ConfigEditor.ServerAddress.label}
            placeholder={Components.ConfigEditor.ServerAddress.placeholder}
          />
        </Field>
        <Field
          required
          label={Components.ConfigEditor.ServerPort.label}
          description={Components.ConfigEditor.ServerPort.tooltip}
          invalid={!jsonData.port}
          error={'Port is required'}
        >
          <Input
            name="port"
            width={40}
            type="number"
            value={jsonData.port || ''}
            onChange={(e) => onPortChange(e.currentTarget.value)}
            label={Components.ConfigEditor.ServerPort.label}
            aria-label={Components.ConfigEditor.ServerPort.label}
            placeholder={Components.ConfigEditor.ServerPort.placeholder(jsonData.secure?.toString() || 'false')}
          />
        </Field>
        <Field label={Components.ConfigEditor.Protocol.label} description={Components.ConfigEditor.Protocol.tooltip}>
          <RadioButtonGroup<Protocol>
            options={protocolOptions}
            disabledOptions={[]}
            value={jsonData.protocol || Protocol.Native}
            onChange={(e) => onProtocolToggle(e!)}
          />
        </Field>
        <Field label={Components.ConfigEditor.Secure.label} description={Components.ConfigEditor.Secure.tooltip}>
          <Switch
            id="secure"
            className="gf-form"
            value={jsonData.secure || false}
            onChange={(e) => onSwitchToggle('secure', e.currentTarget.checked)}
          />
        </Field>
      </ConfigSection>

      <Divider />
      <ConfigSection title="TLS / SSL Settings">
        <Field
          label={Components.ConfigEditor.TLSSkipVerify.label}
          description={Components.ConfigEditor.TLSSkipVerify.tooltip}
        >
          <Switch
            className="gf-form"
            value={jsonData.tlsSkipVerify || false}
            onChange={(e) => onTLSSettingsChange('tlsSkipVerify', e.currentTarget.checked)}
          />
        </Field>
        <Field
          label={Components.ConfigEditor.TLSClientAuth.label}
          description={Components.ConfigEditor.TLSClientAuth.tooltip}
        >
          <Switch
            className="gf-form"
            value={jsonData.tlsAuth || false}
            onChange={(e) => onTLSSettingsChange('tlsAuth', e.currentTarget.checked)}
          />
        </Field>
        <Field
          label={Components.ConfigEditor.TLSAuthWithCACert.label}
          description={Components.ConfigEditor.TLSAuthWithCACert.tooltip}
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
            placeholder={Components.ConfigEditor.TLSCACert.placeholder}
            label={Components.ConfigEditor.TLSCACert.label}
            onClick={() => onResetClickFactory('tlsCACert')}
          />
        )}
        {jsonData.tlsAuth && (
          <>
            <CertificationKey
              hasCert={!!hasTLSClientCert}
              onChange={(e) => onCertificateChangeFactory('tlsClientCert', e.currentTarget.value)}
              placeholder={Components.ConfigEditor.TLSClientCert.placeholder}
              label={Components.ConfigEditor.TLSClientCert.label}
              onClick={() => onResetClickFactory('tlsClientCert')}
            />
            <CertificationKey
              hasCert={!!hasTLSClientKey}
              placeholder={Components.ConfigEditor.TLSClientKey.placeholder}
              label={Components.ConfigEditor.TLSClientKey.label}
              onChange={(e) => onCertificateChangeFactory('tlsClientKey', e.currentTarget.value)}
              onClick={() => onResetClickFactory('tlsClientKey')}
            />
          </>
        )}
      </ConfigSection>

      <Divider />
      <ConfigSection title="Credentials">
        <Field
          label={Components.ConfigEditor.Username.label}
          description={Components.ConfigEditor.Username.tooltip}
        >
          <Input
            name="user"
            width={40}
            value={jsonData.username || ''}
            onChange={onUpdateDatasourceJsonDataOption(props, 'username')}
            label={Components.ConfigEditor.Username.label}
            aria-label={Components.ConfigEditor.Username.label}
            placeholder={Components.ConfigEditor.Username.placeholder}
          />
        </Field>
        <Field label={Components.ConfigEditor.Password.label} description={Components.ConfigEditor.Password.tooltip}>
          <SecretInput
            name="pwd"
            width={40}
            label={Components.ConfigEditor.Password.label}
            aria-label={Components.ConfigEditor.Password.label}
            placeholder={Components.ConfigEditor.Password.placeholder}
            value={secureJsonData.password || ''}
            isConfigured={(secureJsonFields && secureJsonFields.password) as boolean}
            onReset={onResetPassword}
            onChange={onUpdateDatasourceSecureJsonDataOption(props, 'password')}
          />
        </Field>
      </ConfigSection>

      <Divider />
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
          onDefaultDatabaseChange={onUpdateDatasourceJsonDataOption(props, 'defaultDatabase')}
          onDefaultTableChange={onUpdateDatasourceJsonDataOption(props, 'defaultTable')}
        />
        
        <Divider />
        <QuerySettingsConfig
          dialTimeout={jsonData.dialTimeout}
          queryTimeout={jsonData.queryTimeout}
          validateSql={jsonData.validateSql}
          onDialTimeoutChange={onUpdateDatasourceJsonDataOption(props, 'dialTimeout')}
          onQueryTimeoutChange={onUpdateDatasourceJsonDataOption(props, 'queryTimeout')}
          onValidateSqlChange={e => onSwitchToggle('validateSql', e.currentTarget.checked)}
        />

        <Divider />
        <LogsConfig
          defaultDatabase={jsonData.logs?.defaultDatabase}
          defaultTable={jsonData.logs?.defaultTable}
          onDefaultDatabaseChange={db => onLogsConfigChange('defaultDatabase', db)}
          onDefaultTableChange={table => onLogsConfigChange('defaultTable', table)}

          otelEnabled={jsonData.logs?.otelEnabled}
          otelVersion={jsonData.logs?.otelVersion}
          onOtelEnabledChange={v => onLogsConfigChange('otelEnabled', v)}
          onOtelVersionChange={v => onLogsConfigChange('otelVersion', v)}

          timeColumn={jsonData.logs?.timeColumn}
          levelColumn={jsonData.logs?.levelColumn}
          messageColumn={jsonData.logs?.messageColumn}
          onTimeColumnChange={c => onLogsConfigChange('timeColumn', c)}
          onLevelColumnChange={c => onLogsConfigChange('levelColumn', c)}
          onMessageColumnChange={c => onLogsConfigChange('messageColumn', c)}
        />

        <Divider />
        <TracesConfig
          defaultDatabase={jsonData.traces?.defaultDatabase}
          defaultTable={jsonData.traces?.defaultTable}
          onDefaultDatabaseChange={db => onTracesConfigChange('defaultDatabase', db)}
          onDefaultTableChange={table => onTracesConfigChange('defaultTable', table)}

          otelEnabled={jsonData.traces?.otelEnabled}
          otelVersion={jsonData.traces?.otelVersion}
          onOtelEnabledChange={v => onTracesConfigChange('otelEnabled', v)}
          onOtelVersionChange={v => onTracesConfigChange('otelVersion', v)}

          traceIdColumn={jsonData.traces?.traceIdColumn}
          spanIdColumn={jsonData.traces?.spanIdColumn}
          operationNameColumn={jsonData.traces?.operationNameColumn}
          parentSpanIdColumn={jsonData.traces?.parentSpanIdColumn}
          serviceNameColumn={jsonData.traces?.serviceNameColumn}
          durationColumn={jsonData.traces?.durationColumn}
          durationUnit={jsonData.traces?.durationUnit}
          startTimeColumn={jsonData.traces?.startTimeColumn}
          tagsColumn={jsonData.traces?.tagsColumn}
          serviceTagsColumn={jsonData.traces?.serviceTagsColumn}
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
        />

        <Divider />
        {config.featureToggles['secureSocksDSProxyEnabled'] && gte(config.buildInfo.version, '10.0.0') && (
          <Field
            label={Components.ConfigEditor.SecureSocksProxy.label}
            description={Components.ConfigEditor.SecureSocksProxy.tooltip}
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
              <HorizontalGroup key={i}>
                <Field label={`Setting`} aria-label={`Setting`}>
                  <Input
                    value={setting}
                    placeholder={'Setting'}
                    onChange={(changeEvent: ChangeEvent<HTMLInputElement>) => {
                      let newSettings = customSettings.concat();
                      newSettings[i] = { setting: changeEvent.target.value, value };
                      setCustomSettings(newSettings);
                    }}
                    onBlur={() => {
                      onCustomSettingsChange(customSettings);
                    }}
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
              </HorizontalGroup>
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
    </>
  );
};
