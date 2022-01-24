import React from 'react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderByEditor, getOrderByFields } from './OrderBy';
import { BuilderMetricFieldAggregation, BuilderMode, OrderByDirection } from './../../types';

describe('OrderByEditor', () => {
  it('should render null when no fields passed', () => {
    const result = render(<OrderByEditor fieldsList={[]} orderBy={[]} onOrderByItemsChange={() => {}} />);
    expect(result.container.firstChild).toBeNull();
  });
  it('should render component when fields passed', () => {
    const result = render(
      <OrderByEditor fieldsList={[{ value: 'foo', sortable: true }]} orderBy={[]} onOrderByItemsChange={() => {}} />
    );
    expect(result.container.firstChild).not.toBeNull();
  });
  it('should render default add button when no orderby fields passed', () => {
    const result = render(
      <OrderByEditor fieldsList={[{ value: 'foo', sortable: true }]} orderBy={[]} onOrderByItemsChange={() => {}} />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByTestId('query-builder-orderby-add-button')).toBeInTheDocument();
    expect(result.queryByTestId('query-builder-orderby-item-wrapper')).not.toBeInTheDocument();
    expect(result.queryByTestId('query-builder-orderby-remove-button')).not.toBeInTheDocument();
  });
  it('should render remove button when at least one orderby fields passed', () => {
    const result = render(
      <OrderByEditor
        fieldsList={[{ value: 'foo', sortable: true }]}
        orderBy={[{ name: 'foo', dir: OrderByDirection.ASC }]}
        onOrderByItemsChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.queryByTestId('query-builder-orderby-add-button')).not.toBeInTheDocument();
    expect(result.getByTestId('query-builder-orderby-inline-add-button')).toBeInTheDocument();
    expect(result.getByTestId('query-builder-orderby-item-wrapper')).toBeInTheDocument();
    expect(result.getByTestId('query-builder-orderby-remove-button')).toBeInTheDocument();
  });
  it('should be only one inline add button when multiple orderby items passed', () => {
    const result = render(
      <OrderByEditor
        fieldsList={[{ value: 'foo', sortable: true }]}
        orderBy={[
          { name: 'foo', dir: OrderByDirection.ASC },
          { name: 'bar', dir: OrderByDirection.ASC },
        ]}
        onOrderByItemsChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.queryByTestId('query-builder-orderby-add-button')).not.toBeInTheDocument();
    expect(result.getByTestId('query-builder-orderby-inline-add-button')).toBeInTheDocument();
  });
  it('should render add/remove buttons correctly when multiple orderby elements passed', () => {
    const result = render(
      <OrderByEditor
        fieldsList={[{ value: 'foo', sortable: true }]}
        orderBy={[
          { name: 'foo', dir: OrderByDirection.ASC },
          { name: 'bar', dir: OrderByDirection.ASC },
        ]}
        onOrderByItemsChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.queryByTestId('query-builder-orderby-add-button')).not.toBeInTheDocument();
    expect(result.getByTestId('query-builder-orderby-inline-add-button')).toBeInTheDocument();
    expect(result.getAllByTestId('query-builder-orderby-item-wrapper').length).toBe(2);
    expect(result.getAllByTestId('query-builder-orderby-remove-button').length).toBe(2);
  });
  it('should render label only once', () => {
    const result = render(
      <OrderByEditor
        fieldsList={[{ value: 'foo', sortable: true }]}
        orderBy={[
          { name: 'foo', dir: OrderByDirection.ASC },
          { name: 'bar', dir: OrderByDirection.ASC },
        ]}
        onOrderByItemsChange={() => {}}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByTestId('query-builder-orderby-item-label')).toBeInTheDocument();
  });
  it('should add default item when add button clicked', () => {
    const onOrderByItemsChange = jest.fn();
    const result = render(
      <OrderByEditor
        fieldsList={[{ value: 'foo', sortable: true }]}
        orderBy={[]}
        onOrderByItemsChange={onOrderByItemsChange}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByTestId('query-builder-orderby-add-button')).toBeInTheDocument();
    expect(result.queryByTestId('query-builder-orderby-item-wrapper')).not.toBeInTheDocument();
    expect(result.queryByTestId('query-builder-orderby-remove-button')).not.toBeInTheDocument();
    expect(onOrderByItemsChange).toBeCalledTimes(0);
    userEvent.click(result.getByTestId('query-builder-orderby-add-button'));
    expect(onOrderByItemsChange).toBeCalledTimes(1);
    expect(onOrderByItemsChange).toBeCalledWith([
      { name: 'foo', dir: OrderByDirection.ASC },
    ]);
  });
  it('should add and remove items when remove button clicked', () => {
    const onOrderByItemsChange = jest.fn();
    const result = render(
      <OrderByEditor
        fieldsList={[
          { value: 'foo', sortable: true },
          { value: 'bar', sortable: true },
          { value: 'baz', sortable: true },
        ]}
        orderBy={[
          { name: 'foo', dir: OrderByDirection.ASC },
          { name: 'bar', dir: OrderByDirection.ASC },
        ]}
        onOrderByItemsChange={onOrderByItemsChange}
      />
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(onOrderByItemsChange).toBeCalledTimes(0);
    userEvent.click(result.getAllByTestId('query-builder-orderby-remove-button')[1]);
    userEvent.click(result.getAllByTestId('query-builder-orderby-remove-button')[0]);
    userEvent.click(result.getAllByTestId('query-builder-orderby-inline-add-button')[0]);
    expect(onOrderByItemsChange).toBeCalledTimes(3);
    expect(onOrderByItemsChange).toHaveBeenNthCalledWith(1, [
      { name: 'foo', dir: OrderByDirection.ASC },
    ]);
    expect(onOrderByItemsChange).toHaveBeenNthCalledWith(2, [
      { name: 'bar', dir: OrderByDirection.ASC },
    ]);
    expect(onOrderByItemsChange).toHaveBeenNthCalledWith(3, [
      { name: 'foo', dir: OrderByDirection.ASC },
      { name: 'bar', dir: OrderByDirection.ASC },
      { name: 'foo', dir: OrderByDirection.ASC },
    ]);
  });
});

describe('getOrderByFields', () => {
  const sampleFields = [
    {
      name: 'field1',
      label: 'Field1',
      type: 'string',
      relationshipName: '',
      referenceTo: [],
      picklistValues: [],
      sortable: true,
    },
    {
      name: 'field11',
      label: 'Field11',
      type: 'string',
      relationshipName: '',
      referenceTo: [],
      picklistValues: [],
      sortable: false,
    },
    {
      name: 'field2',
      label: 'Field2',
      type: 'string',
      relationshipName: '',
      referenceTo: [],
      picklistValues: [],
      sortable: true,
    },
    {
      name: 'field3',
      label: 'Field3',
      type: 'string',
      relationshipName: '',
      referenceTo: [],
      picklistValues: [],
      sortable: true,
    },
  ];
  it('list view', () => {
    expect(
      getOrderByFields(
        {
          mode: BuilderMode.List,
          database: 'db',
          table: 'foo',
          fields: ['field1', 'field3'],
        },
        sampleFields
      )
    ).toStrictEqual([
      {
        label: 'Field1',
        value: 'field1',
      },
      {
        label: 'Field2',
        value: 'field2',
      },
      {
        label: 'Field3',
        value: 'field3',
      },
    ]);
  });
  it('aggregated view - no group by and no metrics', () => {
    expect(
      getOrderByFields(
        {
          mode: BuilderMode.Aggregate,
          database: 'db',
          table: 'foo',
          metrics: [],
        },
        sampleFields
      )
    ).toStrictEqual([]);
  });
  it('aggregated view - no group by and with two metrics', () => {
    expect(
      getOrderByFields(
        {
          mode: BuilderMode.Aggregate,
          database: 'db',
          table: 'foo',
          metrics: [
            { field: 'field2', aggregation: BuilderMetricFieldAggregation.Max },
            { field: 'field1', aggregation: BuilderMetricFieldAggregation.Sum },
          ],
        },
        sampleFields
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
    ]);
  });
  it('aggregated view - two group by and with no metrics', () => {
    expect(
      getOrderByFields(
        {
          mode: BuilderMode.Aggregate,
          database: 'db',
          table: 'foo',
          metrics: [],
          groupBy: ['field3', 'field1'],
        },
        sampleFields
      )
    ).toStrictEqual([
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
  it('aggregated view - two group by and with two metrics', () => {
    expect(
      getOrderByFields(
        {
          mode: BuilderMode.Aggregate,
          database: 'db',
          table: 'foo',
          metrics: [
            { field: 'field2', aggregation: BuilderMetricFieldAggregation.Max },
            { field: 'field1', aggregation: BuilderMetricFieldAggregation.Sum },
          ],
          groupBy: ['field3', 'field1'],
        },
        sampleFields
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
  it('trend view', () => {
    expect(
      getOrderByFields(
        {
          mode: BuilderMode.Trend,
          database: 'db',
          table: 'foo',
          metrics: [{ field: 'field2', aggregation: BuilderMetricFieldAggregation.Max }],
          timeField: 'field3',
          timeFieldType: 'datetime',
        },
        sampleFields
      )
    ).toStrictEqual([
      {
        label: 'Field1',
        value: 'field1',
      },
      {
        label: 'Field2',
        value: 'field2',
      },
      {
        label: 'Field3',
        value: 'field3',
      },
    ]);
  });
});
