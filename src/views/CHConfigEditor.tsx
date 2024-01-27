import React, { ChangeEvent, useMemo, useState } from 'react';
import {
  DataSourcePluginOptionsEditorProps,
  onUpdateDatasourceJsonDataOption,
  onUpdateDatasourceSecureJsonDataOption,
} from '@grafana/data';
import { RadioButtonGroup, Switch, Input, SecretInput, Button, Field, HorizontalGroup } from '@grafana/ui';
import { CertificationKey } from '../components/ui/CertificationKey';
import { Components } from './../selectors';
import { CHConfig, CHCustomSetting, CHSecureConfig, Protocol } from './../types';
import { gte } from 'semver';
import { ConfigSection, ConfigSubSection, DataSourceDescription } from '@grafana/experimental';
import { config } from '@grafana/runtime';
import { Divider } from 'components/Divider';

export interface Props extends DataSourcePluginOptionsEditorProps<CHConfig> { }

export const ConfigEditor: React.FC<Props> = (props) => {
  const { options, onOptionsChange } = props;
  const { jsonData, secureJsonFields } = options;
  const secureJsonData = (options.secureJsonData || {}) as CHSecureConfig;
  const hasTLSCACert = secureJsonFields && secureJsonFields.tlsCACert;
  const hasTLSClientCert = secureJsonFields && secureJsonFields.tlsClientCert;
  const hasTLSClientKey = secureJsonFields && secureJsonFields.tlsClientKey;
  const protocolOptions = [
    { label: 'Native', value: Protocol.NATIVE },
    { label: 'HTTP', value: Protocol.HTTP },
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
    key: keyof Pick<CHConfig, 'secure' | 'validate' | 'forwardHeaders' | 'enableSecureSocksProxy'>,
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

  const [customSettings, setCustomSettings] = useState(jsonData.customSettings || []);

  const hasAdditionalSettings = useMemo(
    () =>
      !!(
        options.jsonData.defaultDatabase ||
        options.jsonData.queryTimeout ||
        options.jsonData.timeout ||
        options.jsonData.validate ||
        options.jsonData.enableSecureSocksProxy ||
        options.jsonData.customSettings ||
        options.jsonData.forwardHeaders
      ),
    [options]
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
          invalid={!jsonData.server}
          error={'Server URL is required'}
        >
          <Input
            name="server"
            width={40}
            value={jsonData.server || ''}
            onChange={onUpdateDatasourceJsonDataOption(props, 'server')}
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
        <Field label={Components.ConfigEditor.Path.label} description={Components.ConfigEditor.Path.tooltip}>
          <Input
            value={jsonData.path || ''}
            name="path"
            width={40}
            onChange={onUpdateDatasourceJsonDataOption(props, 'path')}
            label={Components.ConfigEditor.Path.label}
            aria-label={Components.ConfigEditor.Path.label}
            placeholder={Components.ConfigEditor.Path.placeholder}
          />
        </Field>
        <Field label={Components.ConfigEditor.Protocol.label} description={Components.ConfigEditor.Protocol.tooltip}>

          <RadioButtonGroup<Protocol>
            options={protocolOptions}
            disabledOptions={[]}
            value={jsonData.protocol || Protocol.NATIVE}
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
      <ConfigSection
        title="Additional settings"
        description="Additional settings are optional settings that can be configured for more control over your data source. This includes the default database, dial and query timeouts, SQL validation, and custom Clickhouse settings."
        isCollapsible
        isInitiallyOpen={hasAdditionalSettings}
      >
        <Field
          label={Components.ConfigEditor.DefaultDatabase.label}
          description={Components.ConfigEditor.DefaultDatabase.tooltip}
        >
          <Input
            name="database"
            width={40}
            value={jsonData.defaultDatabase || ''}
            onChange={onUpdateDatasourceJsonDataOption(props, 'defaultDatabase')}
            label={Components.ConfigEditor.DefaultDatabase.label}
            aria-label={Components.ConfigEditor.DefaultDatabase.label}
            placeholder={Components.ConfigEditor.DefaultDatabase.placeholder}
          />
        </Field>
        <Field label={Components.ConfigEditor.Timeout.label} description={Components.ConfigEditor.Timeout.tooltip}>
          <Input
            name="timeout"
            width={40}
            value={jsonData.timeout || ''}
            onChange={onUpdateDatasourceJsonDataOption(props, 'timeout')}
            label={Components.ConfigEditor.Timeout.label}
            aria-label={Components.ConfigEditor.Timeout.label}
            placeholder={Components.ConfigEditor.Timeout.placeholder}
            type="number"
          />
        </Field>
        <Field
          label={Components.ConfigEditor.QueryTimeout.label}
          description={Components.ConfigEditor.QueryTimeout.tooltip}
        >
          <Input
            name="timeout"
            width={40}
            value={jsonData.queryTimeout || ''}
            onChange={onUpdateDatasourceJsonDataOption(props, 'queryTimeout')}
            label={Components.ConfigEditor.QueryTimeout.label}
            aria-label={Components.ConfigEditor.QueryTimeout.label}
            placeholder={Components.ConfigEditor.QueryTimeout.placeholder}
            type="number"
          />
        </Field>
        <Field label={Components.ConfigEditor.Validate.label} description={Components.ConfigEditor.Validate.tooltip}>
          <Switch
            className="gf-form"
            value={jsonData.validate || false}
            onChange={(e) => onSwitchToggle('validate', e.currentTarget.checked)}
          />
        </Field>
        <Field label={Components.ConfigEditor.ForwardHeaders.label} description={Components.ConfigEditor.ForwardHeaders.tooltip}>
          <Switch
            className="gf-form"
            value={jsonData.forwardHeaders || false}
            onChange={(e) => onSwitchToggle('forwardHeaders', e.currentTarget.checked)}
          />
        </Field>

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
