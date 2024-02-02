import React from 'react';
import { RadioButtonGroup, InlineFormLabel } from '@grafana/ui';
import labels from 'labels';
import { QueryType } from 'types/queryBuilder';

export interface QueryTypeSwitcherProps {
  queryType: QueryType;
  onChange: (queryType: QueryType) => void;
  sqlEditor?: boolean;
};

const options = [
  {
    label: labels.types.QueryType.table,
    value: QueryType.Table,
  },
  {
    label: labels.types.QueryType.logs,
    value: QueryType.Logs,
  },
  {
    label: labels.types.QueryType.timeseries,
    value: QueryType.TimeSeries,
  },
  {
    label: labels.types.QueryType.traces,
    value: QueryType.Traces,
  },
];

/**
 * Component for switching between the different query builder interfaces
 */
export const QueryTypeSwitcher = (props: QueryTypeSwitcherProps) => {
  const { queryType, onChange, sqlEditor } = props;
  const { label, tooltip, sqlTooltip } = labels.components.QueryTypeSwitcher;

  return (
    <span>
      <InlineFormLabel width={8} className="query-keyword" tooltip={sqlEditor ? sqlTooltip : tooltip}>
        {label}
      </InlineFormLabel>
      <RadioButtonGroup options={options} value={queryType} onChange={onChange} />
    </span>
  );
};
