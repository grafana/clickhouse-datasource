import React from 'react';
import { InlineFormLabel, Switch as GrafanaSwitch, useTheme } from '@grafana/ui';
import { styles } from 'styles';

interface SwitchProps {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  tooltip: string;
  disabled?: boolean;
  inline?: boolean;
  wide?: boolean;
}

export const Switch = (props: SwitchProps) => {
  const { value, onChange, label, tooltip, disabled, inline, wide } = props;

  const theme = useTheme();
  const switchContainerStyle: React.CSSProperties = {
    padding: `0 ${theme.spacing.sm}`,
    height: `${theme.spacing.formInputHeight}px`,
    display: 'flex',
    alignItems: 'center',
  };

  const labelStyle = 'query-keyword ' + (inline ? styles.QueryEditor.inlineField : '');

  return (
    <div className="gf-form">
      <InlineFormLabel width={wide ? 12 : 8} className={labelStyle} tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <div style={switchContainerStyle}>
        <GrafanaSwitch
          disabled={disabled}
          className="gf-form"
          value={value}
          onChange={(e) => onChange(e.currentTarget.checked)}
        />
      </div>
    </div>
  );
};
