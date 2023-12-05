import React, { useState } from 'react';
import { InlineFormLabel, Input } from '@grafana/ui';
import labels from 'labels';
import { selectors } from 'selectors';

interface LimitEditorProps {
  limit: number;
  onLimitChange: (limit: number) => void;
}

export const LimitEditor = (props: LimitEditorProps) => {
  const [limit, setLimit] = useState<number>(props.limit || 0);
  const { label, tooltip } = labels.components.LimitEditor;

  return (
    <div className="gf-form">
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <Input
        data-testid={selectors.components.QueryBuilder.LimitEditor.input}
        width={10}
        value={limit}
        type="number"
        min={0}
        onChange={e => setLimit(e.currentTarget.valueAsNumber)}
        onBlur={() => props.onLimitChange(limit)}
      />
    </div>
  );
};
