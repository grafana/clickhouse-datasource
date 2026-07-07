import React, { useEffect, useState } from 'react';
import allLabels from 'labels';
import { InlineField, InlineFormLabel, Input } from '@grafana/ui';
import { selectors } from 'selectors';

interface TraceIdInputProps {
  traceId: string;
  onChange: (traceId: string) => void;
  disabled?: boolean;
}

const TraceIdInput = (props: TraceIdInputProps) => {
  const [inputId, setInputId] = useState<string>('');
  const { traceId, onChange, disabled } = props;
  const { label, tooltip } = allLabels.components.TraceQueryBuilder.columns.traceIdFilter;

  useEffect(() => {
    setInputId(traceId);
  }, [traceId]);

  return (
    <InlineField
      label={
        <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
          {label}
        </InlineFormLabel>
      }
      disabled={disabled}
    >
      <Input
        data-testid={selectors.components.QueryBuilder.TraceIdInput.input}
        width={40}
        value={inputId}
        type="string"
        onChange={(e) => setInputId(e.currentTarget.value)}
        onBlur={() => onChange(inputId)}
      />
    </InlineField>
  );
};

export default TraceIdInput;
