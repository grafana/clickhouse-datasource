import React, { useEffect, useMemo, useState } from 'react';
import { Button, Combobox, ComboboxOption, InlineField, InlineFormLabel, Stack } from '@grafana/ui';
import { Datasource } from 'data/CHDatasource';
import {
  getMetricFilterDisplayName,
  getMetricLabelId,
  metricColumnLabels,
  MetricTables,
  parseMetricLabelId,
} from 'data/metrics';
import { Filter, MetricLabel, MetricType } from 'types/queryBuilder';
import { FilterTagBar } from '../FilterTagBar';
import { getMetricLabelOptions, MetricLabelFilterEditor } from './MetricLabelFilterEditor';
import { useMetricCatalog, useMetricLabelKeys, useMetricTables } from './useMetricsMetadata';

/** The parts of a variable query the metrics variable types use. */
export interface MetricVariableFields {
  queryType: 'metricNames' | 'metricLabelValues';
  database?: string;
  metricName?: string;
  metricType?: MetricType;
  metricLabel?: MetricLabel;
  metricFilters?: Filter[];
  /** The tables the query reads, resolved when the variable is edited. */
  metricTables?: string[];
  jsonAttributes?: boolean;
}

interface Props {
  datasource: Datasource;
  query: MetricVariableFields;
  onChange: (changes: Partial<MetricVariableFields>) => void;
}

/** The tables to read: the picked metric's table, or every metric table. */
const getVariableTables = (tables: MetricTables, metricType?: MetricType): string[] =>
  metricType ? [tables[metricType]].filter((t): t is string => Boolean(t)) : Object.values(tables);

const label = (text: string, tooltip: string) => (
  <InlineFormLabel width={10} className="query-keyword" tooltip={tooltip}>
    {text}
  </InlineFormLabel>
);

/**
 * Editor of the metrics variable types: metric names, and the values of a label like
 * Prometheus' label_values(), optionally for one metric and filtered by other labels.
 */
export const MetricVariableEditor = ({ datasource, query, onChange }: Props) => {
  const database = datasource.getDefaultMetricsDatabase();
  const tables = useMetricTables(datasource);
  const catalog = useMetricCatalog(datasource, '', 0);
  const [showFilterEditor, setShowFilterEditor] = useState(false);
  const metricTable = query.metricType ? tables.value[query.metricType] || '' : '';
  const labelKeys = useMetricLabelKeys(
    datasource,
    database,
    metricTable,
    query.metricName || '',
    query.jsonAttributes,
    ''
  );

  // Record the tables to read once they are known, so the generated SQL reads only those.
  const resolvedTables = useMemo(
    () => getVariableTables(tables.value, query.metricType),
    [tables.value, query.metricType]
  );
  useEffect(() => {
    if (tables.loading || !resolvedTables.length) {
      return;
    }
    if (query.database !== database || resolvedTables.join() !== (query.metricTables || []).join()) {
      onChange({ database, metricTables: resolvedTables });
    }
  }, [database, onChange, query.database, query.metricTables, resolvedTables, tables.loading]);

  const metricOptions = useMemo<Array<ComboboxOption<string>>>(
    () => catalog.value.map((entry) => ({ label: entry.name, value: `${entry.type}:${entry.name}` })),
    [catalog.value]
  );
  const labelOptions = useMemo(
    () =>
      getMetricLabelOptions([
        ...metricColumnLabels,
        ...labelKeys.value,
        ...(query.metricLabel ? [query.metricLabel] : []),
      ]),
    [labelKeys.value, query.metricLabel]
  );

  const onMetricChange = async (option: ComboboxOption<string> | null) => {
    if (!option) {
      onChange({ metricName: undefined, metricType: undefined, metricTables: getVariableTables(tables.value) });
      return;
    }
    const separator = option.value.indexOf(':');
    const metricType = option.value.slice(0, separator) as MetricType;
    const metricTables = getVariableTables(tables.value, metricType);
    const features = metricTables[0]
      ? await datasource.getMetricTableFeatures(database, metricTables[0]).catch(() => ({ jsonAttributes: false }))
      : { jsonAttributes: false };
    onChange({
      metricName: option.value.slice(separator + 1),
      metricType,
      metricTables,
      jsonAttributes: Boolean(features.jsonAttributes),
    });
  };

  const filters = query.metricFilters || [];

  return (
    <div data-testid="metric-variable-editor">
      <InlineField label={label('Metric', 'Optional. Without a metric, every metric table is read.')}>
        <Combobox
          aria-label="Variable metric"
          options={metricOptions}
          value={
            query.metricName && query.metricType
              ? { value: `${query.metricType}:${query.metricName}`, label: query.metricName }
              : null
          }
          onChange={onMetricChange}
          isClearable
          loading={catalog.loading}
          placeholder={query.queryType === 'metricNames' ? 'All metrics' : 'Any metric'}
          width={40}
          disabled={query.queryType === 'metricNames'}
        />
      </InlineField>

      {query.queryType === 'metricLabelValues' && (
        <>
          <InlineField
            label={label('Label', 'The label whose values the variable lists. Attribute labels need a metric.')}
          >
            <Combobox
              aria-label="Variable label"
              options={labelOptions}
              value={query.metricLabel ? getMetricLabelId(query.metricLabel) : null}
              onChange={(option) => onChange({ metricLabel: parseMetricLabelId(option.value) })}
              loading={labelKeys.loading}
              placeholder="Label"
              width={40}
            />
          </InlineField>

          <InlineField
            label={label('Filters', 'Narrow the values, for example by another variable: service = $service.')}
          >
            <Stack direction="row" alignItems="center" gap={0.5} wrap="wrap">
              <FilterTagBar
                filters={filters}
                showLabel={false}
                getDisplayName={getMetricFilterDisplayName}
                onRemoveFilter={(index) => onChange({ metricFilters: filters.filter((_, i) => i !== index) })}
              />
              <Button icon="plus" variant="secondary" size="sm" fill="text" onClick={() => setShowFilterEditor(true)}>
                Add filter
              </Button>
            </Stack>
          </InlineField>
          {showFilterEditor && (
            <MetricLabelFilterEditor
              datasource={datasource}
              database={database}
              table={metricTable}
              metricName={query.metricName || ''}
              jsonAttributes={query.jsonAttributes}
              labelOptions={labelOptions}
              onAdd={(filter) => onChange({ metricFilters: [...filters, filter] })}
              onClose={() => setShowFilterEditor(false)}
            />
          )}
        </>
      )}
    </div>
  );
};
