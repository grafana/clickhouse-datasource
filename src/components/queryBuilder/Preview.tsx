import React from 'react';
import { InlineFormLabel } from '@grafana/ui';
import { selectors } from './../../selectors';
interface PreviewProps {
  sql: string;
}
export const Preview = (props: PreviewProps) => {
  const { label, tooltip } = selectors.components.QueryEditor.QueryBuilder.PREVIEW;
  return (
    <div className="gf-form">
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <pre>{props.sql}</pre>
    </div>
  );
};
