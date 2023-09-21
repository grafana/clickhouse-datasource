import React from 'react';
import { selectors } from './../../selectors';
import { EditorField, EditorRow } from '@grafana/experimental';
interface PreviewProps {
  sql: string;
}
export const Preview = (props: PreviewProps) => {
  const { label, tooltip } = selectors.components.QueryEditor.QueryBuilder.PREVIEW;
  return (
    <EditorRow>
      <EditorField tooltip={tooltip} label={label}>
        <pre>{props.sql !== '' ? props.sql : 'Query SQL will show here'}</pre>
      </EditorField>
    </EditorRow>
  );
};
