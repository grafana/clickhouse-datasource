import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AggregateEditor } from './AggregateEditor';
import { selectors } from 'selectors';
import { AggregateColumn, AggregateType } from 'types/queryBuilder';

describe('AggregateEditor', () => {
  it('should render with no aggregates', () => {
    const result = render(<AggregateEditor allColumns={[]} aggregates={[]} onAggregatesChange={() => {}} />);
    expect(result.container.firstChild).not.toBeNull();
  });

  it('should render with aggregates', () => {
    const testAggregate: AggregateColumn = { aggregateType: AggregateType.Count, column: 'foo', alias: 'f' };
    const result = render(<AggregateEditor allColumns={[]} aggregates={[testAggregate]} onAggregatesChange={() => {}} />);
    expect(result.container.firstChild).not.toBeNull();

    const firstAggregate = result.getByTestId(selectors.components.QueryBuilder.AggregateEditor.itemWrapper);
    expect(firstAggregate).toBeInTheDocument();
  });

  it('should call onAggregatesChange when add aggregate button is clicked', async () => {
    const onAggregatesChange = jest.fn();
    const result = render(<AggregateEditor allColumns={[]} aggregates={[]} onAggregatesChange={onAggregatesChange} />);
    expect(result.container.firstChild).not.toBeNull();

    const addButton = result.getByTestId(selectors.components.QueryBuilder.AggregateEditor.addButton);
    expect(addButton).toBeInTheDocument();
    await userEvent.click(addButton);
    expect(onAggregatesChange).toBeCalledTimes(1);
    expect(onAggregatesChange).toBeCalledWith([expect.anything()]);
  });

  it('should call onAggregatesChange when remove aggregate button is clicked', async () => {
    const testAggregate: AggregateColumn = { aggregateType: AggregateType.Count, column: 'foo', alias: 'f' };
    const onAggregatesChange = jest.fn();
    const result = render(<AggregateEditor allColumns={[]} aggregates={[testAggregate]} onAggregatesChange={onAggregatesChange} />);
    expect(result.container.firstChild).not.toBeNull();

    const removeButton = result.getByTestId(selectors.components.QueryBuilder.AggregateEditor.itemRemoveButton);
    expect(removeButton).toBeInTheDocument();
    await userEvent.click(removeButton);
    expect(onAggregatesChange).toBeCalledWith([]);
  });

  it('should call onAggregatesChange when aggregate is updated', async () => {
    const inputAggregate: AggregateColumn = { aggregateType: AggregateType.Count, column: 'foo', alias: 'f' };
    const expectedAggregate: AggregateColumn = { aggregateType: AggregateType.Sum, column: 'foo', alias: 'f' };
    const onAggregatesChange = jest.fn();
    const result = render(<AggregateEditor allColumns={[]} aggregates={[inputAggregate]} onAggregatesChange={onAggregatesChange} />);
    expect(result.container.firstChild).not.toBeNull();

    const aggregateSelect = result.getAllByRole('combobox')[0];
    expect(aggregateSelect).toBeInTheDocument();
    fireEvent.keyDown(aggregateSelect, { key: 'ArrowDown' });
    fireEvent.keyDown(aggregateSelect, { key: 'ArrowDown' });
    fireEvent.keyDown(aggregateSelect, { key: 'Enter' });
    expect(onAggregatesChange).toBeCalledWith([expectedAggregate]);
  });
});
