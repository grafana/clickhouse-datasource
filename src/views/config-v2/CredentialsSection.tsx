import { Box, CollapsableSection, Field, Input, SecretInput, Text, useStyles2 } from "@grafana/ui";
import React from "react";
import { CONFIG_SECTION_HEADERS, CONTAINER_MIN_WIDTH } from "./constants";
import { DataSourcePluginOptionsEditorProps, onUpdateDatasourceJsonDataOption, onUpdateDatasourceSecureJsonDataOption } from "@grafana/data";
import allLabels from './labels';
import { CHConfig, CHSecureConfig } from "types/config";
import { css } from "@emotion/css";

export interface Props extends DataSourcePluginOptionsEditorProps<CHConfig, CHSecureConfig> {}

export const CredentialsSection = (props: Props) => {
    const { options, onOptionsChange } = props;
    const { jsonData, secureJsonFields } = options;
    const secureJsonData = (options.secureJsonData || {}) as CHSecureConfig;
    const labels = allLabels.components.Config.ConfigEditor;
    const styles = useStyles2(getStyles);

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

    return (
        <Box
            borderStyle="solid"
            borderColor="weak"
            padding={2}
            marginBottom={4}
            id={`${CONFIG_SECTION_HEADERS[1].id}`}
            minWidth={CONTAINER_MIN_WIDTH}
        >
        <CollapsableSection
          label={<Text variant="h3">2. {CONFIG_SECTION_HEADERS[1].label}</Text>}
          isOpen={CONFIG_SECTION_HEADERS[1].isOpen}
          className={styles.credentialsSection}
        >
            <div className={styles.credentialsSection}>
                <Field
                    label={labels.username.label}
                    description={labels.username.tooltip}
                    required
                >
                <Input
                    name="user"
                    // width={40}
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
                    // width={40}
                    label={labels.password.label}
                    aria-label={labels.password.label}
                    placeholder={labels.password.placeholder}
                    value={secureJsonData.password || ''}
                    isConfigured={(secureJsonFields && secureJsonFields.password) as boolean}
                    onReset={onResetPassword}
                    onChange={onUpdateDatasourceSecureJsonDataOption(props, 'password')}
                />
                </Field>
            </div>
        </CollapsableSection>
      </Box>
    );
};

const getStyles = () => ({
  credentialsSection: css({
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',

    '& > div': {
      flex: '1 1 300px',
      minWidth: 0,
    },
  }),
});
