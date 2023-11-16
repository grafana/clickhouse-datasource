import React, { useState } from 'react';
import labels from 'labels';
import { selectors } from 'selectors';
import { Input } from '@grafana/ui';
import { EditorField } from '@grafana/experimental';

interface LimitEditorProps {
  limit: number;
  onLimitChange: (limit: number) => void;
}

export const LimitEditor = (props: LimitEditorProps) => {
  const [limit, setLimit] = useState<number>(props.limit || 1000);
  const { label, tooltip } = labels.components.LimitEditor;

  return (
    <EditorField tooltip={tooltip} label={label}>
      <Input
        data-testid={selectors.components.QueryBuilder.LimitEditor.input}
        width={10}
        value={limit}
        type="number"
        min={1}
        onChange={e => setLimit(e.currentTarget.valueAsNumber)}
        onBlur={() => props.onLimitChange(limit)}
      />
    </EditorField>
  );
};
