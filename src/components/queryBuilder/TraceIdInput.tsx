import React, { useEffect, useState } from 'react';
import allLabels from 'labels';
import { InlineFormLabel, Input } from '@grafana/ui';

interface TraceIdInputProps {
  traceId: string;
  onChange: (traceId: string) => void;
  disabled?: boolean;
};

const TraceIdInput = (props: TraceIdInputProps) => {
  const [inputId, setInputId] = useState<string>('');
  const { traceId, onChange, disabled } = props;
  const { label, tooltip } = allLabels.components.TraceQueryBuilder.columns.traceIdFilter;

  useEffect(() => {
    if (inputId !== traceId) {
      setInputId(traceId);
    }
  }, [inputId, traceId])

  return (
    <div className="gf-form">
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <Input
        width={40}
        value={inputId}
        disabled={disabled}
        type="string"
        onChange={e => setInputId(e.currentTarget.value)}
        onBlur={() => onChange(inputId)}
      />
    </div>
  )
}

export default TraceIdInput;