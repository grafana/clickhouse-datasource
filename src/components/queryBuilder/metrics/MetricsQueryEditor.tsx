import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2, TimeRange } from '@grafana/data';
import {
  Alert,
  Badge,
  Button,
  Combobox,
  ComboboxOption,
  IconButton,
  InlineField,
  Input,
  MultiCombobox,
  RadioButtonGroup,
  Stack,
  Text,
  useStyles2,
} from '@grafana/ui';
import { Datasource } from 'data/CHDatasource';
import {
  buildMetricQuery,
  defaultQuantiles,
  formatQuantile,
  getDefaultSeriesAggregation,
  getMetricFilterDisplayName,
  getMetricFunctions,
  getMetricLabelId,
  metricAttributeColumns,
  MetricCatalogEntry,
  metricColumnLabels,
  MetricTableFeatures,
  metricFunctionLabels,
  metricTypeLabels,
  parseMetricLabelId,
  usesGroupBy,
  usesSeriesAggregation,
} from 'data/metrics';
import { BuilderOptionsReducerAction, setAllOptions } from 'hooks/useBuilderOptionsState';
import {
  Filter,
  MetricFunction,
  MetricLabel,
  MetricQuery,
  MetricSeriesAggregation,
  MetricType,
  QueryBuilderOptions,
  QueryType,
} from 'types/queryBuilder';
import { selectors } from 'selectors';
import { buildCompactMetricsDefaults } from '../compactQueryDefaults';
import { FilterTagBar } from '../FilterTagBar';
import { SqlPreview } from '../SqlPreview';
import { useMinIntervalDraft } from 'components/MinIntervalEditor';
import labels from 'labels';
import { getMetricLabelOptions, MetricLabelFilterEditor } from './MetricLabelFilterEditor';
import {
  useMetricCatalog,
  useMetricHealth,
  useMetricLabelKeys,
  useMetricTables,
  useSummaryQuantiles,
} from './useMetricsMetadata';

const editorSelectors = selectors.components.QueryBuilder.MetricsEditor;

interface MetricsQueryEditorProps {
  datasource: Datasource;
  builderOptions: QueryBuilderOptions;
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>;
  generatedSql: string;
  range?: TimeRange;
  minInterval?: string;
  onQueryChange?: (builderOptions: QueryBuilderOptions) => void;
  onEditAsSql?: (builderOptions: QueryBuilderOptions) => void;
  onMinIntervalChange?: (minInterval: string) => void;
  onRunQuery?: () => void;
}

const aggregationOptions: Array<{ label: string; value: MetricSeriesAggregation; description: string }> = [
  { label: 'sum', value: MetricSeriesAggregation.Sum, description: 'Add up the series of each group' },
  { label: 'avg', value: MetricSeriesAggregation.Avg, description: 'Average the series of each group' },
  { label: 'min', value: MetricSeriesAggregation.Min, description: 'Lowest series of each group' },
  { label: 'max', value: MetricSeriesAggregation.Max, description: 'Highest series of each group' },
  { label: 'count', value: MetricSeriesAggregation.Count, description: 'Number of series in each group' },
];

const metricOptionValue = (entry: Pick<MetricCatalogEntry, 'type' | 'name'>) => `${entry.type}:${entry.name}`;

const parseMetricOptionValue = (value: string): { type: MetricType; name: string } => {
  const separator = value.indexOf(':');
  return { type: value.slice(0, separator) as MetricType, name: value.slice(separator + 1) };
};

const describeMetric = (entry: Pick<MetricCatalogEntry, 'type' | 'unit' | 'description' | 'isMonotonic'>): string => {
  const kind =
    entry.type === MetricType.Sum ? (entry.isMonotonic ? 'Counter' : 'Up-down counter') : metricTypeLabels[entry.type];
  return [kind, entry.unit && `unit ${entry.unit}`, entry.description].filter(Boolean).join(' · ');
};

const attributeSources: Record<string, MetricLabel['source']> = Object.fromEntries(
  Object.entries(metricAttributeColumns).map(([source, column]) => [column, source as MetricLabel['source']])
);

/**
 * Keeps the group by labels and label filters that apply to a metric with the given attribute
 * keys. Column labels (ServiceName, ScopeName) exist on every metric and are always kept.
 */
export const keepSharedLabels = (
  groupBy: MetricLabel[],
  filters: Filter[],
  metricLabels: readonly MetricLabel[]
): { groupBy: MetricLabel[]; filters: Filter[] } => {
  const available = new Set(metricLabels.map(getMetricLabelId));
  const hasLabel = (label: MetricLabel) => label.source === 'column' || available.has(getMetricLabelId(label));
  return {
    groupBy: groupBy.filter(hasLabel),
    filters: filters.filter((filter) => {
      const source = attributeSources[filter.key];
      return !source || !filter.mapKey || hasLabel({ source, key: filter.mapKey });
    }),
  };
};

/**
 * Summaries only hold the quantiles their client reports (for example 0, 0.25, 0.5, 0.75 and 1 for
 * Go runtime summaries), so asking for another one charts nothing. Keeps the wanted quantiles the
 * summary reports, else picks its highest quantile below the maximum.
 */
export const pickSummaryQuantiles = (wanted: number[], reported: number[]): number[] => {
  if (!reported.length) {
    return wanted;
  }
  const kept = wanted.filter((q) => reported.includes(q));
  if (kept.length) {
    return kept;
  }
  const belowMax = reported.filter((q) => q < 1);
  return [belowMax.length ? Math.max(...belowMax) : Math.max(...reported)];
};

/** Parses a typed quantile: `0.95`, `95`, `p95` or `p99.9`. */
export const parseQuantile = (text: string): number | undefined => {
  const trimmed = text.trim().toLowerCase();
  const percent = trimmed.startsWith('p');
  let value = Number(percent ? trimmed.slice(1) : trimmed);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  if (percent || value > 1) {
    value = value / 100;
  }
  return value >= 0 && value <= 1 ? value : undefined;
};

const getStyles = (theme: GrafanaTheme2) => ({
  section: css`
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: ${theme.spacing(1)};
    padding: ${theme.spacing(0.5)} 0;
  `,
  description: css`
    padding-bottom: ${theme.spacing(0.5)};
  `,
});

/**
 * The query editor of a single-table data source with the metrics signal. Its flow mirrors a
 * PromQL builder: pick a metric, pick what to compute (the options depend on the metric type),
 * aggregate the series by labels and narrow them with label filters. The table holding the metric
 * is picked automatically.
 */
export const MetricsQueryEditor = (props: MetricsQueryEditorProps) => {
  const {
    datasource,
    builderOptions,
    builderOptionsDispatch,
    generatedSql,
    range,
    minInterval,
    onQueryChange,
    onEditAsSql,
    onMinIntervalChange,
    onRunQuery,
  } = props;
  const styles = useStyles2(getStyles);
  const database = datasource.getDefaultMetricsDatabase();
  const metric = builderOptions.metric;
  const rangeKey = range ? `${String(range.raw.from)}|${String(range.raw.to)}` : '';
  const [reloadKey, setReloadKey] = useState(0);
  const [showFilterEditor, setShowFilterEditor] = useState(false);

  const tables = useMetricTables(datasource);
  const catalog = useMetricCatalog(datasource, rangeKey, reloadKey);
  const labelKeys = useMetricLabelKeys(
    datasource,
    builderOptions.database,
    builderOptions.table,
    metric?.name || '',
    metric?.jsonAttributes,
    rangeKey
  );
  const health = useMetricHealth(datasource, builderOptions.database, builderOptions.table, metric);
  const summaryQuantiles = useSummaryQuantiles(
    datasource,
    builderOptions.database,
    builderOptions.table,
    metric?.name || '',
    metric?.type === MetricType.Summary
  );

  // The latest options and callbacks, so results of async lookups are applied to what the user sees
  // when they arrive, not to the options they were requested for.
  const latest = useRef({ builderOptions, onQueryChange, onRunQuery });
  useEffect(() => {
    latest.current = { builderOptions, onQueryChange, onRunQuery };
  }, [builderOptions, onQueryChange, onRunQuery]);

  const apply = useCallback(
    (next: QueryBuilderOptions, run = true) => {
      builderOptionsDispatch(setAllOptions(next));
      latest.current.builderOptions = next;
      latest.current.onQueryChange?.(next);
      if (run) {
        latest.current.onRunQuery?.();
      }
    },
    [builderOptionsDispatch]
  );

  // A new or empty query becomes an empty metrics query, which shows the metric browser.
  useEffect(() => {
    if (!metric) {
      apply({ ...buildCompactMetricsDefaults(datasource), meta: builderOptions.meta }, false);
    }
  }, [apply, builderOptions.meta, datasource, metric]);

  // The table follows the data source settings: a query carried over from another data source, or
  // saved before the table names changed, is pointed at this data source's table for its type.
  const expectedTable = metric?.name ? tables.value[metric.type] : undefined;
  useEffect(() => {
    if (expectedTable && (builderOptions.table !== expectedTable || builderOptions.database !== database)) {
      apply({ ...builderOptions, database, table: expectedTable });
    }
  }, [apply, builderOptions, database, expectedTable]);

  const updateMetric = (changes: Partial<MetricQuery>, run = true) => {
    if (!metric) {
      return;
    }
    apply({ ...builderOptions, metric: { ...metric, ...changes } }, run);
  };

  // Picking a metric runs a few lookups for it. Only the latest pick is applied, on top of any
  // edits made while the lookups ran.
  const lastPick = useRef(0);
  const onMetricChange = async (value: string) => {
    const pick = ++lastPick.current;
    const { type, name } = parseMetricOptionValue(value);
    const entry = catalog.value.find((e) => e.type === type && e.name === name) ?? {
      type,
      name,
      unit: '',
      description: '',
      isMonotonic: false,
    };
    const table = tables.value[type] ?? datasource.getConfiguredMetricTables()[type];
    const features: MetricTableFeatures = await datasource.getMetricTableFeatures(database, table).catch(() => ({}));
    const jsonAttributes = Boolean(features.jsonAttributes);
    const [labels, reportedQuantiles, metricHealth] = await Promise.all([
      metric?.name
        ? datasource.fetchMetricLabelKeys(database, table, name, jsonAttributes).catch(() => [])
        : Promise.resolve([]),
      type === MetricType.Summary
        ? datasource.fetchSummaryQuantiles(database, table, name).catch(() => [])
        : Promise.resolve([]),
      datasource.fetchMetricHealth(database, table, name, type, features).catch(() => undefined),
    ]);
    if (pick !== lastPick.current) {
      return;
    }

    const current = latest.current.builderOptions;
    const nextMetric = buildMetricQuery(entry, current.metric?.name ? current.metric : undefined);
    if (nextMetric.fn === MetricFunction.Quantile && type === MetricType.Summary) {
      nextMetric.quantiles = pickSummaryQuantiles(nextMetric.quantiles || [], reportedQuantiles);
    }
    // Labels the new metric does not have would group or filter on empty values. When its labels
    // could not be listed (none in range, discovery off, or an error), all are kept.
    const { groupBy, filters } = labels.length
      ? keepSharedLabels(nextMetric.groupBy, current.filters || [], labels)
      : { groupBy: nextMetric.groupBy, filters: current.filters };
    // Twice the export interval, so every series has a point in each bucket despite jitter.
    const minStep = metricHealth?.exportInterval ? metricHealth.exportInterval * 2 : undefined;
    apply({
      ...current,
      database,
      table,
      queryType: QueryType.TimeSeries,
      filters,
      metric: { ...nextMetric, groupBy, jsonAttributes, minStep },
    });
  };

  const metricOptions = useMemo<Array<ComboboxOption<string>>>(
    () =>
      catalog.value.map((entry) => ({
        label: entry.name,
        value: metricOptionValue(entry),
        description: describeMetric(entry),
      })),
    [catalog.value]
  );
  const currentEntry = metric?.name
    ? catalog.value.find((e) => e.name === metric.name && e.type === metric.type)
    : undefined;

  const labelOptions = useMemo(() => {
    const selected = [...(metric?.groupBy || [])];
    return getMetricLabelOptions([...metricColumnLabels, ...labelKeys.value, ...selected]);
  }, [labelKeys.value, metric?.groupBy]);

  if (!metric) {
    return null;
  }

  const functions = metric.name ? getMetricFunctions(metric.type, metric.isMonotonic) : [];
  const functionOptions = functions.map((fn) => ({
    label: metricFunctionLabels[fn].label,
    value: fn,
    description: metricFunctionLabels[fn].description,
  }));
  const showQuantiles = metric.fn === MetricFunction.Quantile;
  const availableQuantiles =
    metric.type === MetricType.Summary && summaryQuantiles.value.length ? summaryQuantiles.value : defaultQuantiles;
  const quantileOptions = Array.from(new Set([...availableQuantiles, ...(metric.quantiles || [])]))
    .sort((a, b) => a - b)
    .map((q) => ({ label: formatQuantile(q), value: String(q) }));
  const missingTypeTable = Boolean(metric.name) && !tables.loading && !tables.value[metric.type];
  const noTables = !tables.loading && !tables.error && Object.keys(tables.value).length === 0;

  const onFunctionChange = (fn: MetricFunction) => {
    const quantiles =
      fn === MetricFunction.Quantile
        ? metric.quantiles?.length
          ? metric.quantiles
          : metric.type === MetricType.Summary && summaryQuantiles.value.length
            ? [summaryQuantiles.value[summaryQuantiles.value.length - 1]]
            : [0.95]
        : undefined;
    updateMetric({ fn, quantiles, aggregation: getDefaultSeriesAggregation(metric.type, fn) });
  };

  const onGroupByChange = (options: Array<ComboboxOption<string>>) => {
    const groupBy = options
      .map((option) => parseMetricLabelId(option.value))
      .filter((label): label is MetricLabel => Boolean(label));
    updateMetric({ groupBy });
  };

  const filters = builderOptions.filters || [];
  const onFiltersChange = (next: Filter[]) => apply({ ...builderOptions, filters: next });

  return (
    <div data-testid="query-editor-section-builder">
      <div data-testid={editorSelectors.root}>
        {tables.error && (
          <Alert severity="error" title="Could not list the metric tables">
            {tables.error}
          </Alert>
        )}
        {noTables && (
          <Alert severity="warning" title="No OTel metric tables found">
            {`The database "${database}" has none of the configured metric tables. Check the metrics settings of this data source.`}
          </Alert>
        )}
        {catalog.error && (
          <Alert severity="error" title="Could not list the metrics">
            {catalog.error}
          </Alert>
        )}

        <div className={styles.section}>
          <InlineField label="Metric" labelWidth={14} grow>
            <div data-testid={editorSelectors.metricPicker}>
              <Combobox
                aria-label="Metric"
                options={metricOptions}
                value={
                  metric.name
                    ? { value: metricOptionValue(metric), label: metric.name, description: currentEntry?.description }
                    : null
                }
                onChange={(option) => onMetricChange(option.value)}
                loading={catalog.loading}
                placeholder={catalog.loading ? 'Loading metrics...' : `Search ${metricOptions.length} metrics`}
                width={60}
              />
            </div>
          </InlineField>
          <IconButton
            name="sync"
            tooltip="Reload the metric list"
            aria-label="Reload metrics"
            onClick={() => setReloadKey((key) => key + 1)}
          />
          {metric.name && (
            <Badge
              color={metric.type === MetricType.Gauge ? 'blue' : metric.type === MetricType.Sum ? 'green' : 'purple'}
              text={describeMetric({ ...metric, unit: '', description: '', isMonotonic: Boolean(metric.isMonotonic) })}
            />
          )}
        </div>
        {metric.name && (currentEntry?.description || metric.unit) && (
          <div className={styles.description}>
            <Text color="secondary" variant="bodySmall">
              {[currentEntry?.description, metric.unit && `Unit: ${metric.unit}`].filter(Boolean).join(' · ')}
            </Text>
          </div>
        )}
        {metric.name && health.value.sharedSeries > 0 && (
          <Alert
            severity="warning"
            title={`${health.value.sharedSeries} of ${health.value.series} series look shared by several instances`}
            data-testid={editorSelectors.identityWarning}
          >
            These series get points from several writers with identical resource attributes (or from one that restarts
            constantly), so their values mix and rates, increases and averages are wrong. Give every instance a unique{' '}
            <code>service.instance.id</code>, for example with the Collector&apos;s k8sattributes or resourcedetection
            processor.
          </Alert>
        )}
        {missingTypeTable && (
          <Alert severity="warning" title={`No ${metricTypeLabels[metric.type].toLowerCase()} table`}>
            {`The table for ${metricTypeLabels[metric.type].toLowerCase()} metrics was not found in "${database}".`}
          </Alert>
        )}

        {metric.name && (
          <>
            <div className={styles.section}>
              <InlineField label="Function" labelWidth={14}>
                <div data-testid={editorSelectors.functionPicker}>
                  <Combobox
                    aria-label="Function"
                    options={functionOptions}
                    value={metric.fn}
                    onChange={(option) => onFunctionChange(option.value)}
                    width={24}
                  />
                </div>
              </InlineField>
              {showQuantiles && (
                <InlineField label="Quantiles" tooltip="Type a custom quantile such as 0.75 or p99.9">
                  <div data-testid={editorSelectors.quantilesPicker}>
                    <MultiCombobox
                      aria-label="Quantiles"
                      options={quantileOptions}
                      value={(metric.quantiles || []).map(String)}
                      onChange={(options) => {
                        const quantiles = options
                          .map((option) => parseQuantile(option.value))
                          .filter((q): q is number => q !== undefined);
                        updateMetric({ quantiles: Array.from(new Set(quantiles)).sort((a, b) => a - b) });
                      }}
                      createCustomValue={metric.type === MetricType.Histogram}
                      width="auto"
                      minWidth={20}
                    />
                  </div>
                </InlineField>
              )}
            </div>

            {usesGroupBy(metric.fn) && (
              <div className={styles.section}>
                {usesSeriesAggregation(metric.type, metric.fn) && (
                  <InlineField label="Aggregate" labelWidth={14}>
                    <div data-testid={editorSelectors.aggregationPicker}>
                      <RadioButtonGroup
                        options={aggregationOptions}
                        value={metric.aggregation}
                        onChange={(aggregation) => updateMetric({ aggregation })}
                      />
                    </div>
                  </InlineField>
                )}
                <InlineField
                  label={usesSeriesAggregation(metric.type, metric.fn) ? 'by' : 'Group by'}
                  labelWidth={usesSeriesAggregation(metric.type, metric.fn) ? undefined : 14}
                  tooltip="One series per combination of these labels. Leave empty for a single series."
                  grow
                >
                  <div data-testid={editorSelectors.groupByPicker}>
                    <MultiCombobox
                      aria-label="Group by"
                      options={labelOptions}
                      value={metric.groupBy.map(getMetricLabelId)}
                      onChange={onGroupByChange}
                      loading={labelKeys.loading}
                      placeholder="Labels"
                      width="auto"
                      minWidth={30}
                    />
                  </div>
                </InlineField>
              </div>
            )}

            <div className={styles.section}>
              <InlineField label="Filters" labelWidth={14}>
                <Stack direction="row" alignItems="center" gap={0.5} wrap="wrap">
                  <FilterTagBar
                    filters={filters}
                    showLabel={false}
                    getDisplayName={getMetricFilterDisplayName}
                    onRemoveFilter={(index) => onFiltersChange(filters.filter((_, i) => i !== index))}
                  />
                  <Button
                    data-testid={editorSelectors.addFilterButton}
                    icon="plus"
                    variant="secondary"
                    size="sm"
                    fill="text"
                    onClick={() => setShowFilterEditor(!showFilterEditor)}
                  >
                    Add filter
                  </Button>
                </Stack>
              </InlineField>
            </div>
            {showFilterEditor && (
              <MetricLabelFilterEditor
                datasource={datasource}
                database={builderOptions.database}
                table={builderOptions.table}
                metricName={metric.name}
                jsonAttributes={metric.jsonAttributes}
                labelOptions={labelOptions}
                onAdd={(filter) => onFiltersChange([...filters, filter])}
                onClose={() => setShowFilterEditor(false)}
              />
            )}

            <div className={styles.section}>
              {onMinIntervalChange && (
                <MetricMinInterval
                  minInterval={minInterval}
                  onMinIntervalChange={onMinIntervalChange}
                  minStep={metric.minStep}
                />
              )}
            </div>
          </>
        )}
      </div>

      <SqlPreview sql={generatedSql} compact onEditAsSql={() => onEditAsSql?.(builderOptions)} />
    </div>
  );
};

/**
 * Min interval with a plain label like the editor's other fields. When empty, the placeholder
 * shows the floor applied automatically (twice the metric's export interval), explained in the
 * tooltip.
 */
const MetricMinInterval = (props: {
  minInterval?: string;
  onMinIntervalChange: (minInterval: string) => void;
  minStep?: number;
}) => {
  const { minInterval, onMinIntervalChange, minStep } = props;
  const { draft, setDraft, invalid, commit } = useMinIntervalDraft(minInterval, onMinIntervalChange);
  const text = labels.components.MinIntervalEditor;
  const placeholder = minStep ? `auto (≥ ${minStep}s)` : text.placeholder;
  const tooltip = minStep
    ? `${text.tooltip} This metric is exported every ${minStep / 2}s, so its resolution is at least ${minStep}s.`
    : text.tooltip;

  return (
    <InlineField label={text.label} labelWidth={14} tooltip={tooltip} invalid={invalid} error={text.error}>
      <Input
        data-testid={selectors.components.QueryEditor.MinIntervalEditor.input}
        aria-label={text.label}
        width={Math.max(10, placeholder.length + 2)}
        value={draft}
        invalid={invalid}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </InlineField>
  );
};
