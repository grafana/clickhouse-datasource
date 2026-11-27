import React, { useMemo, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Button, Combobox, ComboboxOption, MultiCombobox, useStyles2 } from '@grafana/ui';
import { getTemplateSrv } from '@grafana/runtime';
import { Datasource } from 'data/CHDatasource';
import { getMetricLabelId, metricAttributeColumns, parseMetricLabelId } from 'data/metrics';
import { Filter, FilterOperator, MetricLabel } from 'types/queryBuilder';
import { selectors } from 'selectors';

interface MetricLabelFilterEditorProps {
  datasource: Datasource;
  database: string;
  table: string;
  metricName: string;
  jsonAttributes?: boolean;
  labelOptions: Array<ComboboxOption<string>>;
  onAdd: (filter: Filter) => void;
  onClose: () => void;
}

const operatorOptions: Array<ComboboxOption<FilterOperator>> = [
  { label: '=', value: FilterOperator.Equals, description: 'Equals' },
  { label: '!=', value: FilterOperator.NotEquals, description: 'Does not equal' },
  { label: 'in', value: FilterOperator.In, description: 'Equals one of the values' },
  { label: 'not in', value: FilterOperator.NotIn, description: 'Equals none of the values' },
  { label: 'contains', value: FilterOperator.Like, description: 'Contains the text' },
  { label: 'does not contain', value: FilterOperator.NotLike, description: 'Does not contain the text' },
];

/** The dashboard's variables as `$name`, offered as filter values. Empty outside a dashboard. */
const getDashboardVariables = (): string[] => {
  try {
    return (getTemplateSrv()?.getVariables() || []).map((v) => `$${v.name}`);
  } catch {
    return [];
  }
};

const isMultiOperator = (operator: FilterOperator) =>
  operator === FilterOperator.In || operator === FilterOperator.NotIn;

/**
 * A label filter as a builder filter, so the SQL generator, the filter chips and the classic
 * builder all understand it. Attribute labels filter a key of their Map (or JSON) column.
 */
export const toMetricLabelFilter = (
  label: MetricLabel,
  operator: FilterOperator,
  value: string | string[],
  jsonAttributes = false
): Filter => {
  const common =
    label.source === 'column'
      ? { key: label.key, type: 'LowCardinality(String)' }
      : {
          key: metricAttributeColumns[label.source],
          mapKey: label.key,
          type: jsonAttributes ? 'JSON' : 'Map(LowCardinality(String), String)',
        };

  if (isMultiOperator(operator)) {
    return {
      filterType: 'custom',
      condition: 'AND',
      ...common,
      operator: operator as FilterOperator.In | FilterOperator.NotIn,
      value: Array.isArray(value) ? value : [value],
    };
  }
  return {
    filterType: 'custom',
    condition: 'AND',
    ...common,
    operator: operator as FilterOperator.Equals,
    value: Array.isArray(value) ? value.join(',') : value,
  };
};

const getStyles = (theme: GrafanaTheme2) => ({
  row: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(0.75)};
    padding: ${theme.spacing(0.5)} 0;
    flex-wrap: wrap;
  `,
});

export const MetricLabelFilterEditor = (props: MetricLabelFilterEditorProps) => {
  const { datasource, database, table, metricName, jsonAttributes, labelOptions, onAdd, onClose } = props;
  const styles = useStyles2(getStyles);
  const [labelId, setLabelId] = useState<string>('');
  const [operator, setOperator] = useState<FilterOperator>(FilterOperator.Equals);
  const [value, setValue] = useState<string>('');
  const [values, setValues] = useState<string[]>([]);
  const label = useMemo(() => (labelId ? parseMetricLabelId(labelId) : undefined), [labelId]);
  const multi = isMultiOperator(operator);

  // Values are listed by the Combobox when its menu opens, filtered by what the user typed.
  const loadValues = useMemo(() => {
    let cached: Promise<string[]> | undefined;
    return async (search: string): Promise<Array<ComboboxOption<string>>> => {
      if (!label) {
        return [];
      }
      cached ??=
        metricName && table
          ? datasource.fetchMetricLabelValues(database, table, metricName, label, jsonAttributes).catch(() => [])
          : Promise.resolve([]);
      const needle = search.toLowerCase();
      const matches = (v: string) => !needle || v.toLowerCase().includes(needle);
      // Dashboard variables come first, so a panel can follow the dashboard's selection.
      const variables = getDashboardVariables()
        .filter(matches)
        .map((v) => ({ label: v, value: v, group: 'Dashboard variables' }));
      const values = (await cached)
        .filter(matches)
        .slice(0, 500)
        .map((v) => ({ label: v, value: v, group: 'Values' }));
      return [...variables, ...values];
    };
  }, [datasource, database, table, metricName, label, jsonAttributes]);

  const canAdd = Boolean(label) && (multi ? values.length > 0 : value !== '');
  const add = () => {
    if (!label || !canAdd) {
      return;
    }
    onAdd(toMetricLabelFilter(label, operator, multi ? values : value, jsonAttributes));
    onClose();
  };

  return (
    <div className={styles.row} data-testid={selectors.components.QueryBuilder.MetricsEditor.filterEditor}>
      <Combobox
        aria-label="Filter label"
        options={labelOptions}
        value={labelId || null}
        onChange={(option) => {
          setLabelId(option.value);
          setValue('');
          setValues([]);
        }}
        width={30}
        placeholder="Label"
      />
      <Combobox
        aria-label="Filter operator"
        options={operatorOptions}
        value={operator}
        onChange={(option) => setOperator(option.value)}
        width={16}
      />
      {multi ? (
        <MultiCombobox
          aria-label="Filter values"
          // Keyed on the label, so switching labels drops the previous label's listed values.
          key={`multi-${labelId}`}
          options={loadValues}
          value={values}
          onChange={(options) => setValues(options.map((option) => option.value))}
          createCustomValue
          width={36}
          placeholder="Values"
          disabled={!label}
        />
      ) : (
        <Combobox
          aria-label="Filter value"
          key={`single-${labelId}`}
          options={loadValues}
          value={value || null}
          onChange={(option) => setValue(option.value)}
          createCustomValue
          width={36}
          placeholder="Value"
          disabled={!label}
        />
      )}
      <Button size="sm" onClick={add} disabled={!canAdd}>
        Add
      </Button>
      <Button size="sm" variant="secondary" fill="text" onClick={onClose}>
        Cancel
      </Button>
    </div>
  );
};

/** Label options for the group by and filter pickers, grouped by where the label comes from. */
export const getMetricLabelOptions = (labels: readonly MetricLabel[]): Array<ComboboxOption<string>> => {
  const groups: Record<MetricLabel['source'], string> = {
    column: 'Columns',
    resource: 'Resource attributes',
    attribute: 'Data point attributes',
    scope: 'Scope attributes',
  };
  const seen = new Set<string>();
  const options: Array<ComboboxOption<string>> = [];
  for (const label of labels) {
    const id = getMetricLabelId(label);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    options.push({ label: label.key, value: id, group: groups[label.source] });
  }
  const order: Array<MetricLabel['source']> = ['column', 'resource', 'attribute', 'scope'];
  const rank = (option: ComboboxOption<string>) => order.indexOf(parseMetricLabelId(option.value)!.source);
  return options.sort((a, b) => rank(a) - rank(b) || String(a.label).localeCompare(String(b.label)));
};
