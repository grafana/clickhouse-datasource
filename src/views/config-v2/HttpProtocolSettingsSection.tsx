import React, { useState } from 'react';
import { DataSourcePluginOptionsEditorProps, onUpdateDatasourceJsonDataOption } from '@grafana/data';
import { Field, Input, Button, useTheme2 } from '@grafana/ui';
import allLabels from './labelsV2';
import { CHConfig, CHSecureConfig, Protocol } from 'types/config';
import { css } from '@emotion/css';
import { onHttpHeadersChange } from 'views/CHConfigEditorHooks';
import { HttpHeadersConfigV2 } from './HttpHeadersConfigV2';

export interface HttpProtocolSettingsSectionProps
  extends DataSourcePluginOptionsEditorProps<CHConfig, CHSecureConfig> {}

export const HttpProtocolSettingsSection = (props: HttpProtocolSettingsSectionProps) => {
  const { options, onOptionsChange } = props;
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
          options={options}
          onOptionsChange={onOptionsChange}
          headers={jsonData.httpHeaders}
          forwardGrafanaHeaders={jsonData.forwardGrafanaHeaders}
          secureFields={secureJsonFields}
          onHttpHeadersChange={(headers) => onHttpHeadersChange(headers, options, onOptionsChange)}
        />
      )}
    </div>
  ) : null;
};
