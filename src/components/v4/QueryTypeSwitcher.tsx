import React, { useEffect } from 'react';
import { RadioButtonGroup, InlineFormLabel } from '@grafana/ui';
import selectors from '../../v4/selectors';
import { QueryType } from 'types/queryBuilder';

export interface QueryTypeSwitcherProps {
  queryType: QueryType;
  onChange: (queryType: QueryType) => void;
};

const options = [
  {
    label: selectors.types.QueryType.table,
    value: QueryType.Table,
  },
  {
    label: selectors.types.QueryType.logs,
    value: QueryType.Logs,
  },
  {
    label: selectors.types.QueryType.timeSeries,
    value: QueryType.TimeSeries,
  },
  {
    label: selectors.types.QueryType.traces,
    value: QueryType.Traces,
  },
];

/**
 * Component for switching between the different query builder interfaces
 */
export const QueryTypeSwitcher = (props: QueryTypeSwitcherProps) => {
  const { queryType, onChange } = props;
  const { label, tooltip } = selectors.components.QueryTypeSwitcher;

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
