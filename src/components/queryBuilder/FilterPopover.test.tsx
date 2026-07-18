import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Datasource } from 'data/CHDatasource';
import { FilterOperator, TableColumn } from 'types/queryBuilder';
import { FilterPopover, getFilterValueKind, getOperatorOptions, toFilterValueOption } from './FilterPopover';

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

const renderPopover = (overrides?: { onAddFilter?: jest.Mock; onClose?: jest.Mock; columns?: TableColumn[] }) => {
  const datasource = createMockDatasource();
  render(
    <FilterPopover
      datasource={datasource}
      database="default"
      table="otel_logs"
      allColumns={overrides?.columns || allColumns}
      onAddFilter={overrides?.onAddFilter || jest.fn()}
      onClose={overrides?.onClose || jest.fn()}
    />
  );
  return datasource;
};

// Typing highlights the first (exact) match, so a plain Enter selects it. The
// options list uses virtual scrolling and does not render in jsdom, so
// clicking an option is not possible here.
const selectColumn = async (columnName: string) => {
  await userEvent.type(screen.getAllByRole('combobox')[0], columnName);
  await userEvent.keyboard('{Enter}');
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
});
