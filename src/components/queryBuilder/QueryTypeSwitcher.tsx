import React, { useEffect } from 'react';
import { RadioButtonGroup, InlineFormLabel } from '@grafana/ui';
import labels from 'labels';
import { QueryType } from 'types/queryBuilder';

export interface QueryTypeSwitcherProps {
  queryType: QueryType;
  onChange: (queryType: QueryType) => void;
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
  const { queryType, onChange } = props;
  const { label, tooltip } = labels.components.QueryTypeSwitcher;

  useEffect(() => {
    if (!queryType) {
      onChange(QueryType.Table);
    }
  }, [queryType, onChange]);

  return (
    <span>
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <RadioButtonGroup options={options} value={queryType} onChange={v => onChange(v)} />
    </span>
  );
};
