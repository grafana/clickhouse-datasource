import React from 'react';
import { SelectableValue } from '@grafana/data';
import { InlineFormLabel, Select } from '@grafana/ui';
import { FullField } from 'types/queryBuilder';

interface ColumnSelectProps {
  allColumns: FullField[];
  selectedColumn: string;
  onColumnChange: (c: string) => void,
  columnFilterFn?: (c: FullField) => boolean,
  label: string;
  tooltip: string;
}

const defaultFilterFn = () => true;

export const ColumnSelect = (props: ColumnSelectProps) => {
  const { allColumns, selectedColumn, onColumnChange, columnFilterFn, label, tooltip } = props;
  const columns: SelectableValue[] = (allColumns || []).
    filter(columnFilterFn || defaultFilterFn).
    map(f => ({ label: f.label, value: f.name }));

  return (
    <div className="gf-form">
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <Select
        options={columns}
        width={20}
        onChange={e => onColumnChange(e.value)}
        value={selectedColumn}
        menuPlacement={'bottom'}
      />
    </div>
  );
};
