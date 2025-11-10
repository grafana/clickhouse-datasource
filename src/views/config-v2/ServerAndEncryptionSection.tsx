import React from 'react';
import {
  DataSourcePluginOptionsEditorProps,
  GrafanaTheme2,
  onUpdateDatasourceJsonDataOption,
  onUpdateDatasourceJsonDataOptionChecked,
} from '@grafana/data';
import {
  Box,
  CollapsableSection,
  TextLink,
  Field,
  Input,
  Toggletip,
  IconButton,
  RadioButtonGroup,
  Text,
  useStyles2,
  Checkbox,
} from '@grafana/ui';
import allLabels from './labelsV2';
import { CHConfig, CHSecureConfig, Protocol } from 'types/config';
import { CONFIG_SECTION_HEADERS, CONTAINER_MIN_WIDTH, PROTOCOL_OPTIONS } from './constants';
import { css } from '@emotion/css';
import {
  trackClickhouseConfigV2HostInput,
  trackClickhouseConfigV2NativeHttpToggleClicked,
  trackClickhouseConfigV2PortInput,
  trackClickhouseConfigV2SecureConnectionChecked,
} from './tracking';
import { HttpProtocolSettingsSection } from './HttpProtocolSettingsSection';

export interface Props extends DataSourcePluginOptionsEditorProps<CHConfig, CHSecureConfig> {}

export const ServerAndEncryptionSection = (props: Props) => {
  const { options, onOptionsChange } = props;
  const { jsonData } = options;
  const labels = allLabels.components.Config.ConfigEditor;
  const defaultPort = jsonData.secure
    ? jsonData.protocol === Protocol.Native
      ? labels.serverPort.secureNativePort
      : labels.serverPort.secureHttpPort
    : jsonData.protocol === Protocol.Native
      ? labels.serverPort.insecureNativePort
      : labels.serverPort.insecureHttpPort;
  const portDescription = `${labels.serverPort.tooltip} (default for ${jsonData.secure ? 'secure' : ''} ${jsonData.protocol}: ${defaultPort})`;
  const styles = useStyles2(getStyles);

  const onProtocolToggle = (protocol: Protocol) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...options.jsonData,
        protocol: protocol,
      },
    });
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

  return (
    <Box
      borderStyle="solid"
      borderColor="weak"
      padding={2}
      marginBottom={4}
      id={`${CONFIG_SECTION_HEADERS[0].id}`}
      minWidth={CONTAINER_MIN_WIDTH}
    >
      <CollapsableSection
        label={<Text variant="h3">{CONFIG_SECTION_HEADERS[0].label}</Text>}
        isOpen={!!CONFIG_SECTION_HEADERS[0].isOpen}
      >
        <Text variant="body" color="secondary">
          Enter the server address of your ClickHouse instance. Then select your protocol, port and security options. If
          you need further guidance, visit the{' '}
          <TextLink
            href="https://grafana.com/grafana/plugins/grafana-clickhouse-datasource/"
            icon="external-link-alt"
            external
          >
            Grafana docs
          </TextLink>
        </Text>
        <Field required label={labels.serverAddress.label} style={{ marginTop: '30px' }}>
          <Input
            name="host"
            value={jsonData.host || ''}
            onChange={(e) => onUpdateDatasourceJsonDataOption(props, 'host')(e)}
            label={labels.serverAddress.label}
            aria-label={labels.serverAddress.label}
            data-testid="clickhouse-v2-config-host-input"
            placeholder={labels.serverAddress.placeholder}
            onBlur={trackClickhouseConfigV2HostInput}
          />
        </Field>
        <div className={styles.protocolPortRow}>
          <div className={styles.protocolSection}>
            <div className={styles.protocolLabel}>
              <Text variant="bodySmall" weight="bold">
                {labels.protocol.label}
              </Text>
              <Toggletip
                theme="info"
                placement="top"
                content={
                  <div className={styles.toggleTipText}>
                    <Text>
                      ClickHouse supports two server protocols: Native TCP and HTTP. Both protocols can be secured with
                      TLS.
                      <br />
                      <br />
                      <TextLink href="https://clickhouse.com/docs/interfaces/tcp" variant="bodySmall" external>
                        Native TCP
                      </TextLink>{' '}
                      is the default and recommended option.
                      <br />
                      <TextLink href="https://clickhouse.com/docs/interfaces/http" variant="bodySmall" external>
                        HTTP
                      </TextLink>{' '}
                      is for servers configured to accept HTTP connections.
                    </Text>
                  </div>
                }
              >
                <IconButton
                  name="question-circle"
                  aria-label="More info about Protocol"
                  size="xs"
                  className={styles.toggleTipIcon}
                />
              </Toggletip>
            </div>
            <Field label="" description={<div className={styles.toggleTipText}>{labels.protocol.tooltip}</div>}>
              <RadioButtonGroup<Protocol>
                options={PROTOCOL_OPTIONS}
                value={jsonData.protocol || Protocol.Native}
                onChange={(e) => {
                  trackClickhouseConfigV2NativeHttpToggleClicked({ nativeHttpToggle: e });
                  onProtocolToggle(e!);
                }}
              />
            </Field>
          </div>
          <div className={styles.portSection}>
            <Field required label={labels.serverPort.label} description={portDescription}>
              <Input
                name="port"
                type="number"
                value={jsonData.port || ''}
                onChange={(e) => onPortChange(e.currentTarget.value)}
                label={labels.serverPort.label}
                aria-label={labels.serverPort.label}
                data-testid="clickhouse-v2-config-port-input"
                placeholder={labels.serverPort.placeholder}
                onBlur={(e) => trackClickhouseConfigV2PortInput({ port: e.currentTarget.value })}
              />
            </Field>
          </div>
        </div>
        <div className={styles.secureToggle}>
          <Checkbox
            label={labels.secure.label}
            description={labels.secure.tooltip}
            checked={jsonData.secure || false}
            onChange={(e) => {
              trackClickhouseConfigV2SecureConnectionChecked({ secureConnection: e.currentTarget.checked });
              onUpdateDatasourceJsonDataOptionChecked(props, 'secure')(e);
            }}
          />
        </div>
        <HttpProtocolSettingsSection {...props} />
      </CollapsableSection>
    </Box>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  protocolPortRow: css({
    display: 'flex',
    alignItems: 'center',
  }),
  protocolLabel: css({
    display: 'flex',
    height: 15,
    width: '205px',
  }),
  protocolSection: css({
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: theme.spacing(0),
    marginRight: theme.spacing(5),
  }),
  toggleTipIcon: css({
    marginLeft: theme.spacing(0.5),
    padding: 0,
  }),
  portSection: css({
    width: '100%',
  }),
  toggleTipText: css({
    whiteSpace: 'pre-line',
  }),
  secureToggle: css({
    display: 'flex',
    alignItems: 'center',
    marginTop: theme.spacing(1),
  }),
});
