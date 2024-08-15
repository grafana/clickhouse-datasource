import React, { useState } from 'react';
import { SelectableValue } from '@grafana/data';
import { Button, HorizontalGroup, InlineFormLabel, Input, MultiSelect, RadioButtonGroup, Select } from '@grafana/ui';
import { Filter, FilterOperator, TableColumn, NullFilter } from 'types/queryBuilder';
import * as utils from 'components/queryBuilder/utils';
import labels from 'labels';
import { styles } from 'styles';
import { Datasource } from 'data/CHDatasource';
import useUniqueMapKeys from 'hooks/useUniqueMapKeys';

const boolValues: Array<SelectableValue<boolean>> = [
  { value: true, label: 'True' },
  { value: false, label: 'False' },
];
const conditions: Array<SelectableValue<'AND' | 'OR'>> = [
  { value: 'AND', label: 'AND' },
  { value: 'OR', label: 'OR' },
];
const filterOperators: Array<SelectableValue<FilterOperator>> = [
  { value: FilterOperator.WithInGrafanaTimeRange, label: 'Within dashboard time range' },
  { value: FilterOperator.OutsideGrafanaTimeRange, label: 'Outside dashboard time range' },
  { value: FilterOperator.IsAnything, label: 'IS ANYTHING' },
  { value: FilterOperator.Equals, label: '=' },
  { value: FilterOperator.NotEquals, label: '!=' },
  { value: FilterOperator.LessThan, label: '<' },
  { value: FilterOperator.LessThanOrEqual, label: '<=' },
  { value: FilterOperator.GreaterThan, label: '>' },
  { value: FilterOperator.GreaterThanOrEqual, label: '>=' },
  { value: FilterOperator.Like, label: 'LIKE' },
  { value: FilterOperator.NotLike, label: 'NOT LIKE' },
  { value: FilterOperator.IsEmpty, label: 'IS EMPTY' },
  { value: FilterOperator.IsNotEmpty, label: 'IS NOT EMPTY' },
  { value: FilterOperator.In, label: 'IN' },
  { value: FilterOperator.NotIn, label: 'NOT IN' },
  { value: FilterOperator.IsNull, label: 'IS NULL' },
  { value: FilterOperator.IsNotNull, label: 'IS NOT NULL' },
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
  key: '',
  type: '',
  operator: FilterOperator.IsAnything,
};
export interface PredefinedFilter {
  restrictToFields?: readonly TableColumn[];
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
      <Input
        data-testid="query-builder-filters-single-string-value-input"
        type="text"
        defaultValue={props.value}
        width={70}
        onBlur={(e) => props.onChange(e.currentTarget.value)}
      />
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
  allColumns: readonly TableColumn[];
  filter: Filter;
  onFilterChange: (filter: Filter) => void;
}) => {
  const { filter, onFilterChange, allColumns: fieldsList } = props;
  const getOptions = () => {
    const matchedFilter = fieldsList.find((f) => f.name === filter.key);
    return matchedFilter?.picklistValues || [];
  };
  if (utils.isNullFilter(filter)) {
    return <></>;
  } else if ([FilterOperator.IsAnything, FilterOperator.IsEmpty, FilterOperator.IsNotEmpty].includes(filter.operator)) {
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
    if (utils.isDateFilterWithOutValue(filter)) {
      return null;
    }

    const onDateFilterValueChange = (value: string) => {
      onFilterChange({ ...filter, value });
    };
    const dateOptions = [...standardTimeOptions];
    if (filter.value && !standardTimeOptions.find(o => o.value === filter.value)) {
      dateOptions.push({ label: filter.value, value: filter.value });
    }

    return (
      <div data-testid="query-builder-filters-date-value-container">
        <Select
          value={filter.value || 'TODAY'}
          onChange={e => onDateFilterValueChange(e.value!)}
          options={dateOptions}
          width={40}
          allowCustomValue
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
  allColumns: readonly TableColumn[];
  index: number;
  filter: Filter & PredefinedFilter;
  onFilterChange: (index: number, filter: Filter) => void;
  removeFilter: (index: number) => void;
  datasource: Datasource;
  database: string;
  table: string;
}) => {
  const { index, filter, allColumns: fieldsList, onFilterChange, removeFilter } = props;
  const [isOpen, setIsOpen] = useState(false);
  const isMapType = filter.type.startsWith('Map');
  const mapKeys = useUniqueMapKeys(props.datasource, isMapType ? filter.key : '', props.database, props.table);
  const mapKeyOptions = mapKeys.map(k => ({ label: k, value: k }));
  if (filter.mapKey && !mapKeys.includes(filter.mapKey)) {
    mapKeyOptions.push({ label: filter.mapKey, value: filter.mapKey });
  }

  const getFields = () => {
    const values = (filter.restrictToFields || fieldsList).map(f => {
      let label = f.label || f.name;
      if (f.type.startsWith('Map')) {
        label += '[]';
      }

      return { label, value: f.name };
    });
    // Add selected value to the list if it does not exist.
    if (filter?.key && !values.find((x) => x.value === filter.key)) {
      values.push({ label: filter.label || filter.key!, value: filter.key! });
    }
    return values;
  };
  const getFilterOperatorsByType = (type = 'string'): Array<SelectableValue<FilterOperator>> => {
    if (utils.isBooleanType(type)) {
      return filterOperators.filter((f) => [FilterOperator.Equals, FilterOperator.NotEquals].includes(f.value!));
    } else if (utils.isNumberType(type)) {
      return filterOperators.filter((f) =>
        [
          FilterOperator.IsAnything,
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
          FilterOperator.IsAnything,
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
          FilterOperator.IsAnything,
          FilterOperator.Like,
          FilterOperator.NotLike,
          FilterOperator.In,
          FilterOperator.NotIn,
          FilterOperator.IsNull,
          FilterOperator.IsNotNull,
          FilterOperator.Equals,
          FilterOperator.NotEquals,
          FilterOperator.IsEmpty,
          FilterOperator.IsNotEmpty,
          FilterOperator.LessThan,
          FilterOperator.LessThanOrEqual,
          FilterOperator.GreaterThan,
          FilterOperator.GreaterThanOrEqual,
        ].includes(f.value!)
      );
    }
  };
  const onFilterNameChange = (fieldName: string) => {
    setIsOpen(false);
    const matchingField = fieldsList.find(f => f.name === fieldName);
    const filterData = {
      key: matchingField?.name || fieldName,
      type: matchingField?.type || 'String',
      label: matchingField?.label,
    };

    let newFilter: Filter & PredefinedFilter;
    // this is an auto-generated TimeRange filter
    if (filter.restrictToFields) {
      newFilter = {
        filterType: 'custom',
        key: filterData.key || filter.key,
        type: 'datetime',
        condition: filter.condition || 'AND',
        operator: FilterOperator.WithInGrafanaTimeRange,
        restrictToFields: filter.restrictToFields,
        label: filterData.label,
      };
    } else if (utils.isBooleanType(filterData.type)) {
      newFilter = {
        filterType: 'custom',
        key: filterData.key,
        type: 'boolean',
        condition: filter.condition || 'AND',
        operator: FilterOperator.Equals,
        value: false,
        label: filterData.label,
      };
    } else if (utils.isDateType(filterData.type)) {
      newFilter = {
        filterType: 'custom',
        key: filterData.key,
        type: filterData.type as 'date',
        condition: filter.condition || 'AND',
        operator: FilterOperator.Equals,
        value: 'TODAY',
        label: filterData.label,
      };
    } else {
      newFilter = {
        filterType: 'custom',
        key: filterData.key,
        type: filterData.type,
        condition: filter.condition || 'AND',
        operator: FilterOperator.IsNotNull,
        label: filterData.label,
      };
    }
    onFilterChange(index, newFilter);
  };
  const onFilterMapKeyChange = (mapKey: string) => {
    const newFilter: Filter = { ...filter };
    newFilter.mapKey = mapKey;
    onFilterChange(index, newFilter);
  };
  const onFilterOperatorChange = (operator: FilterOperator) => {
    const newFilter: Filter = { ...filter };
    newFilter.operator = operator;
    if (utils.isMultiFilter(newFilter)) {
      if (!Array.isArray(newFilter.value)) {
        newFilter.value = [newFilter.value || ''];
      }
    }
    onFilterChange(index, newFilter);
  };
  const onFilterConditionChange = (condition: 'AND' | 'OR') => {
    const newFilter: Filter = { ...filter };
    newFilter.condition = condition;
    onFilterChange(index, newFilter);
  };
  const onFilterValueChange = (filter: Filter) => {
    onFilterChange(index, filter);
  };

  return (
    <HorizontalGroup wrap align="flex-start" justify="flex-start">
      {index !== 0 && (
        <RadioButtonGroup options={conditions} value={filter.condition} onChange={(e) => onFilterConditionChange(e!)} />
      )}
      <Select
        disabled={Boolean(filter.hint)}
        placeholder={filter.hint ? labels.types.ColumnHint[filter.hint] : undefined}
        value={filter.key}
        width={40}
        className={styles.Common.inlineSelect}
        options={getFields()}
        isOpen={isOpen}
        onOpenMenu={() => setIsOpen(true)}
        onCloseMenu={() => setIsOpen(false)}
        onChange={(e) => onFilterNameChange(e.value!)}
        allowCustomValue
        menuPlacement={'bottom'}
      />
      { isMapType &&
        <Select
          value={filter.mapKey}
          placeholder={labels.components.FilterEditor.mapKeyPlaceholder}
          width={40}
          className={styles.Common.inlineSelect}
          options={mapKeyOptions}
          onChange={e => onFilterMapKeyChange(e.value!)}
          allowCustomValue
          menuPlacement={'bottom'}
        />  
      }
      <Select
        value={filter.operator}
        width={40}
        className={styles.Common.inlineSelect}
        options={getFilterOperatorsByType(filter.type)}
        onChange={(e) => onFilterOperatorChange(e.value!)}
        menuPlacement={'bottom'}
      />
      <FilterValueEditor filter={filter} onFilterChange={onFilterValueChange} allColumns={fieldsList} />
      <Button
        data-testid="query-builder-filters-remove-button"
        icon="trash-alt"
        variant="destructive"
        size="sm"
        className={styles.Common.smallBtn}
        onClick={() => removeFilter(index)}
      />
    </HorizontalGroup>
  );
};

export const FiltersEditor = (props: {
  allColumns: readonly TableColumn[];
  filters: Filter[];
  onFiltersChange: (filters: Filter[]) => void;
  datasource: Datasource;
  database: string;
  table: string;
}) => {
  const { filters = [], onFiltersChange, allColumns: fieldsList = [], datasource, database, table } = props;
  const { label, tooltip, addLabel } = labels.components.FilterEditor;
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
    <>
      {filters.length === 0 && (
        <div className="gf-form">
          <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
            {label}
          </InlineFormLabel>
          <Button
            data-testid="query-builder-filters-add-button"
            icon="plus-circle"
            variant="secondary"
            size="sm"
            className={styles.Common.smallBtn}
            onClick={addFilter}
          >
            {addLabel}
          </Button>
        </div>
      )}
      {filters.map((filter, index) => {
        return (
          <div className="gf-form" key={index}>
            {index === 0 ? (
              <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
                {label}
              </InlineFormLabel>
            ) : (
              <div className={`width-8 ${styles.Common.firstLabel}`}></div>
            )}
            <FilterEditor
              allColumns={fieldsList}
              filter={filter}
              onFilterChange={onFilterChange}
              removeFilter={removeFilter}
              index={index}
              datasource={datasource}
              database={database}
              table={table}
            />
          </div>
        );
      })}
      {filters.length !== 0 && (
        <div className="gf-form">
          <div className={`width-8 ${styles.Common.firstLabel}`}></div>
          <Button
            data-testid="query-builder-filters-inline-add-button"
            icon="plus-circle"
            variant="secondary"
            size="sm"
            className={styles.Common.smallBtn}
            onClick={addFilter}
          >
            {addLabel}
          </Button>
        </div>
      )}
    </>
  );
};
