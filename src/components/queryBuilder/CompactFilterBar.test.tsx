import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Datasource } from 'data/CHDatasource';
import { Filter, FilterOperator, TableColumn, TimeUnit } from 'types/queryBuilder';
import { CompactFilterBar } from './CompactFilterBar';
import { FilterValueEditor } from './FilterEditor';

const allColumns: TableColumn[] = [{ name: 'ServiceName', type: 'String', picklistValues: [] }];

const createMockDatasource = (): Datasource => {
  const datasource = {} as Datasource;
  datasource.fetchUniqueMapKeys = jest.fn(() => Promise.resolve([]));
  datasource.fetchUniqueJSONPaths = jest.fn(() => Promise.resolve([]));
  datasource.fetchDistinctValues = jest.fn(() => Promise.resolve([]));
  datasource.fetchDistinctMapValues = jest.fn(() => Promise.resolve([]));
  return datasource;
};

const createFilter = (value: string): Filter => ({
  filterType: 'custom',
  key: 'ServiceName',
  type: 'String',
  operator: FilterOperator.Equals,
  condition: 'AND',
  value,
});

const renderCompactFilterBar = (initialFilters: Filter[], columns: TableColumn[] = allColumns) => {
  const onFiltersChange = jest.fn();
  const datasource = createMockDatasource();

  const Harness = () => {
    const [filters, setFilters] = useState(initialFilters);
    return (
      <CompactFilterBar
        datasource={datasource}
        database="default"
        table="otel_logs"
        filters={filters}
        allColumns={columns}
        onFiltersChange={(nextFilters) => {
          setFilters(nextFilters);
          onFiltersChange(nextFilters);
        }}
      />
    );
  };

  render(<Harness />);
  return { onFiltersChange };
};

describe('CompactFilterBar', () => {
  // Rendering Grafana comboboxes in jsdom is slow, so the 5s default is too tight here.
  jest.setTimeout(30000);

  it('opens the edit popover with Enter and Space on a filter chip', async () => {
    renderCompactFilterBar([createFilter('payments')]);

    const chip = screen.getByRole('button', { name: 'Edit filter ServiceName = payments' });
    expect(chip).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(chip, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit filter ServiceName = payments' }), { key: ' ' });
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
  });

  it('keeps editing the same filter when an earlier chip is removed', async () => {
    const { onFiltersChange } = renderCompactFilterBar([
      createFilter('payments'),
      createFilter('checkout'),
      createFilter('inventory'),
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Edit filter ServiceName = checkout' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter ServiceName = payments' }));

    // Without remapping the edited index the popover would switch to the filter
    // that slid into the removed chip's position.
    const getValueInput = () => screen.getByPlaceholderText('Type or select...') as HTMLInputElement;
    await waitFor(() => expect(getValueInput().value).toBe('checkout'));

    await userEvent.click(screen.getByRole('button', { name: 'Update' }));

    const updatedFilters = onFiltersChange.mock.lastCall?.[0] as Filter[];
    expect(updatedFilters).toHaveLength(2);
    expect(updatedFilters[0]).toMatchObject({ key: 'ServiceName', value: 'checkout' });
    expect(updatedFilters[1]).toMatchObject({ key: 'ServiceName', value: 'inventory' });
  });

  it('clears a stale duration rawInput so the full editor shows the edited value', async () => {
    const durationFilter: Filter = {
      filterType: 'custom',
      key: 'Duration',
      type: 'UInt64',
      operator: FilterOperator.GreaterThan,
      condition: 'AND',
      value: 1_000_000_000,
      rawInput: '1s',
    };
    const { onFiltersChange } = renderCompactFilterBar([durationFilter], [
      { name: 'Duration', type: 'UInt64', picklistValues: [] },
    ]);

    await userEvent.click(screen.getByRole('button', { name: /Edit filter Duration/ }));

    const valueInput = screen.getByPlaceholderText('Type or select...');
    fireEvent.change(valueInput, { target: { value: '2000000000' } });
    fireEvent.keyDown(valueInput, { key: 'Enter' });
    await userEvent.click(screen.getByRole('button', { name: 'Update' }));

    const [updatedFilter] = onFiltersChange.mock.lastCall?.[0] as Filter[];
    expect(updatedFilter).toMatchObject({ value: 2_000_000_000 });

    // Reopening the classic editor must show the new value instead of the stale '1s'.
    render(
      <FilterValueEditor
        allColumns={[]}
        filter={updatedFilter}
        onFilterChange={jest.fn()}
        durationFilterContext={{ columnKey: 'Duration', unit: TimeUnit.Nanoseconds }}
      />
    );
    expect(screen.getByTestId('query-builder-filters-duration-value-input')).toHaveValue('2000000000ns');
  });
});
