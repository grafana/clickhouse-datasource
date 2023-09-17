import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { GroupByEditor } from './GroupByEditor';
import { TableColumn } from 'types/queryBuilder';

describe('GroupByEditor', () => {
  it('should render with empty properties', () => {
    const result = render(<GroupByEditor allColumns={[]} groupBy={[]} onGroupByChange={() => {}} />);
    expect(result.container.firstChild).not.toBeNull();
  });

  it('should render with valid properties', () => {
    const allColumns: ReadonlyArray<TableColumn> = [{ name: 'a', type: 'string', picklistValues: [] }];
    const groupBy: string[] = ['a', 'b'];
    const result = render(<GroupByEditor allColumns={allColumns} groupBy={groupBy} onGroupByChange={() => {}} />);
    expect(result.container.firstChild).not.toBeNull();
  });

  it('should call onGroupByChange when a new column is selected', () => {
    const allColumns: ReadonlyArray<TableColumn> = [{ name: 'a', type: 'string', picklistValues: [] }];
    const groupBy: string[] = ['b'];
    const onGroupByChange = jest.fn();
    const result = render(<GroupByEditor allColumns={allColumns} groupBy={groupBy} onGroupByChange={onGroupByChange} />);
    expect(result.container.firstChild).not.toBeNull();

    const multiSelect = result.getByRole('combobox');
    expect(multiSelect).toBeInTheDocument();
    fireEvent.keyDown(multiSelect, { key: 'ArrowDown' });
    fireEvent.keyDown(multiSelect, { key: 'Enter' });
    expect(onGroupByChange).toBeCalledTimes(1);
    expect(onGroupByChange).toBeCalledWith(expect.any(Object));
  });
});
