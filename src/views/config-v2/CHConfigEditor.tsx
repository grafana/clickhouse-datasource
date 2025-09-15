import React from 'react';
import {
  Box,
  CollapsableSection,
  Field,
  IconButton,
  Input,
  RadioButtonGroup,
  Text,
  TextLink,
  Toggletip,
  useTheme2,
} from '@grafana/ui';
import { CONFIG_SECTION_HEADERS, CONTAINER_MIN_WIDTH, PROTOCOL_OPTIONS } from './constants';
import allLabels from './labels';
import { DataSourcePluginOptionsEditorProps, onUpdateDatasourceJsonDataOption } from '@grafana/data';
import { CHConfig, CHSecureConfig, Protocol } from 'types/config';
import { css } from '@emotion/css';

export interface ConfigEditorProps extends DataSourcePluginOptionsEditorProps<CHConfig, CHSecureConfig> {}

export const ConfigEditor: React.FC<ConfigEditorProps> = (props) => {
  const { options, onOptionsChange } = props;
  const { jsonData, secureJsonFields } = options;
  const secureJsonData = (options.secureJsonData || {}) as CHSecureConfig;
  const labels = allLabels.components.Config.ConfigEditor;
  const defaultPort = jsonData.secure
    ? jsonData.protocol === Protocol.Native
      ? labels.serverPort.secureNativePort
      : labels.serverPort.secureHttpPort
    : jsonData.protocol === Protocol.Native
      ? labels.serverPort.insecureNativePort
      : labels.serverPort.insecureHttpPort;
  const portDescription = `${labels.serverPort.tooltip} (default for ${jsonData.secure ? 'secure' : ''} ${jsonData.protocol}: ${defaultPort})`;

  const theme = useTheme2();
  const styles = {
    protocolPortRow: css({
      display: 'flex',
      alignItems: 'center',
    }),
    protocolLabel: css({
      display: 'flex',
      height: 15,
    }),
    protocolSection: css({
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: theme.spacing(0),
      marginRight: theme.spacing(10),
      width: '250px',
    }),
    toggletipIcon: css({
      marginLeft: theme.spacing(0.5),
      padding: 0,
    }),
    portSection: css({
      width: '100%',
    }),
    toggleTipText: css({
      whiteSpace: 'pre-line',
    }),
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
    <>
      <div style={{ marginBottom: '10px' }}>
        <Text variant="bodySmall" color="secondary">
          Fields marked with * are required
        </Text>
      </div>
      <Box
        borderStyle="solid"
        borderColor="weak"
        padding={2}
        marginBottom={4}
        id={`${CONFIG_SECTION_HEADERS[0].id}`}
        minWidth={CONTAINER_MIN_WIDTH}
      >
        <CollapsableSection
          label={<Text variant="h3">1. {CONFIG_SECTION_HEADERS[0].label}</Text>}
          isOpen={CONFIG_SECTION_HEADERS[0].isOpen}
        >
          <Text variant="body" color="secondary">
            Enter the server address of your Clickhouse instance. Then select your protocol, port and security options.
            If you need further guidance, visit the{' '}
            <TextLink
              href="https://grafana.com/grafana/plugins/grafana-clickhouse-datasource/"
              icon="external-link-alt"
            >
              Grafana docs
            </TextLink>
          </Text>
          <Field required label={labels.serverAddress.label} style={{ marginTop: '20px' }}>
            <Input
              name="host"
              value={jsonData.host || ''}
              onChange={(e) => {
                // trackingV1.trackClickhouseConfigV1HostInput();
                return onUpdateDatasourceJsonDataOption(props, 'host')(e);
              }}
              label={labels.serverAddress.label}
              aria-label={labels.serverAddress.label}
              placeholder={labels.serverAddress.placeholder}
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
                        ClickHouse supports two server protocols: Native TCP and HTTP. Both protocols can be secured
                        with TLS.
                        <br />
                        <br />
                        <TextLink href="https://clickhouse.com/docs/interfaces/tcp" variant="bodySmall">
                          Native TCP
                        </TextLink>{' '}
                        is the default and recommended option.
                        <br />
                        <TextLink href="https://clickhouse.com/docs/interfaces/http" variant="bodySmall">
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
                    className={styles.toggletipIcon}
                  />
                </Toggletip>
              </div>
              <Field label=" " description={<div className={styles.toggleTipText}>{labels.protocol.description}</div>}>
                <RadioButtonGroup<Protocol>
                  options={PROTOCOL_OPTIONS}
                  value={jsonData.protocol || Protocol.Native}
                  onChange={(e) => onProtocolToggle(e!)}
                />
              </Field>
            </div>
            <div className={styles.portSection}>
              <Field required label={labels.serverPort.label} description={portDescription}>
                <Input
                  name="port"
                  type="number"
                  value={jsonData.port || ''}
                  onChange={(e) => {
                    // trackingV1.trackClickhouseConfigV1PortInput({ port: e.currentTarget.value });
                    onPortChange(e.currentTarget.value);
                  }}
                  label={labels.serverPort.label}
                  aria-label={labels.serverPort.label}
                  placeholder={defaultPort}
                />
              </Field>
            </div>
          </div>
        </CollapsableSection>
      </Box>
    </>
  );
};
