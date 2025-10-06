import React, { useState } from 'react';
import { DataSourcePluginOptionsEditorProps, onUpdateDatasourceJsonDataOption } from '@grafana/data';
import { Field, Input, Button, useTheme2 } from '@grafana/ui';
import allLabels from '../../labels';
import { CHConfig, CHSecureConfig, Protocol } from 'types/config';
import { css } from '@emotion/css';
import { onHttpHeadersChange } from 'views/CHConfigEditorHooks';
import { HttpHeadersConfigV2 } from './HttpHeadersConfigV2';

export interface HttpProtocolSettingsSectionProps
  extends DataSourcePluginOptionsEditorProps<CHConfig, CHSecureConfig> {
  onSwitchToggle: (
    key: keyof Pick<
      CHConfig,
      'secure' | 'validateSql' | 'enableSecureSocksProxy' | 'forwardGrafanaHeaders' | 'enableRowLimit'
    >,
    value: boolean
  ) => void;
}

export const HttpProtocolSettingsSection = (props: HttpProtocolSettingsSectionProps) => {
  const { options, onOptionsChange, onSwitchToggle } = props;
  const { jsonData, secureJsonFields } = options;
  const labels = allLabels.components.Config.ConfigEditor;

  const [optionalHttpIsOpen, setOptionalHttpIsOpen] = useState(
    Boolean(jsonData.httpHeaders?.length || jsonData.forwardGrafanaHeaders)
  );

  const theme = useTheme2();
  const styles = {
    httpSettingsSection: css({ marginTop: theme.spacing(2) }),
    httpSettingsButton: css({ marginBottom: theme.spacing(2) }),
  };

  return jsonData.protocol === Protocol.Http ? (
    <div className={styles.httpSettingsSection}>
      <Field label={labels.path.label} description={labels.path.tooltip}>
        <Input
          value={jsonData.path ?? '/'}
          name="path"
          onChange={onUpdateDatasourceJsonDataOption(props, 'path')}
          aria-label={labels.path.label}
          placeholder={labels.path.placeholder}
        />
      </Field>
      <Button
        icon={optionalHttpIsOpen ? 'angle-down' : 'angle-right'}
        size="sm"
        variant="secondary"
        onClick={() => setOptionalHttpIsOpen(!optionalHttpIsOpen)}
        className={styles.httpSettingsButton}
      >
        Optional HTTP settings
      </Button>
      {optionalHttpIsOpen && (
        <HttpHeadersConfigV2
          headers={jsonData.httpHeaders}
          forwardGrafanaHeaders={jsonData.forwardGrafanaHeaders}
          secureFields={secureJsonFields}
          onHttpHeadersChange={(headers) =>
            onHttpHeadersChange(headers, options, onOptionsChange)
          }
          onForwardGrafanaHeadersChange={(forward) =>
            onSwitchToggle('forwardGrafanaHeaders', forward)
          }
        />
      )}
    </div>
  ) : null;
};
