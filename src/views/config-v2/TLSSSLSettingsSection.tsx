import { DataSourcePluginOptionsEditorProps } from "@grafana/data";
import { Box, CollapsableSection, CertificationKey, Switch, Text, useStyles2, InlineField } from "@grafana/ui";
import React from "react";
import { CHConfig, CHSecureConfig } from "types/config";
import { CONFIG_SECTION_HEADERS, CONTAINER_MIN_WIDTH } from "./constants";
import allLabels from './labels';
import { css } from "@emotion/css";

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
                label={<Text variant="h3">3. {CONFIG_SECTION_HEADERS[2].label}</Text>}
                isOpen={CONFIG_SECTION_HEADERS[2].isOpen}
            >
                <div className={styles.tlsToggleRow}>
                    <InlineField
                        label={labels.tlsSkipVerify.label}
                        labelWidth={15}
                        className={styles.tlsToggleSwitch}
                    >
                        <Switch
                            value={jsonData.tlsSkipVerify || false}
                            onChange={(e) => onTLSSettingsChange('tlsSkipVerify', e.currentTarget.checked)}
                        />
                    </InlineField>
                    <InlineField
                        label={labels.tlsClientAuth.label}
                        labelWidth={15}
                        className={styles.tlsToggleSwitch}
                    >
                        <Switch
                            value={jsonData.tlsAuth || false}
                            onChange={(e) => onTLSSettingsChange('tlsAuth', e.currentTarget.checked)}
                        />
                    </InlineField>
                    <InlineField
                        label={labels.tlsAuthWithCACert.label}
                        labelWidth={15}
                        className={styles.tlsToggleSwitch}
                    >
                        <Switch
                            value={jsonData.tlsAuthWithCACert || false}
                            onChange={(e) => onTLSSettingsChange('tlsAuthWithCACert', e.currentTarget.checked)}
                        />
                    </InlineField>
                </div>
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
                {jsonData.tlsAuthWithCACert && (
                    <CertificationKey
                        hasCert={!!hasTLSCACert}
                        onChange={(e) => onCertificateChangeFactory('tlsCACert', e.currentTarget.value)}
                        placeholder={labels.tlsCACert.placeholder}
                        label={labels.tlsCACert.label}
                        onClick={() => onResetClickFactory('tlsCACert')}
                    />
                )}
            </CollapsableSection>
        </Box>
    )
};

const getStyles = () => ({
  tlsToggleRow: css({
    display: 'flex',
    // alignItems: 'space-between',
    gap: '50px',
    // marginBottom: '10px',
  }),
  tlsToggleSwitch: css({
    display: 'flex',
    alignItems: 'center',
  }),
});


