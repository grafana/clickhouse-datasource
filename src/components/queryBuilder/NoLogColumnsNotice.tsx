import React from 'react';
import { Alert } from '@grafana/ui';
import { QueryBuilderOptions, QueryType, TableColumn } from 'types/queryBuilder';
import allLabels from 'labels';

/**
 * A logs builder query with no selected columns generates no SQL, so Grafana skips it and the
 * panel shows "No data" with nothing to inspect. This is true once the table schema has loaded
 * and no time, message or level role (or any other column) resolved for it.
 */
export const hasNoLogColumns = (options: QueryBuilderOptions, allColumns: readonly TableColumn[]): boolean =>
  options.queryType === QueryType.Logs && allColumns.length > 0 && !options.columns?.length;

interface NoLogColumnsNoticeProps {
  datasourceUid: string;
  table: string;
}

/** Tells the user why a logs builder query is not running and where to configure the role columns. */
export const NoLogColumnsNotice = ({ datasourceUid, table }: NoLogColumnsNoticeProps) => {
  const labels = allLabels.components.LogsQueryBuilder.noColumnsNotice;
  return (
    <Alert title={labels.title} severity="warning" data-testid="logs-no-columns-notice">
      {labels.text(table)}{' '}
      <a
        style={{ textDecoration: 'underline' }}
        href={`/connections/datasources/edit/${encodeURIComponent(datasourceUid)}#logs-config`}
      >
        {labels.linkText}
      </a>
    </Alert>
  );
};
