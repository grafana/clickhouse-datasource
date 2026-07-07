import React from 'react';
import { RadioButtonGroup, InlineFieldRow, InlineFormLabel } from '@grafana/ui';
import { styles } from 'styles';

export interface ModeSwitchProps {
  labelA: string;
  labelB: string;
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  tooltip: string;
}

/**
 * Component for switching between modes. Boxes are labeled unlike regular Switch.
 */
export const ModeSwitch = (props: ModeSwitchProps) => {
  const { labelA, labelB, value, onChange, label, tooltip } = props;

  const options = [
    {
      label: labelA,
      value: false,
    },
    {
      label: labelB,
      value: true,
    },
  ];

  return (
    <InlineFieldRow className={styles.Common.formRow}>
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <RadioButtonGroup<boolean> options={options} value={value} onChange={(v) => onChange(v)} />
    </InlineFieldRow>
  );
};
