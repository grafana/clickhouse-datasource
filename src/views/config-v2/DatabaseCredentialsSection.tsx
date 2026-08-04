import {
  Box,
  Checkbox,
  CollapsableSection,
  Field,
  Icon,
  Input,
  SecretInput,
  Text,
  TextLink,
  Tooltip,
  useStyles2,
} from '@grafana/ui';
import React, { useEffect, useState } from 'react';
import { CONFIG_SECTION_HEADERS, CONTAINER_MIN_WIDTH } from './constants';
import {
  DataSourcePluginOptionsEditorProps,
  onUpdateDatasourceJsonDataOption,
  onUpdateDatasourceSecureJsonDataOption,
} from '@grafana/data';
import allLabels from './labelsV2';
import { CHConfig, CHSecureConfig } from 'types/config';
import { css } from '@emotion/css';
import {
  trackClickhouseConfigV2DatabaseCredentialsPasswordInput,
  trackClickhouseConfigV2DatabaseCredentialsUserInput,
} from './tracking';
import { ValidationAPI } from '../CHConfigEditorHooks';

export interface Props extends DataSourcePluginOptionsEditorProps<CHConfig, CHSecureConfig> {
  validation?: ValidationAPI;
}

export const DatabaseCredentialsSection = (props: Props) => {
  const { options, onOptionsChange, validation } = props;
  const { jsonData, secureJsonFields } = options;
  const secureJsonData = (options.secureJsonData || {}) as CHSecureConfig;
  const labels = allLabels.components.Config.ConfigEditor;
  const styles = useStyles2(getStyles);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    // Always clear the error eagerly when the user fills in the field,
    // regardless of whether the ValidationAPI is available.
    if (jsonData.username || jsonData.oauthPassThru) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.username;
        return next;
      });
      validation?.clearError('username');
    }
    if (!validation) {
      return;
    }
    return validation.registerValidation(() => {
      const errors: Record<string, string> = {};
      if (!jsonData.username && !jsonData.oauthPassThru) {
        errors.username = labels.username.error;
      }
      setFieldErrors(errors);
      Object.entries(errors).forEach(([field, msg]) => validation.setError(field, msg));
      return Object.keys(errors).length === 0;
    });
  }, [jsonData.username, jsonData.oauthPassThru, validation, labels.username.error]);

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
        label={<Text variant="h3">{CONFIG_SECTION_HEADERS[1].label}</Text>}
        isOpen={!!CONFIG_SECTION_HEADERS[1].isOpen}
      >
        <div className={styles.credentialsSection}>
          <Field
            label={labels.username.label}
            description={
              <>
                {labels.username.tooltip}{' '}
                <TextLink
                  variant="bodySmall"
                  href="https://clickhouse.com/docs/en/operations/settings/permissions-for-queries#readonly"
                  external
                >
                  a read-only user
                </TextLink>
              </>
            }
            required={!jsonData.oauthPassThru}
            invalid={!!fieldErrors.username}
            error={fieldErrors.username}
          >
            <Input
              name="user"
              value={jsonData.username || ''}
              onChange={onUpdateDatasourceJsonDataOption(props, 'username')}
              label={labels.username.label}
              aria-label={labels.username.label}
              placeholder={labels.username.placeholder}
              onBlur={(e) => {
                trackClickhouseConfigV2DatabaseCredentialsUserInput();
                if (!e.currentTarget.value) {
                  setFieldErrors((prev) => ({ ...prev, username: labels.username.error }));
                  validation?.setError('username', labels.username.error);
                }
              }}
            />
          </Field>
          <Field
            label={labels.password.label}
            description={<div className={styles.passwordDescription}>{labels.password.tooltip}</div>}
          >
            <SecretInput
              name="pwd"
              label={labels.password.label}
              aria-label={labels.password.label}
              placeholder={labels.password.placeholder}
              value={secureJsonData.password || ''}
              isConfigured={(secureJsonFields && secureJsonFields.password) as boolean}
              onReset={onResetPassword}
              onChange={onUpdateDatasourceSecureJsonDataOption(props, 'password')}
              onBlur={trackClickhouseConfigV2DatabaseCredentialsPasswordInput}
            />
          </Field>
        </div>
        <Checkbox
          label={labels.oauthPassThru.label}
          description={
            <>
              {'Authenticate using '}
              <TextLink
                variant="bodySmall"
                href="https://clickhouse.com/docs/en/operations/external-authenticators/jwt"
                external
              >
                JWT
              </TextLink>
              {' '}
              <Tooltip content="ClickHouse Cloud only" placement="top">
                <Icon name="info-circle" size="sm" />
              </Tooltip>
              {'. When enabled, credentials are only used for health checks.'}
            </>
          }
          checked={jsonData.oauthPassThru || false}
          onChange={(e) => {
            const checked = e.currentTarget.checked;
            onOptionsChange({
              ...options,
              jsonData: {
                ...jsonData,
                oauthPassThru: checked,
              },
            });
          }}
        />
      </CollapsableSection>
    </Box>
  );
};

const getStyles = () => ({
  passwordDescription: css({
    marginTop: '5px',
  }),
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
