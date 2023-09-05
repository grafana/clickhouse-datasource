import React, { useState } from 'react';
import { InlineFormLabel, Input } from '@grafana/ui';
import selectors from 'v4/selectors';

interface LimitEditorProps {
  limit: number;
  onLimitChange: (limit: number) => void;
}

export const LimitEditor = (props: LimitEditorProps) => {
  const [limit, setLimit] = useState<number>(props.limit || 100);
  const { label, tooltip } = selectors.components.LimitEditor;

  return (
    <div className="gf-form">
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <Input
        width={10}
        value={limit}
        type="number"
        min={1}
        onChange={e => setLimit(e.currentTarget.valueAsNumber)}
        onBlur={() => props.onLimitChange(limit)}
      />
    </div>
  );
};
