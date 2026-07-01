import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Button, Combobox, ComboboxOption, useStyles2 } from '@grafana/ui';
import { Datasource } from 'data/CHDatasource';
import { Filter, FilterOperator, NumberFilter, StringFilter, TableColumn } from 'types/queryBuilder';
import { getFilterOperatorOptions } from './filterOperatorOptions';
import * as utils from './utils';

interface FilterPopoverProps {
  datasource: Datasource;
  database: string;
  table: string;
  allColumns: readonly TableColumn[];
  onAddFilter: (filter: Filter) => void;
  onClose: () => void;
}

type FilterValueKind = 'number' | 'string';

const numberOperators = [
  FilterOperator.GreaterThan,
  FilterOperator.LessThan,
  FilterOperator.GreaterThanOrEqual,
  FilterOperator.LessThanOrEqual,
  FilterOperator.Equals,
  FilterOperator.NotEquals,
  FilterOperator.IsNull,
  FilterOperator.IsNotNull,
];

const stringOperators = [
  FilterOperator.Like,
  FilterOperator.NotLike,
  FilterOperator.Equals,
  FilterOperator.NotEquals,
  FilterOperator.IsNull,
  FilterOperator.IsNotNull,
];

const compactOperatorLabels: Partial<Record<FilterOperator, string>> = {
  [FilterOperator.Like]: 'contains',
  [FilterOperator.NotLike]: 'does not contain',
};

const defaultOperatorByKind: Record<FilterValueKind, FilterOperator> = {
  number: FilterOperator.GreaterThan,
  string: FilterOperator.Like,
};

const getMapValueType = (type: string): string => {
  return type.match(/Map\(\s*.+\s*,\s*(.+)\s*\)/)?.[1]?.trim() || type;
};

export const getFilterValueKind = (type = ''): FilterValueKind => {
  const valueType = getMapValueType(type);

  return utils.isNumberType(valueType) ? 'number' : 'string';
};

export const getOperatorOptions = (kind: FilterValueKind): Array<ComboboxOption<FilterOperator>> => {
  return getFilterOperatorOptions(kind === 'number' ? numberOperators : stringOperators, compactOperatorLabels).map(
    (option) => ({
      label: String(option.label || option.value),
      value: option.value!,
    })
  );
};

export const toFilterValueOption = (
  nextValue: string | number | boolean
): ComboboxOption<string> & { label: string; value: string } => {
  const value = String(nextValue);
  return { label: value, value };
};

const getStyles = (theme: GrafanaTheme2) => ({
  popover: css`
    display: flex;
    align-items: flex-end;
    gap: ${theme.spacing(0.75)};
    padding: ${theme.spacing(0.75)} 0;
    flex-wrap: wrap;
  `,
  field: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
  `,
  fieldLabel: css`
    font-size: 11px;
    color: ${theme.colors.text.secondary};
    font-weight: ${theme.typography.fontWeightMedium};
  `,
  actions: css`
    display: flex;
    gap: ${theme.spacing(0.5)};
  `,
});

export const FilterPopover = (props: FilterPopoverProps) => {
  const { datasource, database, table, allColumns, onAddFilter, onClose } = props;
  const styles = useStyles2(getStyles);

  const [selectedColumn, setSelectedColumn] = useState('');
  const [selectedMapKey, setSelectedMapKey] = useState('');
  const [operator, setOperator] = useState<FilterOperator>(FilterOperator.Equals);
  const [value, setValue] = useState('');
  const [mapKeys, setMapKeys] = useState<string[]>([]);

  const selectedColDef = allColumns.find((column) => column.name === selectedColumn);
  const isMapColumn = selectedColDef?.type?.startsWith('Map(') || false;
  const filterKind = getFilterValueKind(selectedColDef?.type);
  const currentOperatorOptions = useMemo(() => getOperatorOptions(filterKind), [filterKind]);

  useEffect(() => {
    if (isMapColumn && selectedColumn && database && table) {
      datasource
        .fetchUniqueMapKeys(selectedColumn, database, table)
        .then(setMapKeys)
        .catch(() => setMapKeys([]));
    } else {
      setMapKeys([]);
      setSelectedMapKey('');
    }
  }, [datasource, database, table, selectedColumn, isMapColumn]);

  const columnOptions: Array<ComboboxOption<string>> = allColumns.map((column) => ({
    label: column.label || column.name,
    value: column.name,
    description: column.type,
  }));

  const loadValueOptions = useCallback(
    async (inputValue: string): Promise<Array<ComboboxOption<string>>> => {
      if (!selectedColumn || !database || !table) {
        return [];
      }
      try {
        const values =
          isMapColumn && selectedMapKey
            ? await datasource.fetchDistinctMapValues(selectedColumn, selectedMapKey, database, table)
            : !isMapColumn
              ? await datasource.fetchDistinctValues(selectedColumn, database, table)
              : [];

        const normalizedInput = inputValue.toLowerCase();
        return values
          .map(toFilterValueOption)
          .filter((option) => !normalizedInput || option.value.toLowerCase().includes(normalizedInput));
      } catch (err) {
        console.error('FilterPopover: failed to load values for column', selectedColumn, err);
        return [];
      }
    },
    [datasource, database, table, selectedColumn, isMapColumn, selectedMapKey]
  );

  const noValueNeeded = operator === FilterOperator.IsNull || operator === FilterOperator.IsNotNull;
  const numericValue = Number(value);
  const isNumberValueInvalid =
    filterKind === 'number' && !noValueNeeded && (value.trim() === '' || isNaN(numericValue));

  const handleAdd = () => {
    if (!selectedColumn || isNumberValueInvalid) {
      return;
    }

    const commonFilter = {
      filterType: 'custom',
      key: selectedColumn,
      type: selectedColDef?.type || 'string',
      operator: operator as any,
      condition: 'AND',
      ...(isMapColumn && selectedMapKey ? { mapKey: selectedMapKey } : {}),
    };

    const filter: StringFilter | NumberFilter =
      filterKind === 'number'
        ? ({
            ...commonFilter,
            value: noValueNeeded ? 0 : numericValue,
          } as NumberFilter)
        : ({
            ...commonFilter,
            value: noValueNeeded ? '' : value,
          } as StringFilter);

    onAddFilter(filter as Filter);
    onClose();
  };

  return (
    <div className={styles.popover} data-testid="filter-popover">
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Column</span>
        <Combobox
          options={columnOptions}
          value={selectedColumn || null}
          onChange={(option) => {
            if (!option) {
              return;
            }
            const nextColumn = option.value || '';
            const nextColumnDef = allColumns.find((column) => column.name === nextColumn);
            const nextKind = getFilterValueKind(nextColumnDef?.type);
            setSelectedColumn(nextColumn);
            setSelectedMapKey('');
            setOperator(defaultOperatorByKind[nextKind]);
            setValue('');
          }}
          width={24}
          placeholder="Select column..."
        />
      </div>

      {isMapColumn && (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Map key</span>
          <Combobox
            options={mapKeys.map((key) => ({ label: key, value: key }))}
            value={selectedMapKey || null}
            onChange={(option) => {
              if (!option) {
                return;
              }
              setSelectedMapKey(option.value || '');
              setValue('');
            }}
            width={20}
            placeholder="Select key..."
          />
        </div>
      )}

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Operator</span>
        <Combobox
          options={currentOperatorOptions}
          value={operator}
          onChange={(option) => option && setOperator(option.value || defaultOperatorByKind[filterKind])}
          width={14}
        />
      </div>

      {!noValueNeeded && (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Value</span>
          <Combobox
            key={`${selectedColumn}-${selectedMapKey}`}
            options={loadValueOptions}
            value={value ? { label: value, value } : undefined}
            onChange={(option) => option && setValue(option.value || '')}
            createCustomValue
            width={24}
            placeholder="Type or select..."
          />
        </div>
      )}

      <div className={styles.actions}>
        <Button size="sm" onClick={handleAdd} disabled={!selectedColumn || isNumberValueInvalid}>
          Add
        </Button>
        <Button size="sm" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
};
