import React from 'react';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterOperator, TableColumn } from 'types/queryBuilder';
import { FilterPopover, getFilterValueKind, getOperatorOptions, toFilterValueOption } from './FilterPopover';
import { newMockDatasource } from '__mocks__/datasource';

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
