import React, { useEffect, useState } from 'react';
import { InlineField, InlineFormLabel, Input } from '@grafana/ui';
import labels from 'labels';
import { selectors } from 'selectors';

interface LimitEditorProps {
  limit: number;
  onLimitChange: (limit: number) => void;
}

export const LimitEditor = (props: LimitEditorProps) => {
  const [limit, setLimit] = useState<number>(props.limit || 0);
  // The query can change from outside the input (a table or type change, query history, Grafana
  // replacing the query), so follow it rather than keep the value it mounted with.
  useEffect(() => {
    setLimit(props.limit || 0);
  }, [props.limit]);
  const { label, tooltip } = labels.components.LimitEditor;

  return (
    <InlineField
      label={
        <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
          {label}
        </InlineFormLabel>
      }
    >
      <Input
        data-testid={selectors.components.QueryBuilder.LimitEditor.input}
        width={10}
        value={limit}
        type="number"
        min={0}
        onChange={(e) => setLimit(e.currentTarget.valueAsNumber)}
        onBlur={() => props.onLimitChange(limit)}
      />
    </InlineField>
  );
};
