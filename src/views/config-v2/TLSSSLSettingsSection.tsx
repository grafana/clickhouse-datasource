import { DataSourcePluginOptionsEditorProps, onUpdateDatasourceJsonDataOptionChecked } from '@grafana/data';
import { Box, CollapsableSection, CertificationKey, Text, useStyles2, Checkbox, Stack, Badge } from '@grafana/ui';
import React from 'react';
import { CHConfig, CHSecureConfig } from 'types/config';
import { CONFIG_SECTION_HEADERS, CONTAINER_MIN_WIDTH } from './constants';
import allLabels from './labelsV2';
import { css } from '@emotion/css';
import {
  trackClickhouseConfigV2SkipTLSVerifyToggleClicked,
  trackClickhouseConfigV2TLSClientAuthToggleClicked,
  trackClickhouseConfigV2WithCACertToggleClicked,
} from './tracking';

export interface Props extends DataSourcePluginOptionsEditorProps<CHConfig, CHSecureConfig> {}

export const TLSSSLSettingsSection = (props: Props) => {
  const { options, onOptionsChange } = props;
  const { jsonData, secureJsonFields } = options;
  const secureJsonData = (options.secureJsonData || {}) as CHSecureConfig;
  const labels = allLabels.components.Config.ConfigEditor;
  const hasTLSCACert = secureJsonFields && secureJsonFields.tlsCACert;
  const hasTLSClientCert = secureJsonFields && secureJsonFields.tlsClientCert;
  const hasTLSClientKey = secureJsonFields && secureJsonFields.tlsClientKey;
  const styles = useStyles2(getStyles);

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

  return (
    <Box
      borderStyle="solid"
      borderColor="weak"
      padding={2}
      marginBottom={4}
      id={`${CONFIG_SECTION_HEADERS[2].id}`}
      minWidth={CONTAINER_MIN_WIDTH}
    >
      <CollapsableSection
        label={
          <>
            <Text variant="h3">{CONFIG_SECTION_HEADERS[2].label}</Text>
            <Badge text="optional" color="darkgrey" className={styles.badge} />
          </>
        }
        isOpen={!!(jsonData.tlsSkipVerify || jsonData.tlsAuth || jsonData.tlsAuthWithCACert)}
      >
        <Text variant="body" color="secondary">
          TLS/SSL certificates are used to prove identity and encrypt traffic between Grafana and ClickHouse.
        </Text>
        <div className={styles.contentSection}>
          <Stack
            direction={jsonData.tlsAuth || jsonData.tlsAuthWithCACert ? 'column' : 'row'}
            gap={3}
            alignItems="flex-start"
          >
            <Checkbox
              className={css({ margin: 0 })}
              label={labels.tlsSkipVerify.label}
              value={jsonData.tlsSkipVerify || false}
              onChange={(e) => {
                trackClickhouseConfigV2SkipTLSVerifyToggleClicked({ skipTlsVerifyToggle: e.currentTarget.checked });
                onUpdateDatasourceJsonDataOptionChecked(props, 'tlsSkipVerify')(e);
              }}
            />
            <Checkbox
              className={css({ margin: 0 })}
              label={labels.tlsClientAuth.label}
              value={jsonData.tlsAuth || false}
              onChange={(e) => {
                trackClickhouseConfigV2TLSClientAuthToggleClicked({ clientAuthToggle: e.currentTarget.checked });
                onUpdateDatasourceJsonDataOptionChecked(props, 'tlsAuth')(e);
              }}
            />
            {jsonData.tlsAuth && (
              <div className={styles.certsSection}>
                <CertificationKey
                  hasCert={!!hasTLSClientCert}
                  onChange={(e) => onCertificateChangeFactory('tlsClientCert', e.currentTarget.value)}
                  placeholder={labels.tlsClientCert.placeholder}
                  label={labels.tlsClientCert.label}
                  onClick={() => onResetClickFactory('tlsClientCert')}
                  data-testid="tls-client-cert"
                />
                <CertificationKey
                  hasCert={!!hasTLSClientKey}
                  placeholder={labels.tlsClientKey.placeholder}
                  label={labels.tlsClientKey.label}
                  onChange={(e) => onCertificateChangeFactory('tlsClientKey', e.currentTarget.value)}
                  onClick={() => onResetClickFactory('tlsClientKey')}
                  data-testid="tls-client-key"
                />
              </div>
            )}
            <Checkbox
              label={labels.tlsAuthWithCACert.label}
              value={jsonData.tlsAuthWithCACert || false}
              onChange={(e) => {
                trackClickhouseConfigV2WithCACertToggleClicked({ caCertToggle: e.currentTarget.checked });
                onUpdateDatasourceJsonDataOptionChecked(props, 'tlsAuthWithCACert')(e);
              }}
            />
            <div className={styles.certsSection}>
              {jsonData.tlsAuthWithCACert && (
                <CertificationKey
                  hasCert={!!hasTLSCACert}
                  onChange={(e) => onCertificateChangeFactory('tlsCACert', e.currentTarget.value)}
                  placeholder={labels.tlsCACert.placeholder}
                  label={labels.tlsCACert.label}
                  onClick={() => onResetClickFactory('tlsCACert')}
                  data-testid="tls-ca-cert"
                />
              )}
            </div>
          </Stack>
        </div>
      </CollapsableSection>
    </Box>
  );
};

const getStyles = () => ({
  contentSection: css({
    marginTop: '30px',
  }),
  optionsRow: css({
    display: 'flex',
    gap: '50px',
  }),
  certsSection: css({
    marginTop: '10px',
  }),
  badge: css({
    marginLeft: 'auto',
  }),
});
