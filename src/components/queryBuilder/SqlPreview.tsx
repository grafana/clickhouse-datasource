import React from 'react';
import { InlineFormLabel } from '@grafana/ui';
import labels from 'labels';

interface SqlPreviewProps {
  sql: string;
}

export const SqlPreview = (props: SqlPreviewProps) => {
  const { sql } = props;
  const { label, tooltip } = labels.components.SqlPreview;

  return (
    <div>
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <pre>{sql}</pre>
    </div>
  );
};
