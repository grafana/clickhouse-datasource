import React from 'react';
import { SelectableValue } from '@grafana/data';
import { InlineFormLabel, Select } from '@grafana/ui';
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
    invalid,
    wide,
    inline,
    clearable,
  } = props;
  const selectedColumnName = selectedColumn?.name;
  const columns: Array<SelectableValue<string>> = allColumns
    .filter(columnFilterFn || defaultFilterFn)
    .map((c) => ({ label: c.label || c.name, value: c.name }));

  // Select component WILL NOT display the value if it isn't present in the options.
  let staleOption = false;
  if (selectedColumn && !columns.find((c) => c.value === selectedColumn.name)) {
    columns.push({ label: selectedColumn.alias || selectedColumn.name, value: selectedColumn.name });
    staleOption = true;
  }

  const onChange = (selected: SelectableValue<string | undefined>) => {
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
    <div className="gf-form">
      <InlineFormLabel width={wide ? 12 : 8} className={labelStyle} tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <Select<string | undefined>
        disabled={disabled}
        invalid={invalid || staleOption}
        options={columns}
        value={selectedColumnName}
        placeholder={selectedColumnName || undefined}
        onChange={onChange}
        width={wide ? 25 : 20}
        menuPlacement={'bottom'}
        isClearable={clearable === undefined || clearable}
        allowCustomValue
      />
    </div>
  );
};
