import React from 'react';
import { DataSourcePluginOptionsEditorProps, GrafanaTheme2 } from '@grafana/data';
import { Alert, Box, Stack, Text, TextLink, useStyles2 } from '@grafana/ui';
import { CHConfig, CHSecureConfig } from 'types/config';
import { ServerAndEncryptionSection } from './ServerAndEncryptionSection';
import { css } from '@emotion/css';
import { LeftSidebar } from './LeftSidebar';
import { CONTAINER_MIN_WIDTH } from './constants';
import { trackInfluxDBConfigV2FeedbackButtonClicked } from './tracking';
import { AdditionalSettingsSection } from './AdditionalSettingsSection';
import { DatabaseCredentialsSection } from './DatabaseCredentialsSection';
import { TLSSSLSettingsSection } from './TLSSSLSettingsSection';

export interface ConfigEditorProps extends DataSourcePluginOptionsEditorProps<CHConfig, CHSecureConfig> {}

export const ConfigEditor: React.FC<ConfigEditorProps> = (props) => {
  const { options, onOptionsChange } = props;
  const styles = useStyles2(getStyles);

  return (
    <Stack justifyContent="space-between">
      <div className={`${styles.hideOnSmallScreen} ${styles.leftSticky}`}>
        <Box width="100%" flex="1 1 auto">
          <LeftSidebar pdcInjected={Boolean(options?.jsonData?.pdcInjected)} />
        </Box>
      </div>
      <Box width="60%" flex="1 1 auto" minWidth={CONTAINER_MIN_WIDTH}>
        <div className={styles.requiredFields}>
          <Alert
            severity="info"
            title="You are viewing a new design for the ClickHouse configuration settings."
            className={styles.alertHeight}
          >
            <>
              <TextLink
                href="https://docs.google.com/forms/d/e/1FAIpQLSd5YOYxfW-CU0tQnfFA08fkymGlmZ8XcFRMniE5lScIsmdt5w/viewform"
                external
                onClick={trackInfluxDBConfigV2FeedbackButtonClicked}
              >
                Share your thoughts
              </TextLink>{' '}
              to help us make it even better.
            </>
          </Alert>
          <Text variant="bodySmall" color="secondary">
            Fields marked with * are required
          </Text>
        </div>
        <ServerAndEncryptionSection onOptionsChange={onOptionsChange} options={options} />
        <DatabaseCredentialsSection onOptionsChange={onOptionsChange} options={options} />
        <TLSSSLSettingsSection onOptionsChange={onOptionsChange} options={options} />
        <AdditionalSettingsSection onOptionsChange={onOptionsChange} options={options} />
      </Box>
      <Box width="20%" flex="0 0 20%">
        {/* TODO: Right sidebar */}
      </Box>
    </Stack>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  hideOnSmallScreen: css({
    width: '250px',
    flex: '0 0 250px',
    [theme.breakpoints.down('sm')]: {
      display: 'none',
    },
  }),
  leftSticky: css({
    position: 'sticky',
    top: '100px',
    alignSelf: 'flex-start',
    maxHeight: 'calc(100vh - 100px)',
    overflow: 'hidden',
  }),
  requiredFields: css({
    marginBottom: theme.spacing(2),
  }),
  alertHeight: css({
    height: '100px',
  }),
});
