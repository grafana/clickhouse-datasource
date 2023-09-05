import React from 'react';
import { InlineFormLabel, Switch as GrafanaSwitch, useTheme } from '@grafana/ui';

interface SwitchProps {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  tooltip: string;
}

export const Switch = (props: SwitchProps) => {
  const { value, onChange, label, tooltip } = props;

  const theme = useTheme();
  const switchContainerStyle: React.CSSProperties = {
    padding: `0 ${theme.spacing.sm}`,
    height: `${theme.spacing.formInputHeight}px`,
    display: 'flex',
    alignItems: 'center',
  };

  return (
    <div className="gf-form">
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <div style={switchContainerStyle}>
        <GrafanaSwitch
          className="gf-form"
          value={value}
          onChange={e => onChange(e.currentTarget.checked)}
        />
      </div>
    </div>
  );
};
