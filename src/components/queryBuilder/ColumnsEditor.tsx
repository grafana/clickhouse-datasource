import React, { useState, useEffect } from 'react';
import { InlineFormLabel, MultiSelect } from '@grafana/ui';
import { SelectableValue } from '@grafana/data';
import { TableColumn, SelectedColumn } from 'types/queryBuilder';
import labels from 'labels';
import { selectors } from 'selectors';
import { styles } from 'styles';

interface ColumnsEditorProps {
  allColumns: ReadonlyArray<TableColumn>;
  selectedColumns: SelectedColumn[];
  onSelectedColumnsChange: (selectedColumns: SelectedColumn[]) => void;
}

function getCustomColumns(columnNames: string[], allColumns: ReadonlyArray<TableColumn>): Array<SelectableValue<string>> {
  const columnNamesSet = new Set(columnNames);
  return allColumns.
    filter(c => columnNamesSet.has(c.name)).
    map(c => ({ label: c.name, value: c.name }));
}

export const ColumnsEditor = (props: ColumnsEditorProps) => {
  const { allColumns, selectedColumns, onSelectedColumnsChange } = props;
  const [customColumns, setCustomColumns] = useState<Array<SelectableValue<string>>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const allColumnNames = allColumns.map(c => ({ label: c.name, value: c.name }));
  const selectedColumnNames = (selectedColumns || []).map(c => ({ label: c.name, value: c.name }));
  const { label, tooltip } = labels.components.ColumnsEditor;

  const options = [...allColumnNames, ...customColumns];

  useEffect(() => {
    if (allColumns.length === 0) {
      return;
    }

    const columnNames = selectedColumns.map(c => c.name);
    const customColumns = getCustomColumns(columnNames, allColumns);
    setCustomColumns(customColumns);
  }, [allColumns, selectedColumns]);

  const onChange = (selected: Array<SelectableValue<string>>): void => {
    setIsOpen(false);
    const selectedColumnNames = new Set<string>(selected.map(s => s.value!));
    const customColumnNames = new Set<string>(customColumns.map(c => c.value!))
    const columnMap = new Map<string, TableColumn>();
    allColumns.forEach(c => columnMap.set(c.name, c));

    const nextSelectedColumns: SelectedColumn[] = [];
    for (let columnName of selectedColumnNames) {
      const tableColumn = columnMap.get(columnName);
      nextSelectedColumns.push({
        name: columnName,
        type: tableColumn?.type || 'String',
        custom: customColumnNames.has(columnName)
      });
    }

    onSelectedColumnsChange(nextSelectedColumns);
  };

  return (
    <div className="gf-form">
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <div data-testid={selectors.components.QueryBuilder.ColumnsEditor.multiSelectWrapper} className={styles.Common.selectWrapper}>
        <MultiSelect<string>
          options={options}
          value={selectedColumnNames}
          isOpen={isOpen}
          onOpenMenu={() => setIsOpen(true)}
          onCloseMenu={() => setIsOpen(false)}
          onChange={onChange}
          allowCustomValue={true}
          menuPlacement={'bottom'}
        />
      </div>
    </div>
  );
};
