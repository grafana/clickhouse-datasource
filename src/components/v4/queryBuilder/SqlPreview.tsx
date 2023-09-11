import React from 'react';
import { InlineFormLabel } from '@grafana/ui';
import selectors from 'v4/selectors';

interface SqlPreviewProps {
  sql: string;
}

export const SqlPreview = (props: SqlPreviewProps) => {
  const { sql } = props;
  const { label, tooltip } = selectors.components.SqlPreview;

  return (
    <div className="gf-form">
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <pre>{sql}</pre>
    </div>
  );
};
