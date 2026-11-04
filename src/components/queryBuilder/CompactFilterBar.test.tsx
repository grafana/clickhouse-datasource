import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Datasource } from 'data/CHDatasource';
import { Filter, FilterOperator, TableColumn } from 'types/queryBuilder';
import { CompactFilterBar } from './CompactFilterBar';

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

const renderCompactFilterBar = (initialFilters: Filter[]) => {
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
        allColumns={allColumns}
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
});
