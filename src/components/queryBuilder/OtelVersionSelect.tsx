import React, { useEffect } from 'react';
import { SelectableValue } from '@grafana/data';
import { InlineFormLabel, Select, Switch as GrafanaSwitch, useTheme } from '@grafana/ui';
import { versions as allVersions } from 'otel';
import selectors from 'labels';

interface OtelVersionSelectProps {
  enabled: boolean,
  onEnabledChange: (enabled: boolean) => void,
  selectedVersion: string,
  onVersionChange: (version: string) => void,
  defaultToLatest?: boolean,
  wide?: boolean,
}

export const OtelVersionSelect = (props: OtelVersionSelectProps) => {
  const { enabled, onEnabledChange, selectedVersion, onVersionChange, defaultToLatest, wide } = props;
  const { label, tooltip } = selectors.components.OtelVersionSelect;
  const options: SelectableValue[] = allVersions.map(v => ({
    label: `${v.version}${v.name ? (` (${v.name})`) : ''}`,
    value: v.version
  }));

  useEffect(() => {
    if (defaultToLatest && selectedVersion === '') {
      onVersionChange(allVersions[0].version);
    }
  }, [defaultToLatest, selectedVersion, onVersionChange]);

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
