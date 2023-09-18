import React from 'react';
import { SelectableValue } from '@grafana/data';
import { InlineFormLabel, Select } from '@grafana/ui';
import { ColumnHint, SelectedColumn, TableColumn } from 'types/queryBuilder';
import { styles } from 'styles';

interface ColumnSelectProps {
  allColumns: ReadonlyArray<TableColumn>;
  selectedColumn: SelectedColumn | undefined;
  onColumnChange: (c: SelectedColumn) => void;
  columnFilterFn?: (c: TableColumn) => boolean;
  columnHint?: ColumnHint;
  label: string;
  tooltip: string;
  wide?: boolean;
  inline?: boolean;
}

const defaultFilterFn = () => true;

export const ColumnSelect = (props: ColumnSelectProps) => {
  const { allColumns, selectedColumn, onColumnChange, columnFilterFn, columnHint, label, tooltip, wide, inline } = props;
  const selectedColumnName = selectedColumn?.name;
  const columns: Array<SelectableValue<string>> = allColumns.
    filter(columnFilterFn || defaultFilterFn).
    map(c => ({ label: c.name, value: c.name }));

  const onChange = (selected: SelectableValue<string>) => {
    const column = allColumns.find(c => c.name === selected.value)!;
    onColumnChange({
      name: column.name,
      type: column.type,
      custom: false,
      hint: columnHint
    });
  }

  const labelStyle = 'query-keyword ' + (inline ? styles.QueryEditor.inlineField : '');

  return (
    <div className="gf-form">
      <InlineFormLabel width={wide ? 12 : 8} className={labelStyle} tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <Select<string>
        options={columns}
        value={selectedColumnName}
        onChange={onChange}
        width={wide ? 25 : 20}
        menuPlacement={'bottom'}
      />
    </div>
  );
};
