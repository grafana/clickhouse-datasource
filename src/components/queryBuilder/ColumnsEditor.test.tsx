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
  const selectedColumns: SelectedColumn[] = [
    { name: 'name' },
  ];

  it('should render default value when no options passed', () => {
    const result = render(<ColumnsEditor allColumns={[]} selectedColumns={[]} onSelectedColumnsChange={() => {}} />);
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByTestId(selectors.components.QueryBuilder.ColumnsEditor.multiSelectWrapper)).toBeInTheDocument();
  });

  it('should render the correct values when passed', () => {
    const result = render(<ColumnsEditor allColumns={allColumns} selectedColumns={selectedColumns} onSelectedColumnsChange={() => {}} />);
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
    const result = render(<ColumnsEditor allColumns={allColumns} selectedColumns={selectedColumns} onSelectedColumnsChange={onSelectedColumnsChange} />);
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
    const result = render(<ColumnsEditor allColumns={allColumns} selectedColumns={selectedColumns} onSelectedColumnsChange={onSelectedColumnsChange} />);
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByTestId(selectors.components.QueryBuilder.ColumnsEditor.multiSelectWrapper)).toBeInTheDocument();

    const removeButton = result.getByTestId('times'); // find by "x" symbol
    fireEvent.click(removeButton);
    expect(onSelectedColumnsChange).toBeCalledTimes(1);
    expect(onSelectedColumnsChange).toBeCalledWith([]);
  });

  it('should close when clicked outside', () => {
    const onSelectedColumnsChange = jest.fn();
    const result = render(<ColumnsEditor allColumns={allColumns} selectedColumns={selectedColumns} onSelectedColumnsChange={onSelectedColumnsChange} />);
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
});
