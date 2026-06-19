import React from 'react';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { OpenFeature } from '@openfeature/web-sdk';
import { CHConfig, CHSecureConfig } from 'types/config';
import { ConfigEditor as ConfigEditorV1 } from './CHConfigEditor';
import { ConfigEditor as ConfigEditorV2 } from './config-v2/CHConfigEditor';

// Mirrors GRAFANA_CORE_OPEN_FEATURE_DOMAIN from @grafana/runtime/internal, which
// isn't exposed to external plugins via the published exports map.
const GRAFANA_CORE_OPEN_FEATURE_DOMAIN = 'internal-grafana-core';

export type ConfigEditorProps = DataSourcePluginOptionsEditorProps<CHConfig, CHSecureConfig>;

export const ConfigEditor: React.FC<ConfigEditorProps> = (props) => {
  const useV2 = OpenFeature.getClient(GRAFANA_CORE_OPEN_FEATURE_DOMAIN).getBooleanValue(
    'newClickhouseConfigPageDesign',
    false
  );
  return useV2 ? <ConfigEditorV2 {...props} /> : <ConfigEditorV1 {...props} />;
};
