import React from 'react';
import { Combobox, ComboboxOption, InlineFormLabel } from '@grafana/ui';
import { ColumnHint, SelectedColumn, TableColumn } from 'types/queryBuilder';
import { styles } from 'styles';

interface ColumnSelectProps {
  allColumns: readonly TableColumn[];
  selectedColumn: SelectedColumn | undefined;
  onColumnChange: (c: SelectedColumn | undefined) => void;
  columnFilterFn?: (c: TableColumn) => boolean;
  columnHint?: ColumnHint;
  label: string;
  tooltip: string;
  disabled?: boolean;
  invalid?: boolean;
  wide?: boolean;
  inline?: boolean;
  clearable?: boolean;
}

const defaultFilterFn = () => true;

export const ColumnSelect = (props: ColumnSelectProps) => {
  const {
    allColumns,
    selectedColumn,
    onColumnChange,
    columnFilterFn,
    columnHint,
    label,
    tooltip,
    disabled,
    wide,
    inline,
  } = props;
  const selectedColumnName = selectedColumn?.name;
  const columns: Array<ComboboxOption<string>> = allColumns
    .filter(columnFilterFn || defaultFilterFn)
    .map((c) => ({ label: c.label || c.name, value: c.name }));

  if (selectedColumn && !columns.find((c) => c.value === selectedColumn.name)) {
    columns.push({ label: selectedColumn.alias || selectedColumn.name, value: selectedColumn.name });
  }

  const onChange = (selected: ComboboxOption<string>) => {
    if (!selected || !selected.value) {
      onColumnChange(undefined);
      return;
    }

    const column = allColumns.find((c) => c.name === selected!.value)!;
    const nextColumn: SelectedColumn = {
      name: column?.name || selected!.value,
      type: column?.type,
      hint: columnHint,
    };

    if (column && column.label !== undefined) {
      nextColumn.alias = column.label;
    }

    onColumnChange(nextColumn);
  };

  const labelStyle = 'query-keyword ' + (inline ? styles.QueryEditor.inlineField : '');

  return (
    <div className={styles.Common.flexContainer}>
      <InlineFormLabel width={wide ? 12 : 8} className={labelStyle} tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <div style={{ marginRight: '8px' }}>
        <Combobox<string>
          disabled={disabled}
          options={columns}
          value={selectedColumnName}
          placeholder={selectedColumnName || 'Choose'}
          onChange={onChange}
          width={25}
          createCustomValue={true}
        />
      </div>
    </div>
  );
};
