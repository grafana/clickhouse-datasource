import React, { useState } from 'react';
import { SelectableValue } from '@grafana/data';
import { Button, Input, MultiSelect, RadioButtonGroup, Select } from '@grafana/ui';
import { Filter, FilterOperator, FullField, NullFilter } from '../../types';
import * as utils from './utils';
import { selectors } from '../../selectors';
import { styles } from '../../styles';
import { EditorField, EditorFieldGroup } from '@grafana/experimental';

const boolValues: Array<SelectableValue<boolean>> = [
  { value: true, label: 'True' },
  { value: false, label: 'False' },
];
const conditions: Array<SelectableValue<'AND' | 'OR'>> = [
  { value: 'AND', label: 'AND' },
  { value: 'OR', label: 'OR' },
];
const filterOperators: Array<SelectableValue<FilterOperator>> = [
  { value: FilterOperator.Equals, label: '=' },
  { value: FilterOperator.NotEquals, label: '!=' },
  { value: FilterOperator.LessThan, label: '<' },
  { value: FilterOperator.LessThanOrEqual, label: '<=' },
  { value: FilterOperator.GreaterThan, label: '>' },
  { value: FilterOperator.GreaterThanOrEqual, label: '>=' },
  { value: FilterOperator.Like, label: 'LIKE' },
  { value: FilterOperator.NotLike, label: 'NOT LIKE' },
  { value: FilterOperator.In, label: 'IN' },
  { value: FilterOperator.NotIn, label: 'NOT IN' },
  { value: FilterOperator.IsNull, label: 'IS NULL' },
  { value: FilterOperator.IsNotNull, label: 'IS NOT NULL' },
  { value: FilterOperator.WithInGrafanaTimeRange, label: 'WITHIN DASHBOARD TIME RANGE' },
  { value: FilterOperator.OutsideGrafanaTimeRange, label: 'OUTSIDE DASHBOARD TIME RANGE' },
];
const standardTimeOptions: Array<SelectableValue<string>> = [
  { value: 'today()', label: 'TODAY' },
  { value: 'yesterday()', label: 'YESTERDAY' },
  { value: 'now()', label: 'NOW' },
  { value: 'GRAFANA_START_TIME', label: 'DASHBOARD START TIME' },
  { value: 'GRAFANA_END_TIME', label: 'DASHBOARD END TIME' },
];
export const defaultNewFilter: NullFilter = {
  filterType: 'custom',
  condition: 'AND',
  key: 'Id',
  type: 'id',
  operator: FilterOperator.IsNotNull,
};
export interface PredefinedFilter {
  restrictToFields?: FullField[];
}

const FilterValueNumberItem = (props: { value: number; onChange: (value: number) => void }) => {
  const [value, setValue] = useState(props.value || 0);
  return (
    <div data-testid="query-builder-filters-number-value-container">
      <Input
        data-testid="query-builder-filters-number-value-input"
        type="number"
        value={value}
        onChange={(e) => setValue(e.currentTarget.valueAsNumber || 0)}
        onBlur={() => props.onChange(value)}
      />
    </div>
  );
};

const FilterValueSingleStringItem = (props: { value: string; onChange: (value: string) => void }) => {
  return (
    <div data-testid="query-builder-filters-single-string-value-container">
      <Input type="text" defaultValue={props.value} onBlur={(e) => props.onChange(e.currentTarget.value)} />
    </div>
  );
};

const FilterValueMultiStringItem = (props: { value: string[]; onChange: (value: string[]) => void }) => {
  const [value, setValue] = useState(props.value || []);
  return (
    <div data-testid="query-builder-filters-multi-string-value-container">
      <Input
        type="text"
        value={value.join(',')}
        placeholder="comma separated values"
        onChange={(e) => setValue((e.currentTarget.value || '').split(','))}
        onBlur={() => props.onChange(value)}
      />
    </div>
  );
};

export const FilterValueEditor = (props: {
  fieldsList: FullField[];
  filter: Filter;
  onFilterChange: (filter: Filter) => void;
}) => {
  const { filter, onFilterChange, fieldsList } = props;
  const getOptions = () => {
    const matchedFilter = fieldsList.find((f) => f.name === filter.key);
    return matchedFilter?.picklistValues || [];
  };
  if (utils.isNullFilter(filter)) {
    return <></>;
  } else if (utils.isBooleanFilter(filter)) {
    const onBoolFilterValueChange = (value: boolean) => {
      onFilterChange({ ...filter, value });
    };
    return (
      <div data-testid="query-builder-filters-boolean-value-container">
        <RadioButtonGroup options={boolValues} value={filter.value} onChange={(e) => onBoolFilterValueChange(e!)} />
      </div>
    );
  } else if (utils.isNumberFilter(filter)) {
    return <FilterValueNumberItem value={filter.value} onChange={(value) => onFilterChange({ ...filter, value })} />;
  } else if (utils.isDateFilter(filter)) {
    const onDateFilterValueChange = (value: string) => {
      onFilterChange({ ...filter, value });
    };
    return utils.isDateFilterWithOutValue(filter) ? null : (
      <div data-testid="query-builder-filters-date-value-container">
        <Select
          value={filter.value || 'TODAY'}
          onChange={(e) => onDateFilterValueChange(e.value!)}
          options={[...standardTimeOptions]}
        />
      </div>
    );
  } else if (utils.isStringFilter(filter)) {
    const onStringFilterValueChange = (value: string) => {
      onFilterChange({ ...filter, value });
    };
    if (
      filter.type === 'picklist' &&
      (filter.operator === FilterOperator.Equals || filter.operator === FilterOperator.NotEquals)
    ) {
      return (
        <div data-testid="query-builder-filters-single-picklist-value-container">
          <Select value={filter.value} onChange={(e) => onStringFilterValueChange(e.value!)} options={getOptions()} />
        </div>
      );
    }

    return (
      <FilterValueSingleStringItem
        value={filter.value}
        onChange={onStringFilterValueChange}
        // enforce input re-render when filter changes to avoid stale input value
        key={filter.value}
      />
    );
  } else if (utils.isMultiFilter(filter)) {
    const onMultiFilterValueChange = (value: string[]) => {
      onFilterChange({ ...filter, value });
    };
    if (filter.type === 'picklist') {
      return (
        <div data-testid="query-builder-filters-multi-picklist-value-container">
          <MultiSelect
            value={filter.value}
            options={getOptions()}
            onChange={(e) => onMultiFilterValueChange(e.map((v) => v.value!))}
          />
        </div>
      );
    }
    return <FilterValueMultiStringItem value={filter.value} onChange={onMultiFilterValueChange} />;
  } else {
    return <></>;
  }
};

export const FilterEditor = (props: {
  fieldsList: FullField[];
  index: number;
  filter: Filter & PredefinedFilter;
  onFilterChange: (index: number, filter: Filter) => void;
}) => {
  const { index, filter, fieldsList, onFilterChange } = props;
  const [isOpen, setIsOpen] = useState(false);
  const getFields = () => {
    const values = (filter.restrictToFields || fieldsList).map((f) => {
      return { label: f.label, value: f.name };
    });
    // Add selected value to the list if it does not exist.
    if (filter?.key && !values.find((x) => x.value === filter.key)) {
      values.push({ label: filter.key!, value: filter.key! });
    }
    return values;
  };
  const getFilterOperatorsByType = (type = 'string'): Array<SelectableValue<FilterOperator>> => {
    if (utils.isBooleanType(type)) {
      return filterOperators.filter((f) => [FilterOperator.Equals, FilterOperator.NotEquals].includes(f.value!));
    } else if (utils.isNumberType(type)) {
      return filterOperators.filter((f) =>
        [
          FilterOperator.IsNull,
          FilterOperator.IsNotNull,
          FilterOperator.Equals,
          FilterOperator.NotEquals,
          FilterOperator.LessThan,
          FilterOperator.LessThanOrEqual,
          FilterOperator.GreaterThan,
          FilterOperator.GreaterThanOrEqual,
        ].includes(f.value!)
      );
    } else if (utils.isDateType(type)) {
      return filterOperators.filter((f) =>
        [
          FilterOperator.IsNull,
          FilterOperator.IsNotNull,
          FilterOperator.Equals,
          FilterOperator.NotEquals,
          FilterOperator.LessThan,
          FilterOperator.LessThanOrEqual,
          FilterOperator.GreaterThan,
          FilterOperator.GreaterThanOrEqual,
          FilterOperator.WithInGrafanaTimeRange,
          FilterOperator.OutsideGrafanaTimeRange,
        ].includes(f.value!)
      );
    } else {
      return filterOperators.filter((f) =>
        [
          FilterOperator.IsNull,
          FilterOperator.IsNotNull,
          FilterOperator.Equals,
          FilterOperator.NotEquals,
          FilterOperator.Like,
          FilterOperator.NotLike,
          FilterOperator.In,
          FilterOperator.NotIn,
        ].includes(f.value!)
      );
    }
  };
  const onFilterNameChange = (fieldName: string) => {
    setIsOpen(false);
    const matchingField = fieldsList.find((f) => f.name === fieldName);
    let filterData: { key: string; type: string } | null = null;

    if (matchingField) {
      filterData = {
        key: matchingField.name,
        type: matchingField.type,
      };
    } else {
      // In case user wants to add a custom filter for the
      // field with `Map` type (e.g. colName['keyName'])
      // More info: https://clickhouse.com/docs/en/sql-reference/data-types/map/
      const matchingMapField = fieldsList.find((f) => {
        return (
          f.type.startsWith('Map') &&
          fieldName.startsWith(f.name) &&
          new RegExp(`^${f.name}\\[['"].+['"]\\]$`).test(fieldName)
        );
      });

      if (matchingMapField) {
        // Getting the field type. Example: getting `UInt64` from `Map(String, UInt64)`.
        const mapFieldType = /^Map\(\w+, (\w+)\)$/.exec(matchingMapField.type)?.[1];

        if (mapFieldType) {
          filterData = {
            key: fieldName,
            type: mapFieldType,
          };
        }
      }
    }

    if (!filterData) {
      return;
    }

    let newFilter: Filter & PredefinedFilter;
    // this is an auto-generated TimeRange filter
    if (filter.restrictToFields) {
      newFilter = {
        filterType: 'custom',
        key: filterData.key,
        type: 'datetime',
        condition: filter.condition || 'AND',
        operator: FilterOperator.WithInGrafanaTimeRange,
        restrictToFields: filter.restrictToFields,
      };
    } else if (utils.isBooleanType(filterData.type)) {
      newFilter = {
        filterType: 'custom',
        key: filterData.key,
        type: 'boolean',
        condition: filter.condition || 'AND',
        operator: FilterOperator.Equals,
        value: false,
      };
    } else if (utils.isDateType(filterData.type)) {
      newFilter = {
        filterType: 'custom',
        key: filterData.key,
        type: filterData.type as 'date',
        condition: filter.condition || 'AND',
        operator: FilterOperator.Equals,
        value: 'TODAY',
      };
    } else {
      newFilter = {
        filterType: 'custom',
        key: filterData.key,
        type: filterData.type,
        condition: filter.condition || 'AND',
        operator: FilterOperator.IsNotNull,
      };
    }
    onFilterChange(index, newFilter);
  };
  const onFilterOperatorChange = (operator: FilterOperator) => {
    let newFilter: Filter = filter;
    newFilter.operator = operator;
    if (utils.isMultiFilter(newFilter)) {
      if (!Array.isArray(newFilter.value)) {
        newFilter.value = [newFilter.value || ''];
      }
    }
    onFilterChange(index, newFilter);
  };
  const onFilterConditionChange = (condition: 'AND' | 'OR') => {
    let newFilter: Filter = filter;
    newFilter.condition = condition;
    onFilterChange(index, newFilter);
  };
  const onFilterValueChange = (filter: Filter) => {
    onFilterChange(index, filter);
  };
  return (
    <EditorFieldGroup>
      {index !== 0 && (
        <RadioButtonGroup options={conditions} value={filter.condition} onChange={(e) => onFilterConditionChange(e!)} />
      )}
      <Select
        value={filter.key}
        width={30}
        options={getFields()}
        isOpen={isOpen}
        onOpenMenu={() => setIsOpen(true)}
        onCloseMenu={() => setIsOpen(false)}
        onChange={(e) => onFilterNameChange(e.value!)}
        allowCustomValue={true}
      />
      <Select
        value={filter.operator}
        width={30}
        options={getFilterOperatorsByType(filter.type)}
        onChange={(e) => onFilterOperatorChange(e.value!)}
      />
      <FilterValueEditor filter={filter} onFilterChange={onFilterValueChange} fieldsList={fieldsList} />
    </EditorFieldGroup>
  );
};

export const FiltersEditor = (props: {
  fieldsList: FullField[];
  filters: Filter[];
  onFiltersChange: (filters: Filter[]) => void;
}) => {
  const { filters = [], onFiltersChange, fieldsList = [] } = props;
  const { label, tooltip, AddLabel, RemoveLabel } = selectors.components.QueryEditor.QueryBuilder.WHERE;
  const addFilter = () => {
    onFiltersChange([...filters, { ...defaultNewFilter }]);
  };
  const removeFilter = (index: number) => {
    const newFilters = [...filters];
    newFilters.splice(index, 1);
    onFiltersChange(newFilters);
  };
  const onFilterChange = (index: number, filter: Filter) => {
    const newFilters = [...filters];
    newFilters[index] = filter;
    onFiltersChange(newFilters);
  };
  return (
    <EditorField tooltip={tooltip} label={label}>
      <EditorFieldGroup>
        {filters.map((filter, index) => {
          return (
            <div className="gf-form" key={index}>
              <FilterEditor fieldsList={fieldsList} filter={filter} onFilterChange={onFilterChange} index={index} />
              <Button
                data-testid="query-builder-filters-remove-button"
                icon="trash-alt"
                variant="destructive"
                size="sm"
                className={styles.Common.smallBtn}
                onClick={() => removeFilter(index)}
              >
                {RemoveLabel}
              </Button>
            </div>
          );
        })}
        <Button
          data-testid="query-builder-filters-add-button"
          icon="plus-circle"
          variant="secondary"
          size="sm"
          className={styles.Common.smallBtn}
          onClick={addFilter}
        >
          {AddLabel}
        </Button>
      </EditorFieldGroup>
    </EditorField>
  );
};
