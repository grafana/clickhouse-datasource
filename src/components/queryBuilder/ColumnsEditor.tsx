import React, { useState, useEffect } from 'react';
import { css, cx } from '@emotion/css';
import { InlineField, InlineFormLabel, MultiSelect } from '@grafana/ui';
import { SelectableValue } from '@grafana/data';
import { TableColumn, SelectedColumn } from 'types/queryBuilder';
import labels from 'labels';
import { selectors } from 'selectors';
import { styles } from 'styles';
import { isCollectionColumnType, isDateTimeColumn } from './views/columnNameHeuristics';

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
  // Logs-only: show a subtle "Add all columns" entry at the top of the dropdown that materializes
  // every scalar column as an explicit selected column (still removable individually). Off elsewhere.
  showAddAllOption?: boolean;
  // Handles the "Add all columns" action with the curated columns to add. The parent merges them
  // against live reducer state (deduping by name) so a column already selected as a role is not
  // projected twice. Falls back to onSelectedColumnsChange when not provided.
  onAddAllColumns?: (columnsToAdd: SelectedColumn[]) => void;
  // Optional field-label overrides so the config editor's Columns row lines up with the width-12
  // rows above it and keeps its own tooltip. Builders omit these and get the defaults below.
  label?: string;
  tooltip?: string;
  width?: number;
}

function getCustomColumns(columnNames: string[], allColumns: readonly TableColumn[]): Array<SelectableValue<string>> {
  const columnNamesSet = new Set(columnNames);
  return allColumns.filter((c) => columnNamesSet.has(c.name)).map((c) => ({ label: c.label || c.name, value: c.name }));
}

const allColumnName = '*';
// Sentinel value for the in-dropdown "Add all columns" action. Selecting it triggers the materialize
// action instead of adding a literal column, so it never becomes a chip or a projected column.
const addAllColumnsValue = '__add_all_columns__';

export const ColumnsEditor = (props: ColumnsEditorProps) => {
  const {
    allColumns,
    selectedColumns,
    onSelectedColumnsChange,
    disabled,
    showAllOption,
    showAddAllOption,
    onAddAllColumns,
  } = props;
  const [customColumns, setCustomColumns] = useState<Array<SelectableValue<string>>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const allColumnNames = allColumns.map((c) => ({ label: c.label || c.name, value: c.name }));
  if (showAllOption) {
    allColumnNames.push({ label: allColumnName, value: allColumnName });
  }
  const selectedColumnNames = (selectedColumns || []).map((c) => ({ label: c.alias || c.name, value: c.name }));
  const { label: defaultLabel, tooltip: defaultTooltip, addAllColumns } = labels.components.ColumnsEditor;
  const fieldLabel = props.label ?? defaultLabel;
  const fieldTooltip = props.tooltip ?? defaultTooltip;
  const fieldWidth = props.width ?? 8;

  const options = [
    // Subtle first entry, only for logs and once the schema has loaded. Selecting it materializes
    // every scalar column (handled in onChange); it is never added as a column itself.
    ...(showAddAllOption && allColumns.length > 0 ? [{ label: addAllColumns, value: addAllColumnsValue }] : []),
    ...allColumnNames,
    ...customColumns,
  ];

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
    // The "Add all columns" entry is an action, not a column: materialize all scalars and stop.
    if (selected.some((s) => s.value === addAllColumnsValue)) {
      onAddAll();
      return;
    }
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

  // Materialize every non-collection scalar column (skipping time-typed, __-internal, and
  // already-selected ones) as explicit selected columns. Each folds into the log details as a
  // browsable, filterable field and can still be removed individually.
  const onAddAll = (): void => {
    const selected = new Set(selectedColumns.map((c) => c.name));
    const toAdd: SelectedColumn[] = allColumns
      .filter(
        (c) =>
          !selected.has(c.name) && !isCollectionColumnType(c.type) && !c.name.startsWith('__') && !isDateTimeColumn(c)
      )
      .map((c) => ({ name: c.name, type: c.type }));
    if (toAdd.length === 0) {
      return;
    }
    // Prefer the parent's merge (dedupes against live reducer state, incl. role columns of the same
    // name) so nothing is projected twice; fall back to a plain replace when no handler is given.
    if (onAddAllColumns) {
      onAddAllColumns(toAdd);
    } else {
      onSelectedColumnsChange([...selectedColumns, ...toAdd]);
    }
  };

  return (
    <InlineField
      label={
        <InlineFormLabel width={fieldWidth} className="query-keyword" tooltip={fieldTooltip}>
          {fieldLabel}
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
