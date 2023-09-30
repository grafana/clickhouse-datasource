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
    const allColumns: readonly TableColumn[] = [{ name: 'a', type: 'string', picklistValues: [] }];
    const groupBy: string[] = ['a', 'b'];
    const result = render(<GroupByEditor allColumns={allColumns} groupBy={groupBy} onGroupByChange={() => {}} />);
    expect(result.container.firstChild).not.toBeNull();
  });

  it('should call onGroupByChange when a new column is selected', () => {
    const allColumns: readonly TableColumn[] = [{ name: 'a', type: 'string', picklistValues: [] }];
    const groupBy: string[] = ['b'];
    const onGroupByChange = jest.fn();
    const result = render(<GroupByEditor allColumns={allColumns} groupBy={groupBy} onGroupByChange={onGroupByChange} />);
    expect(result.container.firstChild).not.toBeNull();

    const multiSelect = result.getByRole('combobox');
    expect(multiSelect).toBeInTheDocument();

    expect(result.queryAllByText('a').length).toBe(0); // is popup closed
    fireEvent.keyDown(multiSelect, { key: 'ArrowDown' });
    expect(result.queryAllByText('a').length).toBe(1); // is popup open
    fireEvent.keyDown(multiSelect, { key: 'Enter' });
    expect(result.queryAllByText('a').length).toBe(0); // is popup closed
    expect(onGroupByChange).toBeCalledTimes(1);
    expect(onGroupByChange).toBeCalledWith(expect.any(Object));
  });
});
