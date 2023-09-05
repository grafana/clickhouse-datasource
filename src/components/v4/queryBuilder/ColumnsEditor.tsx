import React, { useState, useEffect } from 'react';
import { InlineFormLabel, MultiSelect } from '@grafana/ui';
import { SelectableValue } from '@grafana/data';
import { FullField } from 'types/queryBuilder';
import selectors from 'v4/selectors';
import { styles } from 'styles';

interface ColumnsEditorProps {
  allColumns: FullField[];
  columns: string[];
  onColumnsChange: (columns: string[]) => void;
}

function getCustomColumns(columnNames: string[], allColumns: FullField[]) {
  const columnNamesSet = new Set(columnNames);
  return allColumns.
    filter(c => columnNamesSet.has(c.name)).
    map(c => ({ label: c.name, value: c.name }));
}

function cleanupColumns(columns: string[], defaultColumns: Array<SelectableValue<string>>): string[] {
  const columnNames = new Set(defaultColumns.map(d => d.value));
  const firstColumnName = columns[0];
  const lastColumnName = columns[columns.length - 1];
  if (columnNames.has(firstColumnName) || columnNames.has(lastColumnName)) {
    return [lastColumnName];
  }
  return columns;
};

export const ColumnsEditor = (props: ColumnsEditorProps) => {
  const [columns, setColumns] = useState<string[]>(props.columns || []);
  const [custom, setCustom] = useState<Array<SelectableValue<string>>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const defaultColumns: Array<SelectableValue<string>> = [];
  const allColumns = (props.allColumns || []).map(f => ({ label: f.label, value: f.name }));
  const { label, tooltip } = selectors.components.ColumnsEditor;

  useEffect(() => {
    if (props.allColumns.length === 0) {
      return;
    }

    setColumns(props.columns);
    const customColumns = getCustomColumns(props.columns, props.allColumns);
    setCustom(customColumns);
  }, [props.columns, props.allColumns]);

  const onColumnsChange = (columns: string[]) => {
    const cleanColumns = cleanupColumns(columns, defaultColumns);
    setColumns(cleanColumns);
    const customColumns = getCustomColumns(columns, props.allColumns);
    setCustom(customColumns);
  };

  const onUpdateColumns = () => props.onColumnsChange(columns);

  const onChange = (selected: Array<SelectableValue<string>>): void => {
    setIsOpen(false);
    onColumnsChange(selected.map(v => v.value!));
  };

  return (
    <div className="gf-form">
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <div data-testid="query-builder-fields-multi-select-container" className={styles.Common.selectWrapper}>
        <MultiSelect<string>
          options={[...allColumns, ...defaultColumns, ...custom]}
          value={columns && columns.length > 0 ? columns : []}
          isOpen={isOpen}
          onOpenMenu={() => setIsOpen(true)}
          onCloseMenu={() => setIsOpen(false)}
          onChange={onChange}
          onBlur={onUpdateColumns}
          allowCustomValue={true}
          menuPlacement={'bottom'}
        />
      </div>
    </div>
  );
};
