import React, { useRef, useState } from 'react';
import { getTemplateSrv } from '@grafana/runtime';
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
  QueryType,
} from 'types/queryBuilder';
import * as utils from 'components/queryBuilder/utils';
import labels from 'labels';
import { styles } from 'styles';
import { Datasource } from 'data/CHDatasource';
import useUniqueMapKeys from 'hooks/useUniqueMapKeys';
import useUniqueJSONPaths from 'hooks/useUniqueJSONPaths';
import { getFilterOperatorsByType } from './filterOperatorOptions';
import { DurationFilterInput } from './DurationFilterInput';
import { getFilters } from 'data/sqlGenerator';

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

/** Suggested values for a typed search, most relevant first. */
type ValueSuggester = (search: string) => Promise<string[]>;

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

/** Typed text still in the dropdown's input when it loses focus, so it isn't dropped like Grafana's Combobox does. */
const typedOnBlur = (e: React.FocusEvent) => (e.target instanceof HTMLInputElement ? e.target.value.trim() : '');

const SUGGESTION_CACHE_MS = 60_000;

const splitTyped = (text: string) =>
  text
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

/**
 * Multi-value filter with suggestions. Like the comma-separated input it replaces, typed text can hold
 * several values and commits when leaving the field.
 */
const FilterValueMultiSuggestItem = (props: {
  value: string[];
  onChange: (value: string[]) => void;
  suggest: ValueSuggester;
}) => {
  const wrapper = useRef<HTMLDivElement>(null);
  // Grafana's MultiCombobox keeps the search text after a selection; that text is consumed, not a value.
  const consumed = useRef('');
  const values = (props.value || []).filter(Boolean);
  const typedText = () => wrapper.current?.querySelector('input')?.value.trim() ?? '';
  const loadOptions = async (input: string) => (await props.suggest(input)).map((value) => ({ label: value, value }));
  return (
    <div
      ref={wrapper}
      data-testid="query-builder-filters-multi-string-value-container"
      onBlurCapture={(e) => {
        // Focus moving inside the field (e.g. to a pill's remove button) isn't leaving it.
        if (e.relatedTarget instanceof Node && wrapper.current?.contains(e.relatedTarget)) {
          return;
        }
        const typed = typedOnBlur(e);
        if (typed && typed !== consumed.current) {
          props.onChange([...new Set([...values, ...splitTyped(typed)])]);
        }
        consumed.current = '';
      }}
    >
      <MultiCombobox
        value={values}
        options={loadOptions}
        onChange={(options) => {
          const typed = typedText();
          consumed.current = typed;
          // Only a value created from the typed text is split on commas; picked values are kept as they are.
          const next = options.flatMap((o) => (typed && o.value === typed ? splitTyped(o.value) : [o.value]));
          props.onChange([...new Set(next)]);
        }}
        createCustomValue
        // A numeric width is read as pixels when fitting pills, so let it measure the field.
        width="auto"
        minWidth={70}
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
  /** Suggests the column's values for `=`, `!=`, `IN` and `NOT IN`; typed values are still accepted. */
  suggestValues?: ValueSuggester;
}) => {
  const { filter, onFilterChange, allColumns: fieldsList, durationFilterContext, suggestValues } = props;
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

    if (suggestValues && (filter.operator === FilterOperator.Equals || filter.operator === FilterOperator.NotEquals)) {
      const loadOptions = async (input: string) =>
        (await suggestValues(input)).map((value) => ({ label: value, value }));
      return (
        <div
          data-testid="query-builder-filters-single-string-value-container"
          onBlurCapture={(e) => {
            const typed = typedOnBlur(e);
            if (typed && typed !== filter.value) {
              onStringFilterValueChange(typed);
            }
          }}
        >
          <Combobox
            value={filter.value || null}
            options={loadOptions}
            onChange={(option) => onStringFilterValueChange(option?.value ?? '')}
            createCustomValue
            isClearable
            width={70}
          />
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
          <MultiCombobox
            value={filter.value}
            options={toComboboxOptions(getOptions())}
            onChange={(options) => onMultiFilterValueChange(options.map((option) => option.value))}
          />
        </div>
      );
    }
    if (suggestValues) {
      return (
        <FilterValueMultiSuggestItem value={filter.value} onChange={onMultiFilterValueChange} suggest={suggestValues} />
      );
    }
    return <FilterValueMultiStringItem value={filter.value} onChange={onMultiFilterValueChange} />;
  } else {
    return <></>;
  }
};

/**
 * Suggests the distinct values of the filtered column (for a role filter, the column holding the
 * role) matching the typed search. When the query has a time role, the lookup is bounded by the
 * dashboard time range on it, so large tables aren't scanned whole. Exact and prefix matches come
 * first. Not offered for JSON paths, a Map column without a key, or Array/Tuple/Nested columns.
 */
const useValueSuggester = (
  props: {
    filter: Filter;
    datasource: Datasource;
    database: string;
    table: string;
    allColumns: readonly TableColumn[];
    columns?: readonly SelectedColumn[];
    otherFilters?: string;
  },
  isMapType: boolean,
  isJSONType: boolean
): ValueSuggester | undefined => {
  const { filter, datasource, database, table, allColumns, columns = [], otherFilters } = props;
  const cache = useRef(new Map<string, { at: number; values: Promise<string[]> }>());
  const column = filter.hint ? columns.find((c) => c.hint === filter.hint)?.name : filter.key;
  const columnType = allColumns.find((c) => c.name === column)?.type || filter.type;
  if (
    !column ||
    !database ||
    !table ||
    isJSONType ||
    (isMapType && !filter.mapKey) ||
    /^(Array|Tuple|Nested)\(/.test(columnType)
  ) {
    return undefined;
  }

  const timeRole =
    columns.find((c) => c.hint === ColumnHint.FilterTime) || columns.find((c) => c.hint === ColumnHint.Time);
  const timeColumn = timeRole?.name;
  const timeColumnType = allColumns.find((c) => c.name === timeColumn)?.type || timeRole?.type;

  return async (search: string) => {
    const range = (getTemplateSrv() as any)?.timeRange?.raw;
    const key = JSON.stringify([
      database,
      table,
      column,
      filter.mapKey,
      timeColumn,
      `${range?.from}`,
      `${range?.to}`,
      otherFilters,
      search,
    ]);
    let entry = cache.current.get(key);
    // A relative range moves with time, so cached values expire.
    if (!entry || Date.now() - entry.at > SUGGESTION_CACHE_MS) {
      const options = { timeColumn, timeColumnType, search, where: otherFilters };
      const values = (
        isMapType
          ? datasource.fetchDistinctMapValues(column, filter.mapKey!, database, table, options)
          : datasource.fetchDistinctValues(column, database, table, options)
      )
        .then((found) => found.map(String).filter((v) => v !== ''))
        .catch(() => []);
      entry = { at: Date.now(), values };
      cache.current.set(key, entry);
      // An empty result may be a failed or timed-out lookup: ask again next time.
      values.then((found) => found.length || cache.current.delete(key));
    }
    const needle = search.toLowerCase();
    const rank = (v: string) => (v.toLowerCase() === needle ? 0 : v.toLowerCase().startsWith(needle) ? 1 : 2);
    return [...(await entry.values)].sort((a, b) => rank(a) - rank(b));
  };
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
  /** The query's selected columns, to resolve role filters (e.g. Service Name) and the time column. */
  columns?: readonly SelectedColumn[];
  /** SQL condition of the other filters, which narrows this filter's value suggestions. */
  otherFilters?: string;
}) => {
  const { index, filter, allColumns: fieldsList, onFilterChange, removeFilter, durationFilterContext } = props;
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

  const suggestValues = useValueSuggester(props, isMapType, isJSONType);

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
        newFilter.value = newFilter.value ? [newFilter.value] : [];
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
        filter={filter}
        onFilterChange={onFilterValueChange}
        allColumns={fieldsList}
        durationFilterContext={durationFilterContext}
        suggestValues={suggestValues}
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

const hasValue = (f: Filter) =>
  !('value' in f) || (Array.isArray(f.value) ? f.value.length > 0 : f.value !== '' && f.value !== undefined);

/** The SQL condition of every filter but the one at `index`, skipping filters not filled in yet. */
const getOtherFiltersSql = (filters: Filter[], index: number, columns: readonly SelectedColumn[] = []) =>
  getFilters({
    database: '',
    table: '',
    queryType: QueryType.Table,
    columns: [...columns],
    filters: filters.filter((f, i) => i !== index && hasValue(f)),
  });

export const FiltersEditor = (props: {
  allColumns: readonly TableColumn[];
  filters: Filter[];
  onFiltersChange: (filters: Filter[]) => void;
  datasource: Datasource;
  database: string;
  table: string;
  durationFilterContext?: DurationFilterContext;
  /** The query's selected columns, to suggest values for role filters and bound them by time. */
  columns?: readonly SelectedColumn[];
}) => {
  const {
    filters = [],
    onFiltersChange,
    allColumns: fieldsList = [],
    datasource,
    database,
    table,
    durationFilterContext,
    columns,
  } = props;
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
              columns={columns}
              otherFilters={getOtherFiltersSql(filters, index, columns)}
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
