import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { ColumnsEditor } from './ColumnsEditor';
import { TableColumn, SelectedColumn } from 'types/queryBuilder';
import { selectors } from 'selectors';

describe('ColumnsEditor', () => {
  const allColumns: readonly TableColumn[] = [
    { name: 'name', type: 'string', picklistValues: [] },
    { name: 'dummy', type: 'string', picklistValues: [] },
  ];
  const selectedColumns: SelectedColumn[] = [{ name: 'name' }];

  it('should render default value when no options passed', () => {
    const result = render(<ColumnsEditor allColumns={[]} selectedColumns={[]} onSelectedColumnsChange={() => {}} />);
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByTestId(selectors.components.QueryBuilder.ColumnsEditor.multiSelectWrapper)).toBeInTheDocument();
  });

  it('should render the correct values when passed', () => {
    const result = render(
      <ColumnsEditor allColumns={allColumns} selectedColumns={selectedColumns} onSelectedColumnsChange={() => {}} />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByTestId(selectors.components.QueryBuilder.ColumnsEditor.multiSelectWrapper)).toBeInTheDocument();

    const multiSelect = result.getByRole('combobox');
    expect(multiSelect).toBeInTheDocument();
    fireEvent.keyDown(multiSelect, { key: 'ArrowDown' });
    expect(result.getByText('name')).toBeInTheDocument();
    expect(result.getByText('dummy')).toBeInTheDocument();
  });

  it('should call onSelectedColumnsChange when a column is selected', () => {
    const onSelectedColumnsChange = jest.fn();
    const result = render(
      <ColumnsEditor
        allColumns={allColumns}
        selectedColumns={selectedColumns}
        onSelectedColumnsChange={onSelectedColumnsChange}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByTestId(selectors.components.QueryBuilder.ColumnsEditor.multiSelectWrapper)).toBeInTheDocument();

    const multiSelect = result.getByRole('combobox');
    expect(multiSelect).toBeInTheDocument();
    fireEvent.keyDown(multiSelect, { key: 'ArrowDown' });
    fireEvent.keyDown(multiSelect, { key: 'ArrowDown' });
    fireEvent.keyDown(multiSelect, { key: 'Enter' });

    expect(onSelectedColumnsChange).toBeCalledTimes(1);
    expect(onSelectedColumnsChange).toBeCalledWith([expect.any(Object), expect.any(Object)]);
  });

  it('should call onSelectedColumnsChange when a column is deselected', () => {
    const onSelectedColumnsChange = jest.fn();
    const result = render(
      <ColumnsEditor
        allColumns={allColumns}
        selectedColumns={selectedColumns}
        onSelectedColumnsChange={onSelectedColumnsChange}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByTestId(selectors.components.QueryBuilder.ColumnsEditor.multiSelectWrapper)).toBeInTheDocument();

    const removeButton = result.getByTestId('times'); // find by "x" symbol
    fireEvent.click(removeButton);
    expect(onSelectedColumnsChange).toBeCalledTimes(1);
    expect(onSelectedColumnsChange).toBeCalledWith([]);
  });

  it('should close when clicked outside', () => {
    const onSelectedColumnsChange = jest.fn();
    const result = render(
      <ColumnsEditor
        allColumns={allColumns}
        selectedColumns={selectedColumns}
        onSelectedColumnsChange={onSelectedColumnsChange}
      />
    );
    expect(onSelectedColumnsChange).toHaveBeenCalledTimes(0);

    const multiSelect = result.getByRole('combobox');
    expect(multiSelect).toBeInTheDocument();

    expect(result.queryAllByText('dummy').length).toBe(0); // is popup closed
    fireEvent.keyDown(multiSelect, { key: 'ArrowDown' });
    expect(result.getByText('dummy')).toBeInTheDocument(); // is popup open
    fireEvent.keyDown(multiSelect, { key: 'Esc' });
    expect(result.queryAllByText('dummy').length).toBe(0); // is popup closed
    expect(onSelectedColumnsChange).toHaveBeenCalledTimes(0);
  });

  describe('Add all columns', () => {
    // A mix designed to exercise every exclusion rule in onAddAll: the scalar String column is the
    // only one eligible; the DateTime, the Map (collection), the JSON(...) (collection), the
    // __-prefixed internal column, and the already-selected column are all excluded.
    const addAllColumns: readonly TableColumn[] = [
      { name: 'ServiceName', type: 'String', picklistValues: [] },
      { name: 'Timestamp', type: 'DateTime', picklistValues: [] },
      { name: 'LogAttributes', type: 'Map(String, String)', picklistValues: [] },
      { name: 'Payload', type: 'JSON(max_dynamic_paths=100)', picklistValues: [] },
      { name: '__hdx_x', type: 'String', picklistValues: [] },
      { name: 'AlreadySelected', type: 'String', picklistValues: [] },
    ];
    const addAllSelectedColumns: SelectedColumn[] = [{ name: 'AlreadySelected' }];
    // The single curated column that survives every exclusion.
    const curated: SelectedColumn[] = [{ name: 'ServiceName', type: 'String' }];

    // The "Add all columns" entry is prepended as the first option. Opening the menu with ArrowDown
    // highlights the first option, so a single ArrowDown followed by Enter deterministically selects
    // the sentinel. This mirrors the realistic react-select interaction used by the other tests.
    const triggerAddAll = (multiSelect: HTMLElement) => {
      fireEvent.keyDown(multiSelect, { key: 'ArrowDown' });
      fireEvent.keyDown(multiSelect, { key: 'Enter' });
    };

    it('should call onAddAllColumns once with only the eligible scalar columns', () => {
      const onSelectedColumnsChange = jest.fn();
      const onAddAllColumns = jest.fn();
      const result = render(
        <ColumnsEditor
          allColumns={addAllColumns}
          selectedColumns={addAllSelectedColumns}
          onSelectedColumnsChange={onSelectedColumnsChange}
          showAddAllOption
          onAddAllColumns={onAddAllColumns}
        />
      );

      const multiSelect = result.getByRole('combobox');
      // Open the menu (ArrowDown also highlights the first option, the sentinel) and confirm the
      // "Add all columns" entry is present, then Enter selects the highlighted sentinel.
      fireEvent.keyDown(multiSelect, { key: 'ArrowDown' });
      expect(result.getByText('Add all columns')).toBeInTheDocument();
      fireEvent.keyDown(multiSelect, { key: 'Enter' });

      expect(onAddAllColumns).toHaveBeenCalledTimes(1);
      expect(onAddAllColumns).toHaveBeenCalledWith(curated);
      // Selecting the sentinel is an action, not a column change.
      expect(onSelectedColumnsChange).not.toHaveBeenCalled();
    });

    it('should fall back to onSelectedColumnsChange with existing plus curated when onAddAllColumns is omitted', () => {
      const onSelectedColumnsChange = jest.fn();
      const result = render(
        <ColumnsEditor
          allColumns={addAllColumns}
          selectedColumns={addAllSelectedColumns}
          onSelectedColumnsChange={onSelectedColumnsChange}
          showAddAllOption
        />
      );

      const multiSelect = result.getByRole('combobox');
      triggerAddAll(multiSelect);

      expect(onSelectedColumnsChange).toHaveBeenCalledTimes(1);
      expect(onSelectedColumnsChange).toHaveBeenCalledWith([...addAllSelectedColumns, ...curated]);
    });

    it('should call onSelectedColumnsChange and not onAddAllColumns when a normal column is selected', () => {
      const onSelectedColumnsChange = jest.fn();
      const onAddAllColumns = jest.fn();
      const result = render(
        <ColumnsEditor
          allColumns={addAllColumns}
          selectedColumns={addAllSelectedColumns}
          onSelectedColumnsChange={onSelectedColumnsChange}
          showAddAllOption
          onAddAllColumns={onAddAllColumns}
        />
      );

      const multiSelect = result.getByRole('combobox');
      // Skip past the "Add all columns" sentinel (first) onto a real column and select it.
      fireEvent.keyDown(multiSelect, { key: 'ArrowDown' });
      fireEvent.keyDown(multiSelect, { key: 'ArrowDown' });
      fireEvent.keyDown(multiSelect, { key: 'Enter' });

      expect(onAddAllColumns).not.toHaveBeenCalled();
      expect(onSelectedColumnsChange).toHaveBeenCalledTimes(1);
    });
  });
});
