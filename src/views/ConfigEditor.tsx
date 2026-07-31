import React from 'react';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { config } from '@grafana/runtime';
import { OpenFeature } from '@openfeature/web-sdk';
import { CHConfig, CHSecureConfig } from 'types/config';
import { ConfigEditor as ConfigEditorV1 } from './CHConfigEditor';
import { ConfigEditor as ConfigEditorV2 } from './config-v2/CHConfigEditor';

// Mirrors GRAFANA_CORE_OPEN_FEATURE_DOMAIN from @grafana/runtime/internal, which
// isn't exposed to external plugins via the published exports map.
const GRAFANA_CORE_OPEN_FEATURE_DOMAIN = 'internal-grafana-core';

export type ConfigEditorProps = DataSourcePluginOptionsEditorProps<CHConfig, CHSecureConfig>;

export const ConfigEditor: React.FC<ConfigEditorProps> = (props) => {
  // Grafana only registers an OpenFeature provider from 12.3, so on older
  // versions the flag read falls through to the default. Passing the legacy
  // featureToggles value as the default keeps the ini toggle working pre-12.3
  // while still letting the provider win where one is registered.
  const legacyToggle = Boolean(
    (config.featureToggles as Record<string, boolean | undefined> | undefined)?.['newClickhouseConfigPageDesign']
  );
  const useV2 = OpenFeature.getClient(GRAFANA_CORE_OPEN_FEATURE_DOMAIN).getBooleanValue(
    'newClickhouseConfigPageDesign',
    legacyToggle
  );
  return useV2 ? <ConfigEditorV2 {...props} /> : <ConfigEditorV1 {...props} />;
};
