import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2, SelectableValue } from '@grafana/data';
import { AsyncSelect, Button, Select, useStyles2 } from '@grafana/ui';
import { Datasource } from 'data/CHDatasource';
import { Filter, FilterOperator, NumberFilter, StringFilter, TableColumn } from 'types/queryBuilder';

interface FilterPopoverProps {
  datasource: Datasource;
  database: string;
  table: string;
  allColumns: readonly TableColumn[];
  onAddFilter: (filter: Filter) => void;
  onClose: () => void;
}

type FilterValueKind = 'number' | 'string';

const numberOperatorOptions: Array<SelectableValue<FilterOperator>> = [
  { label: '>', value: FilterOperator.GreaterThan },
  { label: '<', value: FilterOperator.LessThan },
  { label: '>=', value: FilterOperator.GreaterThanOrEqual },
  { label: '<=', value: FilterOperator.LessThanOrEqual },
  { label: '=', value: FilterOperator.Equals },
  { label: '!=', value: FilterOperator.NotEquals },
  { label: 'IS NULL', value: FilterOperator.IsNull },
  { label: 'IS NOT NULL', value: FilterOperator.IsNotNull },
];

const stringOperatorOptions: Array<SelectableValue<FilterOperator>> = [
  { label: 'contains', value: FilterOperator.Like },
  { label: 'does not contain', value: FilterOperator.NotLike },
  { label: '=', value: FilterOperator.Equals },
  { label: '!=', value: FilterOperator.NotEquals },
  { label: 'IS NULL', value: FilterOperator.IsNull },
  { label: 'IS NOT NULL', value: FilterOperator.IsNotNull },
];

const defaultOperatorByKind: Record<FilterValueKind, FilterOperator> = {
  number: FilterOperator.GreaterThan,
  string: FilterOperator.Like,
};

const getMapValueType = (type: string): string => {
  return type.match(/Map\(\s*.+\s*,\s*(.+)\s*\)/)?.[1]?.trim() || type;
};

export const getFilterValueKind = (type = ''): FilterValueKind => {
  const normalizedType = getMapValueType(type)
    .toLowerCase()
    .replace(/\(/g, '')
    .replace(/\)/g, '')
    .replace(/nullable/g, '')
    .replace(/lowcardinality/g, '');

  return ['int', 'float', 'decimal'].some((numberType) => normalizedType.includes(numberType)) ? 'number' : 'string';
};

export const getOperatorOptions = (kind: FilterValueKind): Array<SelectableValue<FilterOperator>> => {
  return kind === 'number' ? numberOperatorOptions : stringOperatorOptions;
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

  const columnOptions: Array<SelectableValue<string>> = allColumns.map((column) => ({
    label: column.label || column.name,
    value: column.name,
    description: column.type,
  }));

  const loadValueOptions = useCallback(
    async (inputValue: string): Promise<Array<SelectableValue<string>>> => {
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

        return values
          .filter((nextValue) => !inputValue || nextValue.toLowerCase().includes(inputValue.toLowerCase()))
          .map((nextValue) => ({ label: nextValue, value: nextValue }));
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
        <Select
          options={columnOptions}
          value={selectedColumn}
          onChange={(option) => {
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
          menuPlacement="bottom"
        />
      </div>

      {isMapColumn && (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Map key</span>
          <Select
            options={mapKeys.map((key) => ({ label: key, value: key }))}
            value={selectedMapKey}
            onChange={(option) => {
              setSelectedMapKey(option.value || '');
              setValue('');
            }}
            width={20}
            placeholder="Select key..."
            menuPlacement="bottom"
          />
        </div>
      )}

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Operator</span>
        <Select
          options={currentOperatorOptions}
          value={operator}
          onChange={(option) => setOperator(option.value || defaultOperatorByKind[filterKind])}
          width={14}
          menuPlacement="bottom"
        />
      </div>

      {!noValueNeeded && (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Value</span>
          <AsyncSelect
            key={`${selectedColumn}-${selectedMapKey}`}
            loadOptions={loadValueOptions}
            defaultOptions={Boolean(selectedColumn)}
            value={value ? { label: value, value } : undefined}
            onChange={(option) => setValue(option?.value || '')}
            allowCustomValue
            onCreateOption={(nextValue) => setValue(nextValue)}
            width={24}
            placeholder="Type or select..."
            menuPlacement="bottom"
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
