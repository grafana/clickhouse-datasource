import React, { ChangeEvent, useState } from 'react';
import {
  DataSourcePluginOptionsEditorProps,
  onUpdateDatasourceJsonDataOption,
  onUpdateDatasourceSecureJsonDataOption,
} from '@grafana/data';
import {
  Button,
  InlineFormLabel,
  LegacyForms,
  RadioButtonGroup,
  useTheme,
  Switch,
  InlineFieldRow,
  InlineField,
  Input,
} from '@grafana/ui';
import { CertificationKey } from '../components/ui/CertificationKey';
import { Components } from './../selectors';
import { CHConfig, CHCustomSetting, CHSecureConfig, Protocol } from './../types';

export interface Props extends DataSourcePluginOptionsEditorProps<CHConfig> {}

export const ConfigEditor: React.FC<Props> = (props) => {
  const theme = useTheme();
  const { FormField, SecretFormField } = LegacyForms;
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
  const switchContainerStyle: React.CSSProperties = {
    padding: `0 ${theme.spacing.sm}`,
    height: `${theme.spacing.formInputHeight}px`,
    display: 'flex',
    alignItems: 'center',
  };
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
  const onSwitchToggle = (key: keyof Pick<CHConfig, 'secure' | 'validate'>, value: boolean) => {
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

  return (
    <>
      <div className="gf-form-group">
        <h3>Server</h3>
        <br />
        <div className="gf-form">
          <FormField
            name="server"
            labelWidth={12}
            inputWidth={20}
            value={jsonData.server || ''}
            onChange={onUpdateDatasourceJsonDataOption(props, 'server')}
            label={Components.ConfigEditor.ServerAddress.label}
            aria-label={Components.ConfigEditor.ServerAddress.label}
            placeholder={Components.ConfigEditor.ServerAddress.placeholder}
            tooltip={Components.ConfigEditor.ServerAddress.tooltip}
          />
        </div>
        <div className="gf-form">
          <FormField
            name="port"
            labelWidth={12}
            inputWidth={20}
            type="number"
            value={jsonData.port || ''}
            onChange={(e) => onPortChange(e.currentTarget.value)}
            label={Components.ConfigEditor.ServerPort.label}
            aria-label={Components.ConfigEditor.ServerPort.label}
            placeholder={Components.ConfigEditor.ServerPort.placeholder(jsonData.secure?.toString() || 'false')}
            tooltip={Components.ConfigEditor.ServerPort.tooltip}
          />
        </div>
        <div className="gf-form">
          <InlineFormLabel width={12} tooltip={Components.ConfigEditor.Protocol.tooltip}>
            {Components.ConfigEditor.Protocol.label}
          </InlineFormLabel>
          <RadioButtonGroup<Protocol>
            options={protocolOptions}
            disabledOptions={[]}
            value={jsonData.protocol || Protocol.NATIVE}
            onChange={(e) => onProtocolToggle(e!)}
          />
        </div>
        <div className="gf-form">
          <InlineFormLabel width={12} tooltip={Components.ConfigEditor.Secure.tooltip}>
            {Components.ConfigEditor.Secure.label}
          </InlineFormLabel>
          <div style={switchContainerStyle}>
            <Switch
              id="secure"
              className="gf-form"
              value={jsonData.secure || false}
              onChange={(e) => onSwitchToggle('secure', e.currentTarget.checked)}
            />
          </div>
        </div>
      </div>
      <div className="gf-form-group">
        <h3>Credentials</h3>
        <br />
        <div className="gf-form">
          <FormField
            name="user"
            labelWidth={12}
            inputWidth={20}
            value={jsonData.username || ''}
            onChange={onUpdateDatasourceJsonDataOption(props, 'username')}
            label={Components.ConfigEditor.Username.label}
            aria-label={Components.ConfigEditor.Username.label}
            placeholder={Components.ConfigEditor.Username.placeholder}
            tooltip={Components.ConfigEditor.Username.tooltip}
          />
        </div>
        <div className="gf-form">
          <SecretFormField
            name="pwd"
            labelWidth={12}
            inputWidth={20}
            required
            value={secureJsonData.password || ''}
            isConfigured={(secureJsonFields && secureJsonFields.password) as boolean}
            onReset={onResetPassword}
            onChange={onUpdateDatasourceSecureJsonDataOption(props, 'password')}
            label={Components.ConfigEditor.Password.label}
            aria-label={Components.ConfigEditor.Password.label}
            placeholder={Components.ConfigEditor.Password.placeholder}
            tooltip={Components.ConfigEditor.Password.tooltip}
          />
        </div>
      </div>
      <div className="gf-form-group">
        <h3>TLS / SSL Settings</h3>
        <br />
        <div className="gf-form">
          <InlineFormLabel width={12} tooltip={Components.ConfigEditor.TLSSkipVerify.tooltip}>
            {Components.ConfigEditor.TLSSkipVerify.label}
          </InlineFormLabel>
          <div style={switchContainerStyle}>
            <Switch
              className="gf-form"
              value={jsonData.tlsSkipVerify || false}
              onChange={(e) => onTLSSettingsChange('tlsSkipVerify', e.currentTarget.checked)}
            />
          </div>
        </div>
        <div className="gf-form">
          <InlineFormLabel width={12} tooltip={Components.ConfigEditor.TLSClientAuth.tooltip}>
            {Components.ConfigEditor.TLSClientAuth.label}
          </InlineFormLabel>
          <div style={switchContainerStyle}>
            <Switch
              className="gf-form"
              value={jsonData.tlsAuth || false}
              onChange={(e) => onTLSSettingsChange('tlsAuth', e.currentTarget.checked)}
            />
          </div>
          <InlineFormLabel width={12} tooltip={Components.ConfigEditor.TLSAuthWithCACert.tooltip}>
            {Components.ConfigEditor.TLSAuthWithCACert.label}
          </InlineFormLabel>
          <div style={switchContainerStyle}>
            <Switch
              className="gf-form"
              value={jsonData.tlsAuthWithCACert || false}
              onChange={(e) => onTLSSettingsChange('tlsAuthWithCACert', e.currentTarget.checked)}
            />
          </div>
        </div>
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
      </div>
      <div className="gf-form-group">
        <h3>Additional Properties</h3>
        <br />
        <div className="gf-form">
          <FormField
            labelWidth={12}
            inputWidth={20}
            value={jsonData.defaultDatabase || ''}
            onChange={onUpdateDatasourceJsonDataOption(props, 'defaultDatabase')}
            label={Components.ConfigEditor.DefaultDatabase.label}
            aria-label={Components.ConfigEditor.DefaultDatabase.label}
            placeholder={Components.ConfigEditor.DefaultDatabase.placeholder}
            tooltip={Components.ConfigEditor.DefaultDatabase.tooltip}
          />
        </div>
        <div className="gf-form">
          <FormField
            labelWidth={12}
            inputWidth={20}
            value={jsonData.timeout || ''}
            onChange={onUpdateDatasourceJsonDataOption(props, 'timeout')}
            label={Components.ConfigEditor.Timeout.label}
            aria-label={Components.ConfigEditor.Timeout.label}
            placeholder={Components.ConfigEditor.Timeout.placeholder}
            tooltip={Components.ConfigEditor.Timeout.tooltip}
            type="number"
          />
        </div>
        <div className="gf-form">
          <FormField
            labelWidth={12}
            inputWidth={20}
            value={jsonData.queryTimeout || ''}
            onChange={onUpdateDatasourceJsonDataOption(props, 'queryTimeout')}
            label={Components.ConfigEditor.QueryTimeout.label}
            aria-label={Components.ConfigEditor.QueryTimeout.label}
            placeholder={Components.ConfigEditor.QueryTimeout.placeholder}
            tooltip={Components.ConfigEditor.QueryTimeout.tooltip}
            type="number"
          />
        </div>
        <div className="gf-form">
          <InlineFormLabel width={12} tooltip={Components.ConfigEditor.Validate.tooltip}>
            {Components.ConfigEditor.Validate.label}
          </InlineFormLabel>
          <div style={switchContainerStyle}>
            <Switch
              className="gf-form"
              value={jsonData.validate || false}
              onChange={(e) => onSwitchToggle('validate', e.currentTarget.checked)}
            />
          </div>
        </div>
      </div>
      <div className="gf-form-group">
        <h3>Custom Settings</h3>
        <br />
        {customSettings.map(({ setting, value }, i) => {
          return (
            <InlineFieldRow key={i}>
              <InlineField label={`Setting`} aria-label={`Setting`}>
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
              </InlineField>
              <InlineField label={'Value'} aria-label={`Value`}>
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
              </InlineField>
            </InlineFieldRow>
          );
        })}
        <br />
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
      </div>
    </>
  );
};
