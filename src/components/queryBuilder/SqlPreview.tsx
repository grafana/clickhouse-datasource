import React from 'react';
import { EditorField, EditorRow } from '@grafana/experimental';
import labels from 'labels';

interface SqlPreviewProps {
  sql: string;
}

export const SqlPreview = (props: SqlPreviewProps) => {
  const { sql } = props;
  const { label, tooltip } = labels.components.SqlPreview;

  return (
    <EditorRow>
      <EditorField tooltip={tooltip} label={label}>
        <pre>{sql}</pre>
      </EditorField>
    </EditorRow>
  );
};
