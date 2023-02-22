import React from 'react';
import { fireEvent, render, RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultNewFilter, FilterEditor, FiltersEditor, FilterValueEditor, RestrictedFilter } from './Filters';
import { selectors } from '../../selectors';
import { BooleanFilter, DateFilter, Filter, FilterOperator, MultiFilter, NumberFilter, StringFilter } from 'types';

describe('FiltersEditor', () => {
  describe('FiltersEditor', () => {
    const tableName = 'my_table';
    beforeAll(() => {
      jest.resetAllMocks();
    });
    it('renders correctly', () => {
      const onFiltersChange = jest.fn();
      const result = render(
        <FiltersEditor fieldsList={[]} filters={[]} onFiltersChange={onFiltersChange} tableName={tableName} />
      );
      expect(result.container.firstChild).not.toBeNull();
      expect(result.getAllByText(selectors.components.QueryEditor.QueryBuilder.WHERE.label).length).toBe(1);
      expect(result.getByTestId('query-builder-filters-add-button')).toBeInTheDocument();
      expect(onFiltersChange).toBeCalledTimes(0);
      userEvent.click(result.getByTestId('query-builder-filters-add-button'));
      expect(onFiltersChange).toBeCalledTimes(1);
      expect(onFiltersChange).toHaveBeenCalledWith([defaultNewFilter]);
    });
    it('should render buttons and labels correctly', () => {
      const filters: Filter[] = [
        {
          filterType: 'custom',
          condition: 'AND',
          key: 'StageName',
          type: 'string',
          operator: FilterOperator.IsNotNull,
        },
        {
          filterType: 'custom',
          condition: 'AND',
          key: 'Type',
          type: 'string',
          operator: FilterOperator.IsNotNull,
        },
      ];
      const result = render(
        <FiltersEditor fieldsList={[]} filters={filters} onFiltersChange={() => {}} tableName={tableName} />
      );
      assertRenderResultWithFilters(result, filters);
    });
    it('should call the onFiltersChange with correct args', () => {
      const filters: Filter[] = [
        {
          filterType: 'custom',
          condition: 'AND',
          key: 'StageName',
          type: 'string',
          operator: FilterOperator.IsNotNull,
        },
        {
          filterType: 'custom',
          condition: 'AND',
          key: 'Type',
          type: 'string',
          operator: FilterOperator.IsNotNull,
        },
      ];
      const onFiltersChange = jest.fn();
      const result = render(
        <FiltersEditor fieldsList={[]} filters={filters} onFiltersChange={onFiltersChange} tableName={tableName} />
      );
      assertRenderResultWithFilters(result, filters);
      userEvent.click(result.getByTestId('query-builder-filters-inline-add-button'));
      expect(onFiltersChange).toBeCalledTimes(1);
      expect(onFiltersChange).toHaveBeenNthCalledWith(1, [...filters, defaultNewFilter]);
      userEvent.click(result.getAllByTestId('query-builder-filters-remove-button')[0]);
      expect(onFiltersChange).toBeCalledTimes(2);
      expect(onFiltersChange).toHaveBeenNthCalledWith(2, [filters[1]]);
    });
    it('should add a predefined TimeRange filter if we have at least one datetime column', async () => {
      const onFiltersChange = jest.fn();
      jest.useFakeTimers();
      jest.spyOn(global, 'setTimeout');
      const dateTimeField = { label: 'Created', name: 'created', type: 'datetime', picklistValues: [] };
      const result = render(
        <FiltersEditor
          fieldsList={[
            { label: 'col1', name: 'col1', type: 'string', picklistValues: [] },
            { label: 'col2', name: 'col2', type: 'string', picklistValues: [] },
            dateTimeField,
          ]}
          filters={[]}
          onFiltersChange={onFiltersChange}
          tableName={tableName}
        />
      );
      const filters: Array<Filter & RestrictedFilter> = [
        {
          filterType: 'custom',
          condition: 'AND',
          key: 'created',
          type: 'datetime',
          operator: FilterOperator.WithInGrafanaTimeRange,
          restrictToFields: [dateTimeField],
          restrictToOperators: [FilterOperator.WithInGrafanaTimeRange],
        },
      ];
      jest.runAllTimers();
      assertRenderResultWithFilters(result, filters);
      expect(onFiltersChange).toBeCalledTimes(1);
      expect(onFiltersChange).toHaveBeenNthCalledWith(1, [...filters]);
    });

    function assertRenderResultWithFilters(result: RenderResult, filters: Filter[]) {
      expect(result.container.firstChild).not.toBeNull();
      expect(result.getAllByText(selectors.components.QueryEditor.QueryBuilder.WHERE.label).length).toBe(1);
      expect(result.queryByTestId('query-builder-filters-add-button')).not.toBeInTheDocument();
      expect(result.getByTestId('query-builder-filters-inline-add-button')).toBeInTheDocument();
      expect(result.getAllByTestId('query-builder-filters-inline-add-button').length).toBe(1);
      expect(result.getAllByTestId('query-builder-filters-remove-button').length).toBe(filters.length);
    }
  });
  describe('FilterEditor', () => {
    it('renders correctly', () => {
      const result = render(
        <FilterEditor
          fieldsList={[]}
          filter={{
            key: 'foo',
            operator: FilterOperator.IsNotNull,
            type: 'boolean',
            condition: 'AND',
            filterType: 'custom',
          }}
          index={0}
          onFilterChange={() => {}}
        />
      );
      expect(result.container.firstChild).not.toBeNull();
    });
    it('should have all provided fields in the select', () => {
      const result = render(
        <FilterEditor
          fieldsList={[
            { label: 'col1', name: 'col1', type: 'string', picklistValues: [] },
            { label: 'col2', name: 'col2', type: 'string', picklistValues: [] },
            { label: 'col3', name: 'col3', type: 'string', picklistValues: [] },
          ]}
          filter={{
            key: 'foo',
            operator: FilterOperator.IsNotNull,
            type: 'boolean',
            condition: 'AND',
            filterType: 'custom',
          }}
          index={0}
          onFilterChange={() => {}}
        />
      );

      // expand the `fieldName` select box
      userEvent.type(result.getAllByRole('combobox')[0], '{ArrowDown}');

      expect(result.getByText('col1')).toBeInTheDocument();
      expect(result.getByText('col2')).toBeInTheDocument();
      expect(result.getByText('col3')).toBeInTheDocument();
    });
    it('should call onFilterChange when user adds correct custom filter for the field with Map type', () => {
      const onFilterChange = jest.fn();
      const result = render(
        <FilterEditor
          fieldsList={[{ label: 'colName', name: 'colName', type: 'Map(String, UInt64)', picklistValues: [] }]}
          filter={{
            key: 'foo',
            type: 'boolean',
            operator: FilterOperator.IsNotNull,
            condition: 'AND',
            filterType: 'custom',
          }}
          index={0}
          onFilterChange={onFilterChange}
        />
      );

      // type into the `fieldName` select box
      userEvent.type(result.getAllByRole('combobox')[0], `colName[['keyName']`);
      userEvent.keyboard('{Enter}');

      const expectedFilter: Filter = {
        key: `colName['keyName']`,
        type: 'UInt64',
        operator: FilterOperator.IsNotNull,
        condition: 'AND',
        filterType: 'custom',
      };

      expect(onFilterChange).toHaveBeenCalledWith(0, expectedFilter);
    });
    it('should not call onFilterChange when user adds incorrect custom filter', async () => {
      const onFilterChange = jest.fn();
      const result = render(
        <FilterEditor
          fieldsList={[{ label: 'mapField', name: 'mapField', type: 'Map(String, UInt64)', picklistValues: [] }]}
          filter={{
            key: 'foo',
            type: 'boolean',
            operator: FilterOperator.IsNotNull,
            condition: 'AND',
            filterType: 'custom',
          }}
          index={0}
          onFilterChange={onFilterChange}
        />
      );

      // type into the `fieldName` select box
      userEvent.type(result.getAllByRole('combobox')[0], `mapField__key`);
      userEvent.keyboard('{Enter}');

      expect(onFilterChange).not.toHaveBeenCalled();
    });
  });
  describe('FilterValueEditor', () => {
    it('should render nothing for null operator', () => {
      const result = render(
        <FilterValueEditor
          fieldsList={[]}
          filter={{
            key: 'foo',
            operator: FilterOperator.IsNotNull,
            type: 'boolean',
            condition: 'AND',
            filterType: 'custom',
          }}
          onFilterChange={() => {}}
        />
      );
      expect(result.container.firstChild).toBeNull();
    });
    it('should render radio button with value for boolean operator', () => {
      const filter: BooleanFilter = {
        key: 'IsDeleted',
        operator: FilterOperator.Equals,
        type: 'boolean',
        condition: 'AND',
        value: true,
        filterType: 'custom',
      };
      const onFilterChange = jest.fn();
      const result = render(<FilterValueEditor fieldsList={[]} filter={filter} onFilterChange={onFilterChange} />);
      expect(result.container.firstChild).not.toBeNull();
      expect(result.getByTestId('query-builder-filters-boolean-value-container')).toBeInTheDocument();
      expect(result.getByLabelText('True')).toBeChecked();
      userEvent.click(result.getByLabelText('False'));
      expect(onFilterChange).toHaveBeenCalledTimes(1);
      expect(onFilterChange).toHaveBeenNthCalledWith(1, { ...filter, value: false });
    });
    it('should render number filter with value for number operator', () => {
      const filter: NumberFilter = {
        filterType: 'custom',
        key: 'Amount',
        operator: FilterOperator.GreaterThanOrEqual,
        type: 'int',
        condition: 'AND',
        value: 123,
      };
      const onFilterChange = jest.fn();
      const result = render(<FilterValueEditor fieldsList={[]} filter={filter} onFilterChange={onFilterChange} />);
      expect(result.container.firstChild).not.toBeNull();
      expect(result.getByTestId('query-builder-filters-number-value-container')).toBeInTheDocument();
      expect(result.getByTestId('query-builder-filters-number-value-input')).toBeInTheDocument();
      userEvent.clear(result.getByTestId('query-builder-filters-number-value-input'));
      userEvent.type(result.getByTestId('query-builder-filters-number-value-input'), '300');
      fireEvent.blur(result.getByTestId('query-builder-filters-number-value-input'));
      expect(onFilterChange).toHaveBeenCalledTimes(1);
    });
    it('should render nothing for date operator with grafana time range', () => {
      const filter: DateFilter = {
        filterType: 'custom',
        key: 'CreatedDate',
        operator: FilterOperator.WithInGrafanaTimeRange,
        type: 'datetime',
        condition: 'AND',
      };
      const onFilterChange = jest.fn();
      const result = render(<FilterValueEditor fieldsList={[]} filter={filter} onFilterChange={onFilterChange} />);
      expect(result.container.firstChild).toBeNull();
    });
    it('should render date filter with value for date operator with time range', () => {
      const filter: DateFilter = {
        filterType: 'custom',
        key: 'CreatedDate',
        operator: FilterOperator.Equals,
        type: 'datetime',
        condition: 'AND',
        value: 'now()',
      };
      const onFilterChange = jest.fn();
      const result = render(<FilterValueEditor fieldsList={[]} filter={filter} onFilterChange={onFilterChange} />);
      expect(result.container.firstChild).not.toBeNull();
      expect(result.getByTestId('query-builder-filters-date-value-container')).toBeInTheDocument();
      expect(result.getByText('NOW')).toBeInTheDocument();
    });
    it('should render select filter for single value picklist', () => {
      const filter: StringFilter = {
        filterType: 'custom',
        key: 'StageName',
        operator: FilterOperator.Equals,
        type: 'picklist',
        condition: 'AND',
        value: 'Deal won',
      };
      const onFilterChange = jest.fn();
      const result = render(
        <FilterValueEditor
          fieldsList={[
            {
              name: 'StageName',
              type: 'picklist',
              label: 'Stage Name',
              picklistValues: [
                { value: 'Deal won', label: 'Deal Won' },
                { value: 'Deal lost', label: 'Deal Lost' },
                { value: 'discovery', label: 'Discovery' },
              ],
            },
          ]}
          filter={filter}
          onFilterChange={onFilterChange}
        />
      );
      expect(result.container.firstChild).not.toBeNull();
      expect(result.getByTestId('query-builder-filters-single-picklist-value-container')).toBeInTheDocument();
      expect(result.getByText('Deal Won')).toBeInTheDocument();
      expect(result.queryByText('Discovery')).not.toBeInTheDocument();
    });
    it('should render select filter for multi value picklist', () => {
      const filter: MultiFilter = {
        filterType: 'custom',
        key: 'StageName',
        operator: FilterOperator.In,
        type: 'picklist',
        condition: 'AND',
        value: ['Deal won', 'Deal lost'],
      };
      const onFilterChange = jest.fn();
      const result = render(
        <FilterValueEditor
          fieldsList={[
            {
              name: 'StageName',
              type: 'picklist',
              label: 'Stage Name',
              picklistValues: [
                { value: 'Deal won', label: 'Deal Won' },
                { value: 'Deal lost', label: 'Deal Lost' },
                { value: 'discovery', label: 'Discovery' },
              ],
            },
          ]}
          filter={filter}
          onFilterChange={onFilterChange}
        />
      );
      expect(result.container.firstChild).not.toBeNull();
      expect(result.getByTestId('query-builder-filters-multi-picklist-value-container')).toBeInTheDocument();
      expect(result.getByText('Deal Won')).toBeInTheDocument();
      expect(result.getByText('Deal Lost')).toBeInTheDocument();
      expect(result.queryByText('Discovery')).not.toBeInTheDocument();
    });
    it('should render input filter for single value string', () => {
      const filter: StringFilter = {
        filterType: 'custom',
        key: 'Name',
        operator: FilterOperator.Equals,
        type: 'string',
        condition: 'AND',
        value: 'ABC Corp',
      };
      const onFilterChange = jest.fn();
      const result = render(<FilterValueEditor fieldsList={[]} filter={filter} onFilterChange={onFilterChange} />);
      expect(result.container.firstChild).not.toBeNull();
      expect(result.getByTestId('query-builder-filters-single-string-value-container')).toBeInTheDocument();
    });
    it('should render input filter for multi value string', () => {
      const filter: MultiFilter = {
        filterType: 'custom',
        key: 'Name',
        operator: FilterOperator.In,
        type: 'string',
        condition: 'AND',
        value: ['ABC Corp'],
      };
      const onFilterChange = jest.fn();
      const result = render(<FilterValueEditor fieldsList={[]} filter={filter} onFilterChange={onFilterChange} />);
      expect(result.container.firstChild).not.toBeNull();
      expect(result.getByTestId('query-builder-filters-multi-string-value-container')).toBeInTheDocument();
    });
  });
});
