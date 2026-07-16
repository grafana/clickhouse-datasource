import React from 'react';
import { InlineField, Input, InlineFormLabel } from '@grafana/ui';

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
    <InlineField
      label={
        <InlineFormLabel width={12} className="query-keyword" tooltip={tooltip || label}>
          {label}
        </InlineFormLabel>
      }
      disabled={disabled}
    >
      <Input width={30} value={value} onChange={(e) => onChange(e.currentTarget.value)} placeholder={placeholder} />
    </InlineField>
  );
}
