import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { ColumnSelect } from './ColumnSelect';
import { SelectedColumn, TableColumn } from 'types/queryBuilder';

describe('ColumnSelect', () => {
  const testLabel = 'Label';
  const testTooltip = 'Tooltip';

  it('should render with empty properties', () => {
    const result = render(
      <ColumnSelect
        allColumns={[]}
        selectedColumn={undefined}
        onColumnChange={() => {}}
        label={testLabel}
        tooltip={testTooltip}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
  });

  it('should render with valid properties', () => {
    const allColumns: readonly TableColumn[] = [{ name: 'foo', type: 'string', picklistValues: [] }];
    const selectedColumn: SelectedColumn = { name: 'foo' };
    const result = render(
      <ColumnSelect
        allColumns={allColumns}
        selectedColumn={selectedColumn}
        onColumnChange={() => {}}
        label={testLabel}
        tooltip={testTooltip}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByText('foo')).not.toBeUndefined();
  });

  it('should call onColumnChange when a new column is selected', () => {
    const allColumns: readonly TableColumn[] = [
      { name: 'one', type: 'string', picklistValues: [] },
      { name: 'two', type: 'string', picklistValues: [] }
    ];
    const onColumnChange = jest.fn();
    const result = render(
      <ColumnSelect
        allColumns={allColumns}
        selectedColumn={undefined}
        onColumnChange={onColumnChange}
        label={testLabel}
        tooltip={testTooltip}
      />
    );
    expect(result.container.firstChild).not.toBeNull();

    const multiSelect = result.getByRole('combobox');
    expect(multiSelect).toBeInTheDocument();
    fireEvent.keyDown(multiSelect, { key: 'ArrowDown' });
    fireEvent.keyDown(multiSelect, { key: 'Enter' });
    expect(onColumnChange).toHaveBeenCalledTimes(1);
    expect(onColumnChange).toHaveBeenCalledWith(expect.any(Object));
  });
});
