import React, { useState } from 'react';
import { Input } from '@grafana/ui';
import { selectors } from './../../selectors';
import { EditorField } from '@grafana/experimental';

interface LimitEditorProps {
  limit: number;
  onLimitChange: (limit: number) => void;
}
export const LimitEditor = (props: LimitEditorProps) => {
  const [limit, setLimit] = useState(props.limit || 10);
  const { label, tooltip } = selectors.components.QueryEditor.QueryBuilder.LIMIT;
  return (
    <EditorField tooltip={tooltip} label={label}>
      <Input
        width={10}
        value={limit}
        type="number"
        min={1}
        onChange={(e) => setLimit(e.currentTarget.valueAsNumber)}
        onBlur={() => props.onLimitChange(limit)}
      />
    </EditorField>
  );
};
