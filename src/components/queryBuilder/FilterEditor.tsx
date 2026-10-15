import React, { useCallback, useRef, useState } from 'react';
import { SelectableValue } from '@grafana/data';
import {
  Button,
  Combobox,
  ComboboxOption,
  InlineField,
  InlineFormLabel,
  Input,
  MultiCombobox,
  RadioButtonGroup,
  Stack,
} from '@grafana/ui';
import {
  Filter,
  FilterOperator,
  TableColumn,
  NullFilter,
  TimeUnit,
  ColumnHint,
  NumberFilter,
  SelectedColumn,
} from 'types/queryBuilder';
import * as utils from 'components/queryBuilder/utils';
import labels from 'labels';
import { styles } from 'styles';
import { Datasource } from 'data/CHDatasource';
import { getHintedFilterColumn, getTimeFilterColumn, isStringType } from 'data/sqlGenerator';
import useUniqueMapKeys from 'hooks/useUniqueMapKeys';
import useUniqueJSONPaths from 'hooks/useUniqueJSONPaths';
import { getFilterOperatorsByType } from './filterOperatorOptions';
import { DurationFilterInput } from './DurationFilterInput';

const boolValues: Array<SelectableValue<boolean>> = [
  { value: true, label: 'True' },
  { value: false, label: 'False' },
];
const conditions: Array<SelectableValue<'AND' | 'OR'>> = [
  { value: 'AND', label: 'AND' },
  { value: 'OR', label: 'OR' },
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

/**
 * Context enabling a human-friendly duration input for a specific numeric
 * column (currently the trace Duration column). When provided, filters
 * matching `columnKey` or hinted `TraceDurationTime` render
 * `DurationFilterInput` instead of the plain number input.
 */
export interface DurationFilterContext {
  columnKey: string;
  unit: TimeUnit;
}

const toComboboxOptions = <T extends string | number>(
  options: Array<{ label?: unknown; value?: T }>
): Array<ComboboxOption<T>> => {
  return options
    .filter((option): option is { label?: unknown; value: T } => option.value !== undefined)
    .map((option) => ({
      label: String(option.label || option.value),
      value: option.value,
    }));
};

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

type ValueOptionsLoader = (search: string) => Promise<Array<ComboboxOption<string>>>;

const FilterValueSuggestItem = (props: {
  value: string;
  loadOptions: ValueOptionsLoader;
  onChange: (value: string) => void;
}) => {
  const { value, loadOptions, onChange } = props;
  // The value prop can lag a pick by one event, and committing the picked text again loops Combobox on Grafana 11.6.
  const latestValue = useRef(value);
  latestValue.current = value;
  const change = (next: string) => {
    latestValue.current = next;
    onChange(next);
  };
  // Grafana 11.6 highlights the first row when the menu reopens, so Tab would replace the saved value with it.
  const loadOptionsSavedFirst = useCallback(
    async (search: string) => {
      const options = await loadOptions(search);
      const saved = latestValue.current;
      return search || !saved
        ? options
        : [{ label: saved, value: saved }, ...options.filter((option) => option.value !== saved)];
    },
    [loadOptions]
  );
  // Combobox drops typed text on click-outside, and its onBlur prop never fires before Grafana 13.1.
  const commitTypedText = (target: EventTarget) => {
    if (target instanceof HTMLInputElement && target.value && target.value !== latestValue.current) {
      change(target.value);
    }
  };
  // Downshift clears the value on Escape with the menu closed, and drops typed text on Enter with no row highlighted.
  const onKeyDownCapture = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }
    if (event.key === 'Escape' && event.target.getAttribute('aria-expanded') !== 'true') {
      Object.assign(event.nativeEvent, { preventDownshiftDefault: true });
    }
    if (event.key === 'Enter' && !event.target.getAttribute('aria-activedescendant')) {
      commitTypedText(event.target);
    }
  };
  return (
    <div
      data-testid="query-builder-filters-single-string-value-container"
      onBlur={(event) => commitTypedText(event.target)}
      onKeyDownCapture={onKeyDownCapture}
    >
      <Combobox
        value={value || null}
        options={loadOptionsSavedFirst}
        createCustomValue
        isClearable
        width={70}
        onChange={(option) => change(option?.value ?? '')}
      />
    </div>
  );
};

const FilterValueSuggestMultiItem = (props: {
  value: string[];
  loadOptions: ValueOptionsLoader;
  onChange: (value: string[]) => void;
}) => {
  const { loadOptions, onChange } = props;
  // MultiCombobox keeps its search text after a pick and, before Grafana 13.1, crashes on duplicate values.
  const hasTypedText = useRef(false);
  const unique = [...new Set(props.value)];
  const display = unique.length === 1 && unique[0] === '' ? [] : unique;
  const change = (next: string[]) => {
    hasTypedText.current = false;
    onChange(next);
  };
  const commitTypedText = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!hasTypedText.current || !(event.target instanceof HTMLInputElement)) {
      return;
    }
    const typed = event.target.value
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v !== '');
    if (typed.length > 0) {
      change([...new Set([...display, ...typed])]);
    }
  };
  return (
    <div
      data-testid="query-builder-filters-multi-string-value-container"
      onInput={() => (hasTypedText.current = true)}
      onBlur={commitTypedText}
    >
      <MultiCombobox
        value={display}
        options={loadOptions}
        createCustomValue
        placeholder="comma separated values"
        width={70}
        onChange={(options) => change(options.map((option) => option.value))}
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
  durationFilterContext?: DurationFilterContext;
  loadValueOptions?: ValueOptionsLoader;
}) => {
  const { filter, onFilterChange, allColumns: fieldsList, durationFilterContext, loadValueOptions } = props;
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
    const isDurationFilter =
      !!durationFilterContext &&
      (filter.hint === ColumnHint.TraceDurationTime || filter.key === durationFilterContext.columnKey);
    if (isDurationFilter) {
      const numberFilter = filter as NumberFilter;
      return (
        <DurationFilterInput
          value={numberFilter.value}
          rawInput={numberFilter.rawInput}
          storedUnit={durationFilterContext!.unit}
          onChange={({ value, rawInput }) => onFilterChange({ ...numberFilter, value, rawInput })}
        />
      );
    }
    return <FilterValueNumberItem value={filter.value} onChange={(value) => onFilterChange({ ...filter, value })} />;
  } else if (utils.isDateFilter(filter)) {
    if (utils.isDateFilterWithOutValue(filter)) {
      return null;
    }

    const onDateFilterValueChange = (value: string) => {
      onFilterChange({ ...filter, value });
    };
    const dateOptions = [...standardTimeOptions];
    if (filter.value && !standardTimeOptions.find((o) => o.value === filter.value)) {
      dateOptions.push({ label: filter.value, value: filter.value });
    }

    return (
      <div data-testid="query-builder-filters-date-value-container">
        <Combobox
          value={filter.value || 'TODAY'}
          onChange={(option) => onDateFilterValueChange(option.value)}
          options={toComboboxOptions(dateOptions)}
          width={40}
          createCustomValue
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
          <Combobox
            value={filter.value}
            onChange={(option) => onStringFilterValueChange(option.value)}
            options={toComboboxOptions(getOptions())}
          />
        </div>
      );
    }
    if (
      loadValueOptions &&
      (filter.operator === FilterOperator.Equals || filter.operator === FilterOperator.NotEquals)
    ) {
      return (
        <FilterValueSuggestItem
          // A switch from IN to = keeps the array value, which Combobox would read as an option object.
          value={String(filter.value ?? '')}
          loadOptions={loadValueOptions}
          onChange={onStringFilterValueChange}
        />
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
          <MultiCombobox
            value={filter.value}
            options={toComboboxOptions(getOptions())}
            onChange={(options) => onMultiFilterValueChange(options.map((option) => option.value))}
          />
        </div>
      );
    }
    if (loadValueOptions) {
      return (
        <FilterValueSuggestMultiItem
          value={filter.value}
          loadOptions={loadValueOptions}
          onChange={onMultiFilterValueChange}
        />
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
  durationFilterContext?: DurationFilterContext;
  selectedColumns?: SelectedColumn[];
  timeColumn?: string;
}) => {
  const { index, filter, allColumns: fieldsList, onFilterChange, removeFilter, durationFilterContext } = props;
  const { datasource, database, table, timeColumn } = props;
  const hintedColumn = getHintedFilterColumn({ columns: props.selectedColumns }, filter);
  const valueColumn = hintedColumn?.name || filter.key;
  const loadValueOptions = useCallback(
    (search: string): Promise<Array<ComboboxOption<string>>> =>
      datasource
        .fetchFilterValues(valueColumn, database, table, { search, timeColumn })
        .then((values) => values.map((value) => ({ label: value, value })))
        .catch(() => []),
    [datasource, database, table, valueColumn, timeColumn]
  );
  const suggestsValues = Boolean(valueColumn && table) && isStringType(hintedColumn?.type || filter.type);
  const isMapType = filter.type.startsWith('Map');
  const isJSONType = filter.type.startsWith('JSON');
  const mapKeys = useUniqueMapKeys(props.datasource, isMapType ? filter.key : '', props.database, props.table);
  const keysColumnName = isJSONType ? props.allColumns.find((c) => c.name === filter.key + 'Keys')?.name : undefined;
  const jsonPaths = useUniqueJSONPaths(
    props.datasource,
    isJSONType ? filter.key : '',
    props.database,
    props.table,
    keysColumnName
  );
  const subKeyOptions = isJSONType
    ? jsonPaths.map((p) => ({ label: p, value: p }))
    : mapKeys.map((k) => ({ label: k, value: k }));
  if (filter.mapKey && !subKeyOptions.find((o) => o.value === filter.mapKey)) {
    subKeyOptions.push({ label: filter.mapKey, value: filter.mapKey });
  }

  const getFields = () => {
    const values = (filter.restrictToFields || fieldsList).map((f) => {
      let label = f.label || f.name;
      if (f.type.startsWith('Map')) {
        label += '[]';
      } else if (f.type.startsWith('JSON')) {
        label += '{}';
      }

      return { label, value: f.name };
    });
    // Add selected value to the list if it does not exist.
    if (filter?.key && !values.find((x) => x.value === filter.key)) {
      values.push({ label: filter.label || filter.key!, value: filter.key! });
    }
    return values;
  };
  const onFilterNameChange = (fieldName: string) => {
    const matchingField = fieldsList.find((f) => f.name === fieldName);
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
    <Stack direction="row" wrap="wrap" alignItems="flex-start" justifyContent="flex-start">
      {index !== 0 && (
        <RadioButtonGroup options={conditions} value={filter.condition} onChange={(e) => onFilterConditionChange(e!)} />
      )}
      <Combobox
        disabled={Boolean(filter.hint)}
        placeholder={filter.hint ? labels.types.ColumnHint[filter.hint] : undefined}
        value={filter.key}
        width={40}
        options={toComboboxOptions(getFields())}
        onChange={(option) => option && onFilterNameChange(option.value)}
        createCustomValue
      />
      {(isMapType || isJSONType) && (
        <Combobox
          value={filter.mapKey}
          placeholder={
            isJSONType
              ? labels.components.FilterEditor.jsonPathPlaceholder
              : labels.components.FilterEditor.mapKeyPlaceholder
          }
          width={40}
          options={toComboboxOptions(subKeyOptions)}
          onChange={(option) => option && onFilterMapKeyChange(option.value)}
          createCustomValue
        />
      )}
      <Combobox
        value={filter.operator}
        width={40}
        options={toComboboxOptions(getFilterOperatorsByType(filter.type, isJSONType))}
        onChange={(option) => option && onFilterOperatorChange(option.value)}
      />
      <FilterValueEditor
        // Rows are keyed by index, so a removed filter's loaded suggestions would pass to the next row.
        key={`${table}.${valueColumn}`}
        filter={filter}
        onFilterChange={onFilterValueChange}
        allColumns={fieldsList}
        durationFilterContext={durationFilterContext}
        loadValueOptions={suggestsValues ? loadValueOptions : undefined}
      />
      <Button
        data-testid="query-builder-filters-remove-button"
        icon="trash-alt"
        variant="destructive"
        size="sm"
        className={styles.Common.smallBtn}
        onClick={() => removeFilter(index)}
        aria-label="query-builder-filters-remove-button"
      />
    </Stack>
  );
};

export const FiltersEditor = (props: {
  allColumns: readonly TableColumn[];
  filters: Filter[];
  onFiltersChange: (filters: Filter[]) => void;
  datasource: Datasource;
  database: string;
  table: string;
  durationFilterContext?: DurationFilterContext;
  selectedColumns?: SelectedColumn[];
}) => {
  const {
    filters = [],
    onFiltersChange,
    allColumns: fieldsList = [],
    datasource,
    database,
    table,
    durationFilterContext,
    selectedColumns,
  } = props;
  const timeColumn = getTimeFilterColumn({ columns: selectedColumns, filters });
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
        <InlineField
          label={
            <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
              {label}
            </InlineFormLabel>
          }
        >
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
        </InlineField>
      )}
      {filters.map((filter, index) => {
        return (
          <InlineField
            key={index}
            label={
              index === 0 ? (
                <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
                  {label}
                </InlineFormLabel>
              ) : (
                <div className={`width-8 ${styles.Common.firstLabel}`}></div>
              )
            }
            shrink
          >
            <FilterEditor
              allColumns={fieldsList}
              filter={filter}
              onFilterChange={onFilterChange}
              removeFilter={removeFilter}
              index={index}
              datasource={datasource}
              database={database}
              table={table}
              durationFilterContext={durationFilterContext}
              selectedColumns={selectedColumns}
              timeColumn={timeColumn}
            />
          </InlineField>
        );
      })}
      {filters.length !== 0 && (
        <InlineField label={<div className={`width-8 ${styles.Common.firstLabel}`}></div>}>
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
        </InlineField>
      )}
    </>
  );
};
