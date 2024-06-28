import React, { useEffect } from 'react';
import { SelectableValue } from '@grafana/data';
import { InlineFormLabel, Select, Switch as GrafanaSwitch, useTheme } from '@grafana/ui';
import otel from 'otel';
import selectors from 'labels';

interface OtelVersionSelectProps {
  enabled: boolean,
  onEnabledChange: (enabled: boolean) => void,
  selectedVersion: string,
  onVersionChange: (version: string) => void,
  wide?: boolean,
}

export const OtelVersionSelect = (props: OtelVersionSelectProps) => {
  const { enabled, onEnabledChange, selectedVersion, onVersionChange, wide } = props;
  const { label, tooltip } = selectors.components.OtelVersionSelect;
  const options: SelectableValue[] = otel.versions.map(v => ({
    label: v.name,
    value: v.version
  }));

  useEffect(() => {
    // Use latest version if not set or doesn't exist (which may happen if config is broken)
    if (selectedVersion === '' || !otel.getVersion(selectedVersion)) {
      onVersionChange(otel.getLatestVersion().version);
    }
  }, [selectedVersion, onVersionChange]);

  const theme = useTheme();
  const switchContainerStyle: React.CSSProperties = {
    padding: `0 ${theme.spacing.sm}`,
    height: `${theme.spacing.formInputHeight}px`,
    display: 'flex',
    alignItems: 'center',
  };

  return (
    <div className="gf-form">
      <InlineFormLabel width={wide ? 12 : 8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <div style={switchContainerStyle}>
        <GrafanaSwitch
          className="gf-form"
          value={enabled}
          onChange={e => onEnabledChange(e.currentTarget.checked)}
          role="checkbox"
        />
      </div>
      <Select
        disabled={!enabled}
        options={options}
        width={20}
        onChange={e => onVersionChange(e.value)}
        value={selectedVersion}
        menuPlacement={'bottom'}
      />
    </div>
  );
};
