import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Datasource } from 'data/CHDatasource';
import { generateSql } from 'data/sqlGenerator';
import { ColumnHint, Filter, FilterOperator, QueryType, SelectedColumn, TableColumn } from 'types/queryBuilder';
import { FilterPopover, getFilterValueKind, getOperatorOptions, toFilterValueOption } from './FilterPopover';
import { newMockDatasource } from '__mocks__/datasource';

const createMockDatasource = (): Datasource => {
  const datasource = {} as Datasource;
  datasource.fetchUniqueMapKeys = jest.fn(() => Promise.resolve(['mapKey']));
  datasource.fetchUniqueJSONPaths = jest.fn(() => Promise.resolve(['service.name', 'http.status_code']));
  datasource.fetchDistinctValues = jest.fn(() => Promise.resolve([]));
  datasource.fetchDistinctMapValues = jest.fn(() => Promise.resolve([]));
  return datasource;
};

const allColumns: TableColumn[] = [
  { name: 'Body', type: 'String', picklistValues: [] },
  { name: 'LogAttributes', type: 'JSON', picklistValues: [] },
  { name: 'ResourceAttributes', type: 'Map(String, String)', picklistValues: [] },
];

const renderPopover = (overrides?: {
  onAddFilter?: jest.Mock;
  onClose?: jest.Mock;
  columns?: TableColumn[];
  selectedColumns?: readonly SelectedColumn[];
  filter?: Filter;
}) => {
  const datasource = createMockDatasource();
  render(
    <FilterPopover
      datasource={datasource}
      database="default"
      table="otel_logs"
      allColumns={overrides?.columns || allColumns}
      selectedColumns={overrides?.selectedColumns}
      onAddFilter={overrides?.onAddFilter || jest.fn()}
      filter={overrides?.filter}
      onClose={overrides?.onClose || jest.fn()}
    />
  );
  return datasource;
};

// Setting the input value in one go (rather than typing) keeps the combobox's
// selected item from being re-prefixed to the typed text. Options render in a
// virtualized list that jsdom does not produce, so clicking an option is not
// possible; the first match is confirmed with the keyboard instead.
const selectColumn = async (columnName: string) => {
  const input = screen.getAllByRole('combobox')[0] as HTMLInputElement;
  await userEvent.click(input);
  fireEvent.change(input, { target: { value: columnName } });

  // The highlighted row keeps the index of the previously selected column, which
  // no longer addresses the same row once the typed text has filtered the list.
  // Step back to the first match before confirming it.
  for (let attempt = 0; attempt < 5 && !input.getAttribute('aria-activedescendant')?.endsWith('-item-0'); attempt++) {
    fireEvent.keyDown(input, { key: 'ArrowUp' });
  }
  fireEvent.keyDown(input, { key: 'Enter' });
};

describe('FilterPopover', () => {
  it('infers number filter kind from ClickHouse numeric types', () => {
    expect(getFilterValueKind('UInt64')).toBe('number');
    expect(getFilterValueKind('Nullable(Float64)')).toBe('number');
    expect(getFilterValueKind('Decimal(18, 2)')).toBe('number');
    expect(getFilterValueKind('Map(String, UInt32)')).toBe('number');
  });

  it('treats non-numeric types as string filters', () => {
    expect(getFilterValueKind('String')).toBe('string');
    expect(getFilterValueKind('LowCardinality(String)')).toBe('string');
    expect(getFilterValueKind('DateTime64(9)')).toBe('string');
    expect(getFilterValueKind('Map(String, String)')).toBe('string');
  });

  it('treats JSON columns as string filters since JSON paths are cast to Nullable(String)', () => {
    expect(getFilterValueKind('JSON')).toBe('string');
    expect(getFilterValueKind('JSON(max_dynamic_paths=100)')).toBe('string');
  });

  it('returns type-specific operator options', () => {
    expect(getOperatorOptions('number').map((option) => option.value)).toEqual([
      FilterOperator.GreaterThan,
      FilterOperator.LessThan,
      FilterOperator.GreaterThanOrEqual,
      FilterOperator.LessThanOrEqual,
      FilterOperator.Equals,
      FilterOperator.NotEquals,
      FilterOperator.IsNull,
      FilterOperator.IsNotNull,
    ]);
    expect(getOperatorOptions('string').map((option) => option.value)).toEqual([
      FilterOperator.Like,
      FilterOperator.NotLike,
      FilterOperator.Equals,
      FilterOperator.NotEquals,
      FilterOperator.IsNull,
      FilterOperator.IsNotNull,
    ]);
  });

  it('converts distinct values to selectable string values', () => {
    expect([1, 'error', true].map(toFilterValueOption)).toEqual([
      { label: '1', value: '1' },
      { label: 'error', value: 'error' },
      { label: 'true', value: 'true' },
    ]);
  });

  it('prefills an existing filter and updates it', async () => {
    const onAddFilter = jest.fn();
    const onClose = jest.fn();
    renderPopover({
      onAddFilter,
      onClose,
      filter: {
        filterType: 'custom',
        key: 'Body',
        type: 'String',
        operator: FilterOperator.Like,
        condition: 'AND',
        value: 'worker',
      },
    });

    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Update' }));

    expect(onAddFilter).toHaveBeenCalledWith({
      filterType: 'custom',
      key: 'Body',
      type: 'String',
      operator: FilterOperator.Like,
      condition: 'AND',
      value: 'worker',
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps an IN filter as an array and keeps its condition when updating without changes', async () => {
    const onAddFilter = jest.fn();
    const existingFilter: Filter = {
      filterType: 'custom',
      key: 'Body',
      type: 'String',
      operator: FilterOperator.In,
      condition: 'OR',
      value: ['payments', 'checkout'],
    };
    renderPopover({ onAddFilter, filter: existingFilter });

    await userEvent.click(screen.getByRole('button', { name: 'Update' }));

    expect(onAddFilter).toHaveBeenCalledWith(existingFilter);
    const updatedFilter = onAddFilter.mock.calls[0][0] as Filter;

    expect(() =>
      generateSql({
        database: 'default',
        table: 'otel_logs',
        queryType: QueryType.Table,
        columns: [{ name: 'Body', type: 'String' }],
        limit: 1000,
        filters: [updatedFilter],
        orderBy: [],
      })
    ).not.toThrow();
  });

  it('keeps the hint and condition when editing a hinted filter', async () => {
    const onAddFilter = jest.fn();
    const existingFilter: Filter = {
      filterType: 'custom',
      key: '',
      hint: ColumnHint.LogAttributes,
      type: 'JSON',
      operator: FilterOperator.Like,
      condition: 'OR',
      mapKey: 'event.name',
      value: 'worker',
    };
    renderPopover({
      onAddFilter,
      filter: existingFilter,
      selectedColumns: [{ name: 'LogAttributes', type: 'JSON', hint: ColumnHint.LogAttributes }],
    });

    await userEvent.click(screen.getByRole('button', { name: 'Update' }));

    expect(onAddFilter).toHaveBeenCalledWith(
      expect.objectContaining({
        key: '',
        hint: ColumnHint.LogAttributes,
        condition: 'OR',
        mapKey: 'event.name',
        value: 'worker',
      })
    );
  });

  it('drops the map key when the filter is moved to a scalar column', async () => {
    const onAddFilter = jest.fn();
    renderPopover({
      onAddFilter,
      filter: {
        filterType: 'custom',
        key: 'LogAttributes',
        type: 'JSON',
        operator: FilterOperator.Like,
        condition: 'AND',
        mapKey: 'service.name',
        value: 'worker',
      },
    });

    await selectColumn('Body');
    expect(screen.queryByText('JSON path')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Update' }));

    const updatedFilter = onAddFilter.mock.calls[0][0] as Filter;
    expect(updatedFilter).toMatchObject({ key: 'Body', type: 'String' });
    // The chip renders the map key as a suffix, so keeping it would read Body.service.name.
    expect((updatedFilter as { mapKey?: string }).mapKey).toBeUndefined();
  });

  it('keeps the map key when the column is not changed', async () => {
    const onAddFilter = jest.fn();
    renderPopover({
      onAddFilter,
      filter: {
        filterType: 'custom',
        key: 'LogAttributes',
        type: 'JSON',
        operator: FilterOperator.Like,
        condition: 'AND',
        mapKey: 'service.name',
        value: 'worker',
      },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Update' }));

    expect(onAddFilter).toHaveBeenCalledWith(expect.objectContaining({ key: 'LogAttributes', mapKey: 'service.name' }));
  });

  describe('duration rawInput', () => {
    const durationColumns: TableColumn[] = [{ name: 'Duration', type: 'UInt64', picklistValues: [] }];
    const durationFilter: Filter = {
      filterType: 'custom',
      key: 'Duration',
      type: 'UInt64',
      operator: FilterOperator.GreaterThan,
      condition: 'AND',
      value: 1_000_000_000,
      rawInput: '1s',
    };

    const setValue = (nextValue: string) => {
      const valueInput = screen.getByPlaceholderText('Type or select...');
      fireEvent.change(valueInput, { target: { value: nextValue } });
      fireEvent.keyDown(valueInput, { key: 'Enter' });
    };

    it('keeps rawInput when the value is updated without changes', async () => {
      const onAddFilter = jest.fn();
      renderPopover({ onAddFilter, columns: durationColumns, filter: durationFilter });

      await userEvent.click(screen.getByRole('button', { name: 'Update' }));

      expect(onAddFilter).toHaveBeenCalledWith(durationFilter);
    });

    it('clears rawInput when the value changes', async () => {
      const onAddFilter = jest.fn();
      renderPopover({ onAddFilter, columns: durationColumns, filter: durationFilter });

      setValue('2000000000');
      await userEvent.click(screen.getByRole('button', { name: 'Update' }));

      const updatedFilter = onAddFilter.mock.calls[0][0] as Filter;
      expect(updatedFilter).toMatchObject({ key: 'Duration', value: 2_000_000_000 });
      // A stale '1s' would make the duration editor show 1s while SQL uses 2s.
      expect((updatedFilter as { rawInput?: string }).rawInput).toBeUndefined();
    });

    it('clears rawInput when the column changes even if the value is re-entered', async () => {
      const onAddFilter = jest.fn();
      renderPopover({
        onAddFilter,
        columns: [...durationColumns, { name: 'Count', type: 'UInt64', picklistValues: [] }],
        filter: durationFilter,
      });

      await selectColumn('Count');
      setValue('1000000000');
      await userEvent.click(screen.getByRole('button', { name: 'Update' }));

      const updatedFilter = onAddFilter.mock.calls[0][0] as Filter;
      expect(updatedFilter).toMatchObject({ key: 'Count', value: 1_000_000_000 });
      expect((updatedFilter as { rawInput?: string }).rawInput).toBeUndefined();
    });
  });

  it('shows a path input and probes JSON paths when a JSON column is selected', async () => {
    const datasource = renderPopover();

    await selectColumn('LogAttributes');

    await waitFor(() =>
      expect(datasource.fetchUniqueJSONPaths).toHaveBeenCalledWith('LogAttributes', 'default', 'otel_logs', undefined)
    );
    expect(screen.getByText('JSON path')).toBeInTheDocument();
    expect(datasource.fetchUniqueMapKeys).not.toHaveBeenCalled();
  });

  it('probes JSON paths via the sibling keys column when one exists', async () => {
    const columns: TableColumn[] = [
      ...allColumns,
      { name: 'LogAttributesKeys', type: 'Array(String)', picklistValues: [] },
    ];
    const datasource = renderPopover({ columns });

    await selectColumn('LogAttributes');

    await waitFor(() =>
      expect(datasource.fetchUniqueJSONPaths).toHaveBeenCalledWith(
        'LogAttributes',
        'default',
        'otel_logs',
        'LogAttributesKeys'
      )
    );
  });

  it('still probes map keys when a Map column is selected', async () => {
    const datasource = renderPopover();

    await selectColumn('ResourceAttributes');

    await waitFor(() =>
      expect(datasource.fetchUniqueMapKeys).toHaveBeenCalledWith('ResourceAttributes', 'default', 'otel_logs')
    );
    expect(screen.getByText('Map key')).toBeInTheDocument();
    expect(datasource.fetchUniqueJSONPaths).not.toHaveBeenCalled();
  });

  it('disables Add for a JSON column until a path is set', async () => {
    renderPopover();

    await selectColumn('LogAttributes');

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();

    await userEvent.type(screen.getAllByRole('combobox')[1], 'service.name');
    await userEvent.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
  });

  it('adds a JSON filter with the selected path as mapKey and the real column type', async () => {
    const onAddFilter = jest.fn();
    const onClose = jest.fn();
    renderPopover({ onAddFilter, onClose });

    await selectColumn('LogAttributes');

    await userEvent.type(screen.getAllByRole('combobox')[1], 'service.name');
    await userEvent.keyboard('{Enter}');

    await userEvent.type(screen.getAllByRole('combobox')[3], 'grafana');
    await userEvent.keyboard('{Enter}');

    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAddFilter).toHaveBeenCalledWith({
      filterType: 'custom',
      key: 'LogAttributes',
      type: 'JSON',
      operator: FilterOperator.Like,
      condition: 'AND',
      mapKey: 'service.name',
      value: 'grafana',
    });
    expect(onClose).toHaveBeenCalled();
  });

  describe('Map columns', () => {
    const mapColumns: TableColumn[] = [{ name: 'SpanAttributes', type: 'Map(String, String)', picklistValues: [] }];

    const renderMapPopover = (onAddFilter: jest.Mock, onClose: jest.Mock) => {
      const datasource = newMockDatasource();
      jest.spyOn(datasource, 'fetchUniqueMapKeys').mockResolvedValue([]);
      jest.spyOn(datasource, 'fetchDistinctMapValues').mockResolvedValue([]);
      const result = render(
        <FilterPopover
          datasource={datasource}
          database="foo"
          table="bar"
          allColumns={mapColumns}
          onAddFilter={onAddFilter}
          onClose={onClose}
        />
      );
      return { result, datasource };
    };

    it('disables Add while a Map column has no key selected', async () => {
      const onAddFilter = jest.fn();
      const onClose = jest.fn();
      const { result, datasource } = renderMapPopover(onAddFilter, onClose);

      await userEvent.type(result.getAllByRole('combobox')[0], 'SpanAttributes');
      await userEvent.keyboard('{ArrowDown}{Enter}');
      await waitFor(() => expect(datasource.fetchUniqueMapKeys).toHaveBeenCalled());

      expect(result.getByRole('button', { name: 'Add' })).toBeDisabled();
      expect(onAddFilter).not.toHaveBeenCalled();
    });

    it('accepts a typed custom key when key discovery returns no keys', async () => {
      const onAddFilter = jest.fn();
      const onClose = jest.fn();
      const { result, datasource } = renderMapPopover(onAddFilter, onClose);

      await userEvent.type(result.getAllByRole('combobox')[0], 'SpanAttributes');
      await userEvent.keyboard('{ArrowDown}{Enter}');
      await waitFor(() => expect(datasource.fetchUniqueMapKeys).toHaveBeenCalled());

      await userEvent.type(result.getAllByRole('combobox')[1], 'http.status_code');
      await userEvent.keyboard('{Enter}');

      const addButton = result.getByRole('button', { name: 'Add' });
      expect(addButton).toBeEnabled();
      await userEvent.click(addButton);

      expect(onAddFilter).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'SpanAttributes',
          mapKey: 'http.status_code',
          type: 'Map(String, String)',
          operator: FilterOperator.Like,
        })
      );
      expect(onClose).toHaveBeenCalled();
    });
  });
});
