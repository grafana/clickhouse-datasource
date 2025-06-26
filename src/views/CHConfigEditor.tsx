import React, { ChangeEvent, useState } from 'react';
import {
  DataSourcePluginOptionsEditorProps,
  onUpdateDatasourceJsonDataOption,
  onUpdateDatasourceSecureJsonDataOption,
} from '@grafana/data';
import { RadioButtonGroup, Switch, Input, SecretInput, Button, Field, Alert, Stack } from '@grafana/ui';
import { CertificationKey } from '../components/ui/CertificationKey';
import {
  CHConfig,
  CHCustomSetting,
  CHSecureConfig,
  CHLogsConfig,
  Protocol,
  CHTracesConfig,
  AliasTableEntry,
} from 'types/config';
import { gte as versionGte } from 'semver';
import { ConfigSection, ConfigSubSection, DataSourceDescription } from 'components/experimental/ConfigSection';
import { config } from '@grafana/runtime';
import { Divider } from 'components/Divider';
import { TimeUnit } from 'types/queryBuilder';
import { DefaultDatabaseTableConfig } from 'components/configEditor/DefaultDatabaseTableConfig';
import { QuerySettingsConfig } from 'components/configEditor/QuerySettingsConfig';
import { LogsConfig } from 'components/configEditor/LogsConfig';
import { TracesConfig } from 'components/configEditor/TracesConfig';
import { HttpHeadersConfig } from 'components/configEditor/HttpHeadersConfig';
import allLabels from 'labels';
import { onHttpHeadersChange, useConfigDefaults } from './CHConfigEditorHooks';
import { AliasTableConfig } from '../components/configEditor/AliasTableConfig';

export interface ConfigEditorProps extends DataSourcePluginOptionsEditorProps<CHConfig, CHSecureConfig> {}

export const ConfigEditor: React.FC<ConfigEditorProps> = (props) => {
  const { options, onOptionsChange } = props;
  const { jsonData, secureJsonFields } = options;
  const labels = allLabels.components.Config.ConfigEditor;
  const secureJsonData = (options.secureJsonData || {}) as CHSecureConfig;
  const hasTLSCACert = secureJsonFields && secureJsonFields.tlsCACert;
  const hasTLSClientCert = secureJsonFields && secureJsonFields.tlsClientCert;
  const hasTLSClientKey = secureJsonFields && secureJsonFields.tlsClientKey;
  const protocolOptions = [
    { label: 'Native', value: Protocol.Native },
    { label: 'HTTP', value: Protocol.Http },
  ];

  useConfigDefaults(options, onOptionsChange);

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

  const [customSettings, setCustomSettings] = useState(jsonData.customSettings || []);

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

  const defaultPort = jsonData.secure
    ? jsonData.protocol === Protocol.Native
      ? labels.serverPort.secureNativePort
      : labels.serverPort.secureHttpPort
    : jsonData.protocol === Protocol.Native
      ? labels.serverPort.insecureNativePort
      : labels.serverPort.insecureHttpPort;
  const portDescription = `${labels.serverPort.tooltip} (default for ${jsonData.secure ? 'secure' : ''} ${jsonData.protocol}: ${defaultPort})`;

  const uidWarning = !options.uid && (
    <Alert title="" severity="warning" buttonContent="Close">
      <Stack>
        <div>
          {'This datasource is missing the'}
          <code>uid</code>
          {'field in its configuration. If your datasource is '}
          <a
            style={{ textDecoration: 'underline' }}
            href="https://grafana.com/docs/grafana/latest/administration/provisioning/#data-sources"
            target="_blank"
            rel="noreferrer"
          >
            provisioned via YAML
          </a>
          {', please verify the UID is set. This is required to enable data linking between logs and traces.'}
        </div>
      </Stack>
    </Alert>
  );

  return (
    <>
      {uidWarning}
      <DataSourceDescription
        dataSourceName="Clickhouse"
        docsLink="https://grafana.com/grafana/plugins/grafana-clickhouse-datasource/"
        hasRequiredFields
      />
      <Divider />
      <ConfigSection title="Server">
        <Field
          required
          label={labels.serverAddress.label}
          description={labels.serverAddress.tooltip}
          invalid={!jsonData.host}
          error={labels.serverAddress.error}
        >
          <Input
            name="host"
            width={80}
            value={jsonData.host || ''}
            onChange={onUpdateDatasourceJsonDataOption(props, 'host')}
            label={labels.serverAddress.label}
            aria-label={labels.serverAddress.label}
            placeholder={labels.serverAddress.placeholder}
          />
        </Field>
        <Field
          required
          label={labels.serverPort.label}
          description={portDescription}
          invalid={!jsonData.port}
          error={labels.serverPort.error}
        >
          <Input
            name="port"
            width={40}
            type="number"
            value={jsonData.port || ''}
            onChange={(e) => onPortChange(e.currentTarget.value)}
            label={labels.serverPort.label}
            aria-label={labels.serverPort.label}
            placeholder={defaultPort}
          />
        </Field>

        <Field label={labels.protocol.label} description={labels.protocol.tooltip}>
          <RadioButtonGroup<Protocol>
            options={protocolOptions}
            disabledOptions={[]}
            value={jsonData.protocol || Protocol.Native}
            onChange={(e) => onProtocolToggle(e!)}
          />
        </Field>
        <Field label={labels.secure.label} description={labels.secure.tooltip}>
          <Switch
            id="secure"
            className="gf-form"
            value={jsonData.secure || false}
            onChange={(e) => onSwitchToggle('secure', e.currentTarget.checked)}
          />
        </Field>

        {jsonData.protocol === Protocol.Http && (
          <Field label={labels.path.label} description={labels.path.tooltip}>
            <Input
              value={jsonData.path || ''}
              name="path"
              width={80}
              onChange={onUpdateDatasourceJsonDataOption(props, 'path')}
              label={labels.path.label}
              aria-label={labels.path.label}
              placeholder={labels.path.placeholder}
            />
          </Field>
        )}
      </ConfigSection>

      {jsonData.protocol === Protocol.Http && (
        <HttpHeadersConfig
          headers={options.jsonData.httpHeaders}
          forwardGrafanaHeaders={options.jsonData.forwardGrafanaHeaders}
          secureFields={options.secureJsonFields}
          onHttpHeadersChange={(headers) => onHttpHeadersChange(headers, options, onOptionsChange)}
          onForwardGrafanaHeadersChange={(forwardGrafanaHeaders) =>
            onSwitchToggle('forwardGrafanaHeaders', forwardGrafanaHeaders)
          }
        />
      )}

      <Divider />
      <ConfigSection title="TLS / SSL Settings">
        <Field label={labels.tlsSkipVerify.label} description={labels.tlsSkipVerify.tooltip}>
          <Switch
            className="gf-form"
            value={jsonData.tlsSkipVerify || false}
            onChange={(e) => onTLSSettingsChange('tlsSkipVerify', e.currentTarget.checked)}
          />
        </Field>
        <Field label={labels.tlsClientAuth.label} description={labels.tlsClientAuth.tooltip}>
          <Switch
            className="gf-form"
            value={jsonData.tlsAuth || false}
            onChange={(e) => onTLSSettingsChange('tlsAuth', e.currentTarget.checked)}
          />
        </Field>
        <Field label={labels.tlsAuthWithCACert.label} description={labels.tlsAuthWithCACert.tooltip}>
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

      <Divider />
      <ConfigSection title="Credentials">
        <Field label={labels.username.label} description={labels.username.tooltip}>
          <Input
            name="user"
            width={40}
            value={jsonData.username || ''}
            onChange={onUpdateDatasourceJsonDataOption(props, 'username')}
            label={labels.username.label}
            aria-label={labels.username.label}
            placeholder={labels.username.placeholder}
          />
        </Field>
        <Field label={labels.password.label} description={labels.password.tooltip}>
          <SecretInput
            name="pwd"
            width={40}
            label={labels.password.label}
            aria-label={labels.password.label}
            placeholder={labels.password.placeholder}
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
          connMaxLifetime={jsonData.connMaxLifetime}
          dialTimeout={jsonData.dialTimeout}
          maxIdleConns={jsonData.maxIdleConns}
          maxOpenConns={jsonData.maxOpenConns}
          queryTimeout={jsonData.queryTimeout}
          validateSql={jsonData.validateSql}
          onConnMaxIdleConnsChange={onUpdateDatasourceJsonDataOption(props, 'maxIdleConns')}
          onConnMaxLifetimeChange={onUpdateDatasourceJsonDataOption(props, 'connMaxLifetime')}
          onConnMaxOpenConnsChange={onUpdateDatasourceJsonDataOption(props, 'maxOpenConns')}
          onDialTimeoutChange={onUpdateDatasourceJsonDataOption(props, 'dialTimeout')}
          onQueryTimeoutChange={onUpdateDatasourceJsonDataOption(props, 'queryTimeout')}
          onValidateSqlChange={(e) => onSwitchToggle('validateSql', e.currentTarget.checked)}
        />

        <Divider />
        <LogsConfig
          logsConfig={jsonData.logs}
          onDefaultDatabaseChange={(db) => onLogsConfigChange('defaultDatabase', db)}
          onDefaultTableChange={(table) => onLogsConfigChange('defaultTable', table)}
          onOtelEnabledChange={(v) => onLogsConfigChange('otelEnabled', v)}
          onOtelVersionChange={(v) => onLogsConfigChange('otelVersion', v)}
          onTimeColumnChange={(c) => onLogsConfigChange('timeColumn', c)}
          onLevelColumnChange={(c) => onLogsConfigChange('levelColumn', c)}
          onMessageColumnChange={(c) => onLogsConfigChange('messageColumn', c)}
          onSelectContextColumnsChange={(c) => onLogsConfigChange('selectContextColumns', c)}
          onContextColumnsChange={(c) => onLogsConfigChange('contextColumns', c)}
        />

        <Divider />
        <TracesConfig
          tracesConfig={jsonData.traces}
          onDefaultDatabaseChange={(db) => onTracesConfigChange('defaultDatabase', db)}
          onDefaultTableChange={(table) => onTracesConfigChange('defaultTable', table)}
          onOtelEnabledChange={(v) => onTracesConfigChange('otelEnabled', v)}
          onOtelVersionChange={(v) => onTracesConfigChange('otelVersion', v)}
          onTraceIdColumnChange={(c) => onTracesConfigChange('traceIdColumn', c)}
          onSpanIdColumnChange={(c) => onTracesConfigChange('spanIdColumn', c)}
          onOperationNameColumnChange={(c) => onTracesConfigChange('operationNameColumn', c)}
          onParentSpanIdColumnChange={(c) => onTracesConfigChange('parentSpanIdColumn', c)}
          onServiceNameColumnChange={(c) => onTracesConfigChange('serviceNameColumn', c)}
          onDurationColumnChange={(c) => onTracesConfigChange('durationColumn', c)}
          onDurationUnitChange={(c) => onTracesConfigChange('durationUnit', c)}
          onStartTimeColumnChange={(c) => onTracesConfigChange('startTimeColumn', c)}
          onTagsColumnChange={(c) => onTracesConfigChange('tagsColumn', c)}
          onServiceTagsColumnChange={(c) => onTracesConfigChange('serviceTagsColumn', c)}
          onKindColumnChange={(c) => onTracesConfigChange('kindColumn', c)}
          onStatusCodeColumnChange={(c) => onTracesConfigChange('statusCodeColumn', c)}
          onStatusMessageColumnChange={(c) => onTracesConfigChange('statusMessageColumn', c)}
          onStateColumnChange={(c) => onTracesConfigChange('stateColumn', c)}
          onInstrumentationLibraryNameColumnChange={(c) => onTracesConfigChange('instrumentationLibraryNameColumn', c)}
          onInstrumentationLibraryVersionColumnChange={(c) =>
            onTracesConfigChange('instrumentationLibraryVersionColumn', c)
          }
          onFlattenNestedChange={(c) => onTracesConfigChange('flattenNested', c)}
          onEventsColumnPrefixChange={(c) => onTracesConfigChange('traceEventsColumnPrefix', c)}
          onLinksColumnPrefixChange={(c) => onTracesConfigChange('traceLinksColumnPrefix', c)}
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
    </>
  );
};
