import React from 'react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderByEditor, getOrderByOptions } from './OrderByEditor';
import { AggregateType, BuilderMode, OrderByDirection, QueryType, TableColumn } from 'types/queryBuilder';
import { SelectableValue } from '@grafana/data';

const testOptions: Array<SelectableValue<string>> = [
  { label: 'foo', value: 'foo' },
  { label: 'bar', value: 'bar' },
  { label: 'baz', value: 'baz' },
];

describe('OrderByEditor', () => {
  it('should render null when no fields passed', () => {
    const result = render(<OrderByEditor orderByOptions={[]} orderBy={[]} onOrderByChange={() => {}} />);
    expect(result.container.firstChild).toBeNull();
  });
  it('should render component when fields passed', () => {
    const result = render(
      <OrderByEditor orderByOptions={[testOptions[0]]} orderBy={[]} onOrderByChange={() => {}} />
    );
    expect(result.container.firstChild).not.toBeNull();
  });
  it('should render default add button when no orderby fields passed', () => {
    const result = render(
      <OrderByEditor orderByOptions={[testOptions[0]]} orderBy={[]} onOrderByChange={() => {}} />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByTestId('query-builder-orderby-add-button')).toBeInTheDocument();
    expect(result.queryByTestId('query-builder-orderby-item-wrapper')).not.toBeInTheDocument();
    expect(result.queryByTestId('query-builder-orderby-remove-button')).not.toBeInTheDocument();
  });
  it('should render remove button when at least one orderby fields passed', () => {
    const result = render(
      <OrderByEditor
        orderByOptions={[testOptions[0]]}
        orderBy={[{ name: 'foo', dir: OrderByDirection.ASC }]}
        onOrderByChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByTestId('query-builder-orderby-add-button')).toBeInTheDocument();
    expect(result.getByTestId('query-builder-orderby-item-wrapper')).toBeInTheDocument();
    expect(result.getByTestId('query-builder-orderby-remove-button')).toBeInTheDocument();
  });
  it('should render add/remove buttons correctly when multiple orderby elements passed', () => {
    const result = render(
      <OrderByEditor
        orderByOptions={[testOptions[0]]}
        orderBy={[
          { name: 'foo', dir: OrderByDirection.ASC },
          { name: 'bar', dir: OrderByDirection.ASC },
        ]}
        onOrderByChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.queryByTestId('query-builder-orderby-add-button')).toBeInTheDocument();
    expect(result.getAllByTestId('query-builder-orderby-item-wrapper').length).toBe(2);
    expect(result.getAllByTestId('query-builder-orderby-remove-button').length).toBe(2);
  });
  it('should render label only once', () => {
    const result = render(
      <OrderByEditor
        orderByOptions={[testOptions[0]]}
        orderBy={[
          { name: 'foo', dir: OrderByDirection.ASC },
          { name: 'bar', dir: OrderByDirection.ASC },
        ]}
        onOrderByChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByTestId('query-builder-orderby-item-label')).toBeInTheDocument();
  });
  it('should add default item when add button clicked', async () => {
    const onOrderByChange = jest.fn();
    const result = render(
      <OrderByEditor
        orderByOptions={[testOptions[0]]}
        orderBy={[]}
        onOrderByChange={onOrderByChange}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByTestId('query-builder-orderby-add-button')).toBeInTheDocument();
    expect(result.queryByTestId('query-builder-orderby-item-wrapper')).not.toBeInTheDocument();
    expect(result.queryByTestId('query-builder-orderby-remove-button')).not.toBeInTheDocument();
    expect(onOrderByChange).toBeCalledTimes(0);
    await userEvent.click(result.getByTestId('query-builder-orderby-add-button'));
    expect(onOrderByChange).toBeCalledTimes(1);
    expect(onOrderByChange).toBeCalledWith([{ name: 'foo', dir: OrderByDirection.ASC }]);
  });
  it('should remove items when remove button clicked', async () => {
    const onOrderByChange = jest.fn();
    const result = render(
      <OrderByEditor
        orderByOptions={testOptions}
        orderBy={[
          { name: 'foo', dir: OrderByDirection.ASC },
          { name: 'bar', dir: OrderByDirection.ASC },
        ]}
        onOrderByChange={onOrderByChange}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(onOrderByChange).toBeCalledTimes(0);
    await userEvent.click(result.getAllByTestId('query-builder-orderby-remove-button')[1]);
    await userEvent.click(result.getAllByTestId('query-builder-orderby-remove-button')[0]);
    await userEvent.click(result.getAllByTestId('query-builder-orderby-add-button')[0]);
    expect(onOrderByChange).toBeCalledTimes(3);
    expect(onOrderByChange).toHaveBeenNthCalledWith(1, [{ name: 'foo', dir: OrderByDirection.ASC }]);
    expect(onOrderByChange).toHaveBeenNthCalledWith(2, [{ name: 'bar', dir: OrderByDirection.ASC }]);
    expect(onOrderByChange).toHaveBeenNthCalledWith(3, [
      { name: 'foo', dir: OrderByDirection.ASC },
      { name: 'bar', dir: OrderByDirection.ASC },
      { name: 'foo', dir: OrderByDirection.ASC },
    ]);
  });
});

describe('getOrderByOptions', () => {
  const allColumns: readonly TableColumn[] = [
    {
      name: 'field1',
      type: 'string',
      picklistValues: [],
    },
    {
      name: 'field2',
      type: 'string',
      picklistValues: [],
    },
    {
      name: 'field3',
      type: 'string',
      picklistValues: [],
    },
    {
      name: 'field4',
      type: 'string',
      picklistValues: [],
    },
  ];

  it('should return all columns as options', () => {
    expect(
      getOrderByOptions(
        {
          database: 'db',
          table: 'foo',
          queryType: QueryType.Table,
          columns: [{ name: 'field1' }, { name: 'field3' }],
        },
        allColumns
      )
    ).toStrictEqual([
      {
        label: 'field1',
        value: 'field1',
      },
      {
        label: 'field2',
        value: 'field2',
      },
      {
        label: 'field3',
        value: 'field3',
      },
      {
        label: 'field4',
        value: 'field4',
      },
    ]);
  });
  it('should return only selected columns for aggregate query', () => {
    expect(
      getOrderByOptions(
        {
          database: 'db',
          table: 'foo',
          queryType: QueryType.Table,
          columns: [{ name: 'field1' }],
          aggregates: [{ column: 'field2', aggregateType: AggregateType.Max }],
        },
        allColumns
      )
    ).toStrictEqual([
      {
        label: 'field1',
        value: 'field1',
      },
      {
        label: 'max(field2)',
        value: 'max(field2)',
      }
    ]);
  });
  it('should return correct label and value for aggregates with aliases', () => {
    expect(
      getOrderByOptions(
        {
          database: 'db',
          table: 'foo',
          queryType: QueryType.Table,
          aggregates: [{ column: 'field1', aggregateType: AggregateType.Max, alias: 'a' }],
        },
        allColumns
      )
    ).toStrictEqual([
      {
        label: 'max(field1) as a',
        value: 'a',
      }
    ]);
  });
  it('should show options from selected columns, aggregates, and groupBy', () => {
    expect(
      getOrderByOptions(
        {
          database: 'db',
          table: 'foo',
          queryType: QueryType.Table,
          columns: [{ name: 'field1' }],
          aggregates: [
            { column: 'field2', aggregateType: AggregateType.Max },
          ],
          groupBy: ['field2']
        },
        allColumns
      )
    ).toStrictEqual([
      {
        value: 'field1',
        label: 'field1',
      },
      {
        value: 'max(field2)',
        label: 'max(field2)',
      },
      {
        value: 'field2',
        label: 'field2',
      },
    ]);
  });
  it('aggregated view - two group by and with no aggregates', () => {
    expect(
      getOrderByOptions(
        {
          database: 'db',
          table: 'foo',
          queryType: QueryType.Table,
          columns: [],
          aggregates: [],
          groupBy: ['field3', 'field1'],
        },
        allColumns
      )
    ).toStrictEqual([
      {
        value: 'field1',
        label: 'field1',
      },
      {
        value: 'field2',
        label: 'field2',
      },
      {
        value: 'field3',
        label: 'field3',
      },
      {
        value: 'field4',
        label: 'field4',
      },
    ]);
  });
  it('aggregated view - two group by and with two metrics', () => {
    expect(
      getOrderByOptions(
        {
          database: 'db',
          table: 'foo',
          queryType: QueryType.Table,
          mode: BuilderMode.Aggregate,
          columns: [],
          aggregates: [
            { column: 'field2', aggregateType: AggregateType.Max },
            { column: 'field1', aggregateType: AggregateType.Sum },
          ],
          groupBy: ['field3', 'field1'],
        },
        allColumns
      )
    ).toStrictEqual([
      {
        value: 'max(field2)',
        label: 'max(field2)',
      },
      {
        value: 'sum(field1)',
        label: 'sum(field1)',
      },
      {
        value: 'field3',
        label: 'field3',
      },
      {
        value: 'field1',
        label: 'field1',
      },
    ]);
  });
});
