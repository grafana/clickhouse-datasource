import React from 'react';
import { InlineFieldRow, Input, InlineFormLabel } from '@grafana/ui';
import { styles } from 'styles';

interface LabeledInputProps {
  label: string;
  tooltip?: string;
  placeholder?: string;
  disabled?: boolean;
  value: string;
  onChange: (value: string) => void;
}

export function LabeledInput(props: LabeledInputProps) {
  const { label, tooltip, placeholder, disabled, value, onChange } = props;

  return (
    <InlineFieldRow className={styles.Common.formRow}>
      <InlineFormLabel width={12} className="query-keyword" tooltip={tooltip || label}>
        {label}
      </InlineFormLabel>
      <Input
        disabled={disabled}
        width={30}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
      />
    </InlineFieldRow>
  );
}
