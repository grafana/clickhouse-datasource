import React, { useState, useEffect } from 'react';
import { css, cx } from '@emotion/css';
import { InlineField, InlineFormLabel, MultiSelect } from '@grafana/ui';
import { SelectableValue } from '@grafana/data';
import { TableColumn, SelectedColumn } from 'types/queryBuilder';
import labels from 'labels';
import { selectors } from 'selectors';
import { styles } from 'styles';

// Let the selected-column chips wrap onto multiple lines within a bounded width, instead of forming
// one long row that fills the builder edge to edge (and clips when many columns are selected, for
// example logs with "Include all columns" on). The dropdown menu still lists every column. The
// builder's column width is driven by its widest row, so a bounded value list also keeps the whole
// builder from stretching to fit a long column list.
const wrappedColumnValues = css`
  & [class*='grafana-select-value-container'] {
    max-width: 760px;
    height: auto;
    overflow: visible;
    flex-wrap: wrap;
  }
`;

interface ColumnsEditorProps {
  allColumns: readonly TableColumn[];
  selectedColumns: SelectedColumn[];
  onSelectedColumnsChange: (selectedColumns: SelectedColumn[]) => void;
  disabled?: boolean;
  showAllOption?: boolean;
}

function getCustomColumns(columnNames: string[], allColumns: readonly TableColumn[]): Array<SelectableValue<string>> {
  const columnNamesSet = new Set(columnNames);
  return allColumns.filter((c) => columnNamesSet.has(c.name)).map((c) => ({ label: c.label || c.name, value: c.name }));
}

const allColumnName = '*';

export const ColumnsEditor = (props: ColumnsEditorProps) => {
  const { allColumns, selectedColumns, onSelectedColumnsChange, disabled, showAllOption } = props;
  const [customColumns, setCustomColumns] = useState<Array<SelectableValue<string>>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const allColumnNames = allColumns.map((c) => ({ label: c.label || c.name, value: c.name }));
  if (showAllOption) {
    allColumnNames.push({ label: allColumnName, value: allColumnName });
  }
  const selectedColumnNames = (selectedColumns || []).map((c) => ({ label: c.alias || c.name, value: c.name }));
  const { label, tooltip } = labels.components.ColumnsEditor;

  const options = [...allColumnNames, ...customColumns];

  useEffect(() => {
    if (allColumns.length === 0) {
      return;
    }

    const columnNames = selectedColumns.map((c) => c.name);
    const customColumns = getCustomColumns(columnNames, allColumns);
    setCustomColumns(customColumns);
  }, [allColumns, selectedColumns]);

  const onChange = (selected: Array<SelectableValue<string>>): void => {
    setIsOpen(false);
    const selectedColumnNames = new Set<string>(selected.map((s) => s.value!));
    const customColumnNames = new Set<string>(customColumns.map((c) => c.value!));
    const columnMap = new Map<string, TableColumn>();
    const currentColumnMap = new Map<string, SelectedColumn>();
    allColumns.forEach((c) => columnMap.set(c.name, c));
    selectedColumns.forEach((c) => currentColumnMap.set(c.name, c));

    const excludeAllColumn = selectedColumnNames.size > 1;
    const nextSelectedColumns: SelectedColumn[] = [];
    for (let columnName of selectedColumnNames) {
      if (excludeAllColumn && columnName === allColumnName) {
        continue;
      }

      const tableColumn = columnMap.get(columnName);
      const existingColumn = currentColumnMap.get(columnName);

      if (existingColumn) {
        nextSelectedColumns.push(existingColumn);
      } else {
        nextSelectedColumns.push({
          name: columnName,
          type: tableColumn?.type || 'String',
          custom: customColumnNames.has(columnName),
          alias: tableColumn?.label || columnName,
        });
      }
    }

    onSelectedColumnsChange(nextSelectedColumns);
  };

  return (
    <InlineField
      label={
        <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
          {label}
        </InlineFormLabel>
      }
      grow
    >
      <div
        data-testid={selectors.components.QueryBuilder.ColumnsEditor.multiSelectWrapper}
        className={cx(styles.Common.selectWrapper, wrappedColumnValues)}
      >
        <MultiSelect<string>
          disabled={disabled}
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
    </InlineField>
  );
};
