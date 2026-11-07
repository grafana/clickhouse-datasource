/**
 * OTel metrics support for the opentelemetry-collector-contrib ClickHouse exporter schema.
 *
 * The exporter writes one table per data point type (gauge, sum, histogram, exponential
 * histogram, summary). They share the identifying columns (MetricName, ServiceName,
 * ResourceAttributes, ScopeName, ScopeAttributes, Attributes, TimeUnix), so this module
 * treats them as one source: a metric is picked by name, its type tells which table holds
 * it and which functions make sense for it.
 *
 * Queries aggregate in two steps, the way PromQL does: a per-series value per time bucket
 * (`avg_over_time`, `rate`), then a cross-series aggregation per group (`sum by (...)`).
 * A series is one combination of resource, scope and data point attributes.
 *
 * Everything here builds SQL strings and has no Grafana runtime dependency, so it is unit
 * testable on its own. The data source runs the discovery queries.
 */
import {
  Filter,
  FilterOperator,
  MetricFunction,
  MetricLabel,
  MetricLabelSource,
  MetricQuery,
  MetricSeriesAggregation,
  MetricType,
  QueryBuilderOptions,
  QueryType,
} from 'types/queryBuilder';
import { CHMetricsConfig } from 'types/config';
import { defaultMetricsTables, legacyExponentialHistogramTable } from 'otel';
import { buildJSONPathAccess } from './jsonPath';
import { escapeCHStringLiteral, escapeIdentifier, getFilters, getTableIdentifier } from './sqlGenerator';

export const metricTypes: readonly MetricType[] = [
  MetricType.Gauge,
  MetricType.Sum,
  MetricType.Histogram,
  MetricType.ExponentialHistogram,
  MetricType.Summary,
];

export const metricTypeLabels: Record<MetricType, string> = {
  [MetricType.Gauge]: 'Gauge',
  [MetricType.Sum]: 'Sum',
  [MetricType.Histogram]: 'Histogram',
  [MetricType.ExponentialHistogram]: 'Exponential histogram',
  [MetricType.Summary]: 'Summary',
};

/** The config key holding each type's table name. */
const metricTableConfigKeys: Record<MetricType, keyof typeof defaultMetricsTables> = {
  [MetricType.Gauge]: 'gaugeTable',
  [MetricType.Sum]: 'sumTable',
  [MetricType.Histogram]: 'histogramTable',
  [MetricType.ExponentialHistogram]: 'exponentialHistogramTable',
  [MetricType.Summary]: 'summaryTable',
};

export type MetricTables = Partial<Record<MetricType, string>>;

/** The configured table name of every metric type, falling back to the exporter defaults. */
export const getConfiguredMetricTables = (config?: CHMetricsConfig): Record<MetricType, string> => {
  const tables = {} as Record<MetricType, string>;
  for (const type of metricTypes) {
    const key = metricTableConfigKeys[type];
    tables[type] = config?.[key]?.trim() || defaultMetricsTables[key];
  }
  return tables;
};

/**
 * The metric tables that exist in the database. A type whose table is missing is left out, so a
 * setup without summaries (or with only some types) still works. Exporter versions before the
 * `metrics_tables` option named the exponential histogram table differently, so when the default
 * name is missing the legacy name is used instead.
 */
export const resolveMetricTables = (
  configured: Record<MetricType, string>,
  existingTables: readonly string[]
): MetricTables => {
  const existing = new Set(existingTables);
  const resolved: MetricTables = {};
  for (const type of metricTypes) {
    const table = configured[type];
    if (existing.has(table)) {
      resolved[type] = table;
    } else if (
      type === MetricType.ExponentialHistogram &&
      table === defaultMetricsTables.exponentialHistogramTable &&
      existing.has(legacyExponentialHistogramTable)
    ) {
      resolved[type] = legacyExponentialHistogramTable;
    }
  }
  return resolved;
};

/** A single-quoted ClickHouse string literal. */
export const quoteString = (value: string): string => `'${escapeCHStringLiteral(value)}'`;

/** The time column shared by every metric table. */
export const metricTimeColumn = 'TimeUnix';
const timeRangeCondition = `${metricTimeColumn} >= $__fromTime AND ${metricTimeColumn} <= $__toTime`;

/**
 * The editor's lookups (metric list, label keys and values) read at most the last 6 hours of the
 * dashboard range, like the plugin's other key discovery probes. On a 30 day range they would
 * otherwise read every row of every metric table just to fill a drop-down.
 */
const discoveryTimeCondition = `${metricTimeColumn} >= greatest($__fromTime, subtractHours($__toTime, 6)) AND ${metricTimeColumn} <= $__toTime`;

/**
 * Counters need the point before each bucket to compute its increase, so rows are read from a
 * little before the time range: at least one interval, and at least 10 minutes to cover common
 * export intervals when the dashboard interval is shorter.
 */
const readFromBeforeRangeCondition = `${metricTimeColumn} >= subtractSeconds($__fromTime, greatest($__interval_s, 600)) AND ${metricTimeColumn} <= $__toTime`;

export const metricAttributeColumns: Record<Exclude<MetricLabelSource, 'column'>, string> = {
  attribute: 'Attributes',
  resource: 'ResourceAttributes',
  scope: 'ScopeAttributes',
};

/** Top level columns offered as labels next to the attribute keys. */
export const metricColumnLabels: readonly MetricLabel[] = [
  { source: 'column', key: 'ServiceName' },
  { source: 'column', key: 'ScopeName' },
];

/** The SQL expression reading a label. Missing attributes read as an empty string. */
export const getMetricLabelExpression = (label: MetricLabel, jsonAttributes = false): string => {
  if (label.source === 'column') {
    return escapeIdentifier(label.key);
  }

  const column = metricAttributeColumns[label.source];
  if (jsonAttributes) {
    return `ifNull(${buildJSONPathAccess(column, label.key)}, '')`;
  }
  return `${column}[${quoteString(label.key)}]`;
};

/** The metric label a builder filter reads, or undefined for a filter on another column. */
export const getFilterMetricLabel = (filter: Filter): MetricLabel | undefined => {
  const source = (Object.keys(metricAttributeColumns) as Array<keyof typeof metricAttributeColumns>).find(
    (s) => metricAttributeColumns[s] === filter.key
  );
  if (source) {
    return filter.mapKey ? { source, key: filter.mapKey } : undefined;
  }
  return filter.key && !filter.mapKey ? { source: 'column', key: filter.key } : undefined;
};

/** The name a label filter shows in its chip: the label key, like in the label pickers. */
export const getMetricFilterDisplayName = (filter: Filter): string =>
  getFilterMetricLabel(filter)?.key ?? (filter.mapKey ? `${filter.key}.${filter.mapKey}` : filter.key);

/** The name of the dashboard variable a value refers to: `$name`, `${name}`, `${name:format}` or `[[name]]`. */
export const getVariableName = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const match = /^\$(\w+)$|^\$\{(\w+)(?::[^}]*)?\}$|^\[\[(\w+)(?::[^\]]*)?\]\]$/.exec(value.trim());
  return match?.[1] ?? match?.[2] ?? match?.[3];
};

/**
 * A label filter whose value is a dashboard variable, as SQL. Variables interpolate unquoted for
 * a single value and as a list for several, so the value goes through `${name:singlequote}` into
 * an IN list, which works for one, several or all values. When the variable is set to All, the
 * filter is dropped with $__conditionalAll instead of listing every value.
 */
const getVariableFilterSql = (filter: Filter, label: MetricLabel, jsonAttributes?: boolean): string | undefined => {
  const isEquality = filter.operator === FilterOperator.Equals || filter.operator === FilterOperator.In;
  const isInequality = filter.operator === FilterOperator.NotEquals || filter.operator === FilterOperator.NotIn;
  const values: unknown[] = 'value' in filter ? (Array.isArray(filter.value) ? filter.value : [filter.value]) : [];
  const variables = values.map(getVariableName);
  if ((!isEquality && !isInequality) || !variables.some(Boolean)) {
    return undefined;
  }

  const expression = getMetricLabelExpression(label, jsonAttributes);
  const items = values.map((value, i) =>
    variables[i] ? `\${${variables[i]}:singlequote}` : quoteString(String(value))
  );
  const condition = `${expression} ${isEquality ? 'IN' : 'NOT IN'} (${items.join(', ')})`;
  // $__conditionalAll splits its arguments on top level commas, which a label key could contain.
  if (values.length === 1 && !/[,()]/.test(label.key)) {
    return `$__conditionalAll(${condition}, $${variables[0]})`;
  }
  return condition;
};

/**
 * The label filters of a metrics query as SQL, joined with AND. Filters on dashboard variables
 * get variable-aware SQL; the rest use the builder's filter SQL.
 */
export const getMetricFilterSql = (filters: Filter[] = [], jsonAttributes?: boolean): string => {
  const conditions: string[] = [];
  const plain: Filter[] = [];
  for (const filter of filters) {
    const label = getFilterMetricLabel(filter);
    const variableSql = label && getVariableFilterSql(filter, label, jsonAttributes);
    if (variableSql) {
      conditions.push(`(${variableSql})`);
    } else {
      plain.push(filter);
    }
  }
  const plainSql = getFilters({ database: '', table: '', queryType: QueryType.TimeSeries, filters: plain });
  if (plainSql) {
    conditions.unshift(`(${plainSql})`);
  }
  return conditions.join(' AND ');
};

/**
 * A stable key identifying a label, used as option value in the editor. Attribute keys are
 * usually unique across sources, but nothing stops a data point attribute and a resource
 * attribute from sharing a key.
 */
export const getMetricLabelId = (label: MetricLabel): string => `${label.source}:${label.key}`;

export const parseMetricLabelId = (id: string): MetricLabel | undefined => {
  const separator = id.indexOf(':');
  const source = id.slice(0, separator) as MetricLabelSource;
  if (separator < 0 || !['attribute', 'resource', 'scope', 'column'].includes(source)) {
    return undefined;
  }
  return { source, key: id.slice(separator + 1) };
};

/**
 * The result column names of the group by labels. A label is named by its key, which is what
 * Grafana shows in legends. Names clashing with another label, or with the time column, are
 * prefixed with their source.
 */
export const getMetricLabelAliases = (labels: readonly MetricLabel[]): string[] => {
  const used = new Set<string>(['time']);
  return labels.map((label) => {
    let alias = label.key;
    if (used.has(alias)) {
      alias = `${label.source}.${label.key}`;
    }
    let suffix = 2;
    const base = alias;
    while (used.has(alias)) {
      alias = `${base}_${suffix++}`;
    }
    used.add(alias);
    return alias;
  });
};

/** Optional capabilities of a metric table, detected from its columns. */
export interface MetricTableFeatures {
  /** Attribute columns use the ClickHouse JSON type instead of Map (exporter option `json`). */
  jsonAttributes?: boolean;
}

/** Detects the table features from its column names and types. */
export const getMetricTableFeatures = (
  columns: ReadonlyArray<{ name: string; type: string }>
): MetricTableFeatures => ({
  jsonAttributes: columns.some((c) => c.name === 'Attributes' && c.type.startsWith('JSON')),
});

/**
 * Identifies a series: one combination of resource, scope and data point attributes. Hashing
 * keeps window partitions cheap, and toString lets JSON columns be hashed too.
 */
const getSeriesKeyExpression = (features: MetricTableFeatures = {}): string => {
  const wrap = (column: string) => (features.jsonAttributes ? `toString(${column})` : column);
  return `cityHash64(${wrap('ResourceAttributes')}, ScopeName, ${wrap('ScopeAttributes')}, ${wrap('Attributes')})`;
};

/** Whether a metric type and monotonicity behave like a counter. */
export const isCounterMetric = (type: MetricType, isMonotonic?: boolean): boolean =>
  type === MetricType.Sum && Boolean(isMonotonic);

/** The functions that apply to a metric, the default first. */
export const getMetricFunctions = (type: MetricType, isMonotonic?: boolean): MetricFunction[] => {
  switch (type) {
    case MetricType.Gauge:
      return [MetricFunction.Avg, MetricFunction.Min, MetricFunction.Max, MetricFunction.Last];
    case MetricType.Sum:
      return isMonotonic
        ? [MetricFunction.Rate, MetricFunction.Increase]
        : [MetricFunction.Last, MetricFunction.Avg, MetricFunction.Min, MetricFunction.Max];
    case MetricType.Histogram:
      return [
        MetricFunction.Quantile,
        MetricFunction.Rate,
        MetricFunction.Increase,
        MetricFunction.SumRate,
        MetricFunction.AvgValue,
      ];
    case MetricType.ExponentialHistogram:
      return [MetricFunction.Rate, MetricFunction.Increase, MetricFunction.SumRate, MetricFunction.AvgValue];
    case MetricType.Summary:
      return [
        MetricFunction.Quantile,
        MetricFunction.Rate,
        MetricFunction.Increase,
        MetricFunction.SumRate,
        MetricFunction.AvgValue,
      ];
  }
};

export const metricFunctionLabels: Record<MetricFunction, { label: string; description: string }> = {
  [MetricFunction.Avg]: { label: 'Average', description: 'Average value of each series per interval' },
  [MetricFunction.Min]: { label: 'Min', description: 'Lowest value of each series per interval' },
  [MetricFunction.Max]: { label: 'Max', description: 'Highest value of each series per interval' },
  [MetricFunction.Last]: { label: 'Last', description: 'Latest value of each series per interval' },
  [MetricFunction.Rate]: {
    label: 'Rate',
    description: 'Per-second increase of the counter (for histograms and summaries: observations per second)',
  },
  [MetricFunction.Increase]: {
    label: 'Increase',
    description: 'Increase of the counter per interval (for histograms and summaries: observations per interval)',
  },
  [MetricFunction.SumRate]: { label: 'Sum rate', description: 'Per-second increase of the sum of observations' },
  [MetricFunction.AvgValue]: { label: 'Average value', description: 'Sum of observations divided by their count' },
  [MetricFunction.Quantile]: {
    label: 'Quantile',
    description: 'Quantiles of the observed values, for example p95 latency',
  },
};

/**
 * Whether the cross-series aggregation is used. Histogram quantiles merge the buckets of all
 * series instead, and the average value divides the summed sums by the summed counts.
 */
export const usesSeriesAggregation = (type: MetricType, fn: MetricFunction): boolean =>
  fn !== MetricFunction.AvgValue && !(fn === MetricFunction.Quantile && type === MetricType.Histogram);

/** The cross-series aggregation picked by default for a function. */
export const getDefaultSeriesAggregation = (type: MetricType, fn: MetricFunction): MetricSeriesAggregation => {
  switch (fn) {
    case MetricFunction.Rate:
    case MetricFunction.Increase:
    case MetricFunction.SumRate:
      return MetricSeriesAggregation.Sum;
    case MetricFunction.Last:
      // Up-down counters (non-monotonic sums) such as active requests add up across series.
      return type === MetricType.Sum ? MetricSeriesAggregation.Sum : MetricSeriesAggregation.Avg;
    default:
      return MetricSeriesAggregation.Avg;
  }
};

export const defaultQuantiles: readonly number[] = [0.5, 0.9, 0.95, 0.99];

/**
 * A metric query for a newly picked metric. It keeps the group by of the previous metric (and its
 * function when the metric is of the same kind).
 */
export const buildMetricQuery = (
  entry: Pick<MetricQuery, 'name' | 'type' | 'unit' | 'isMonotonic'>,
  previous?: MetricQuery
): MetricQuery => {
  const functions = getMetricFunctions(entry.type, entry.isMonotonic);
  // Keep the previous function when switching between metrics of the same kind (two latency
  // histograms, two counters), so the panel does not reset. A different kind of metric gets its
  // own default: a histogram picked after a counter shows quantiles, not a count rate.
  const sameKind = previous?.type === entry.type && Boolean(previous.isMonotonic) === Boolean(entry.isMonotonic);
  const fn = sameKind && functions.includes(previous.fn) ? previous.fn : functions[0];
  const keepAggregation = sameKind && previous.fn === fn;
  return {
    name: entry.name,
    type: entry.type,
    unit: entry.unit || undefined,
    isMonotonic: entry.type === MetricType.Sum ? Boolean(entry.isMonotonic) : undefined,
    fn,
    quantiles: fn === MetricFunction.Quantile ? previous?.quantiles || [0.95] : undefined,
    aggregation: keepAggregation ? previous.aggregation : getDefaultSeriesAggregation(entry.type, fn),
    groupBy: previous?.groupBy || [],
    jsonAttributes: previous?.jsonAttributes,
  };
};

/** A quantile as a percentile name, for example 0.95 as p95 and 0.999 as p99.9. */
export const formatQuantile = (q: number): string => `p${Math.round(q * 10000) / 100}`;

/** The value column names of a query: one per quantile, or a single value. */
export const getMetricValueAliases = (metric: MetricQuery): string[] => {
  const quantiles = metric.fn === MetricFunction.Quantile ? getQuantiles(metric) : [];
  if (quantiles.length > 1) {
    return quantiles.map(formatQuantile);
  }
  if (quantiles.length === 1) {
    return [`${metric.name} ${formatQuantile(quantiles[0])}`];
  }
  return [metric.name];
};

const getQuantiles = (metric: MetricQuery): number[] => {
  const quantiles = (metric.quantiles || []).filter((q) => Number.isFinite(q) && q >= 0 && q <= 1);
  return quantiles.length ? Array.from(new Set(quantiles)) : [0.95];
};

const seriesAggregationSql = (aggregation: MetricSeriesAggregation, expression: string): string => {
  switch (aggregation) {
    case MetricSeriesAggregation.Sum:
      return `sum(${expression})`;
    case MetricSeriesAggregation.Min:
      return `min(${expression})`;
    case MetricSeriesAggregation.Max:
      return `max(${expression})`;
    case MetricSeriesAggregation.Count:
      return `count(${expression})`;
    case MetricSeriesAggregation.Avg:
    default:
      return `avg(${expression})`;
  }
};

const formatNumber = (value: number): string => {
  const text = String(value);
  return text.includes('.') || text.includes('e') ? text : `${text}.0`;
};

interface QueryContext {
  table: string;
  where: string;
  /** Label expressions with their inner (`__label_N`) and result aliases. */
  labels: Array<{ expression: string; inner: string; alias: string }>;
  seriesKey: string;
  valueAliases: string[];
}

const buildContext = (options: QueryBuilderOptions, metric: MetricQuery, timeCondition: string): QueryContext => {
  const aliases = getMetricLabelAliases(metric.groupBy);
  const labels = metric.groupBy.map((label, index) => ({
    expression: getMetricLabelExpression(label, metric.jsonAttributes),
    inner: `__label_${index}`,
    alias: aliases[index],
  }));

  const conditions = [`MetricName = ${quoteString(metric.name)}`, timeCondition];
  const filters = getMetricFilterSql(options.filters, metric.jsonAttributes);
  if (filters) {
    conditions.push(filters);
  }

  return {
    table: getTableIdentifier(options.database, options.table),
    where: conditions.join(' AND '),
    labels,
    seriesKey: getSeriesKeyExpression(metric),
    valueAliases: getMetricValueAliases(metric),
  };
};

const join = (parts: ReadonlyArray<string | undefined | false>): string => parts.filter(Boolean).join(', ');

const innerLabels = (ctx: QueryContext) => ctx.labels.map((l) => `${l.expression} AS ${l.inner}`);
const labelRefs = (ctx: QueryContext) => ctx.labels.map((l) => l.inner);
const outerLabels = (ctx: QueryContext) => ctx.labels.map((l) => `${l.inner} AS ${escapeIdentifier(l.alias)}`);

/**
 * The final SELECT: one row per time bucket and group, labels as string columns and the values
 * as numeric columns, which Grafana's time series format turns into one series per group.
 */
const outerQuery = (ctx: QueryContext, values: string[], from: string): string =>
  `SELECT ${join([
    '__time AS time',
    ...outerLabels(ctx),
    ...values.map((value, index) => `${value} AS ${escapeIdentifier(ctx.valueAliases[index] ?? `value_${index}`)}`),
  ])} FROM (${from}) GROUP BY ${join(['__time', ...labelRefs(ctx)])} ORDER BY time ASC`;

/** Gauges and non-monotonic sums: reduce each series per bucket, then aggregate across series. */
const generateValueQuery = (options: QueryBuilderOptions, metric: MetricQuery): string => {
  const ctx = buildContext(options, metric, timeRangeCondition);
  const perSeries =
    metric.fn === MetricFunction.Min
      ? 'min(Value)'
      : metric.fn === MetricFunction.Max
        ? 'max(Value)'
        : metric.fn === MetricFunction.Last
          ? `argMax(Value, ${metricTimeColumn})`
          : 'avg(Value)';

  const inner = `SELECT ${join([
    `${timeBucketExpression(metric)} AS __time`,
    ...innerLabels(ctx),
    `${ctx.seriesKey} AS __series`,
    `${perSeries} AS __value`,
  ])} FROM ${ctx.table} WHERE ${ctx.where} GROUP BY ${join(['__time', ...labelRefs(ctx), '__series'])}`;

  return outerQuery(ctx, [seriesAggregationSql(metric.aggregation, '__value')], inner);
};

/** The time bucket of a point: the dashboard interval, but never shorter than the metric's minStep. */
export const timeBucketExpression = (metric: MetricQuery, time: string = metricTimeColumn): string =>
  metric.minStep && metric.minStep > 0
    ? `toStartOfInterval(toDateTime(${time}), INTERVAL greatest($__interval_s, ${Math.round(metric.minStep)}) second)`
    : `$__timeInterval(${time})`;

/** Delta temporality points hold the increase themselves; cumulative ones need the previous point. */
const hasTemporality = (type: MetricType): boolean => type !== MetricType.Summary && type !== MetricType.Gauge;
const isDeltaExpression = (type: MetricType): string => (hasTemporality(type) ? 'AggregationTemporality = 1' : '0');

/**
 * Counters (monotonic sums, and the Count and Sum of histograms and summaries) are computed per run
 * of a series and time bucket first, so the work after reading scales with series x buckets, not
 * with the raw points of the range.
 *
 * A run is the points sharing one StartTimeUnix: OTel starts a new one when a counter restarts.
 * Inside a run the increase is exact (deltaSumTimestamp). Between consecutive runs or buckets of a
 * series, the first value is compared with the previous last value: a drop of the reset column
 * (the value itself, or the Count of a histogram) is a counter reset, after which the new value is
 * the increase, as in PromQL. Delta points are their own increase. Rows are read from slightly
 * before the time range, so the first bucket has a previous value.
 *
 * Rates divide by the seconds the increase covers (from the previous point, or a delta point's own
 * start to end), not by the bucket width, so they stay right when the dashboard interval is shorter
 * than the export interval.
 */
const pointOrder = `toUnixTimestamp64Nano(toDateTime64(${metricTimeColumn}, 9))`;
const runKey = (type: MetricType) => `if(${isDeltaExpression(type)}, toDateTime(0), StartTimeUnix) AS __run`;
const deltaPointSeconds = `if(StartTimeUnix > toDateTime(0) AND StartTimeUnix < ${metricTimeColumn}, dateDiff('millisecond', StartTimeUnix, ${metricTimeColumn}), 0) / 1000`;
const runWindow = 'WINDOW w AS (PARTITION BY __series ORDER BY __first_t ASC ROWS BETWEEN 1 PRECEDING AND CURRENT ROW)';

const generateCounterQuery = (
  options: QueryBuilderOptions,
  metric: MetricQuery,
  values: string[],
  resetColumn: string,
  combine: (deltas: string[], seconds: string) => string
): string => {
  const ctx = buildContext(options, metric, readFromBeforeRangeCondition);
  // First and last values are tracked for each value and the reset column (often the value itself).
  const tracked = values.includes(resetColumn) ? values : [...values, resetColumn];
  const reset = tracked.indexOf(resetColumn);

  const perRun = `SELECT ${join([
    `${timeBucketExpression(metric)} AS __time`,
    ...innerLabels(ctx),
    `${ctx.seriesKey} AS __series`,
    runKey(metric.type),
    `any(${isDeltaExpression(metric.type)}) AS __is_delta`,
    ...values.map(
      (value, i) =>
        `if(__is_delta, sum(toFloat64(${value})), deltaSumTimestamp(toFloat64(${value}), ${pointOrder})) AS __in${i}`
    ),
    ...tracked.flatMap((value, i) => [
      `argMin(toFloat64(${value}), ${metricTimeColumn}) AS __first${i}`,
      `argMax(toFloat64(${value}), ${metricTimeColumn}) AS __last${i}`,
    ]),
    `min(${metricTimeColumn}) AS __first_t`,
    `max(${metricTimeColumn}) AS __last_t`,
    `if(__is_delta, sum(${deltaPointSeconds}), dateDiff('millisecond', __first_t, __last_t) / 1000) AS __secs`,
  ])} FROM ${ctx.table} WHERE ${ctx.where} GROUP BY ${join(['__time', ...labelRefs(ctx), '__series', '__run'])}`;

  const withPrevious = `SELECT *, ${join([
    ...tracked.map((_, i) => `lagInFrame(toNullable(__last${i})) OVER w AS __prev${i}`),
    'lagInFrame(toNullable(__last_t)) OVER w AS __prev_t',
  ])} FROM (${perRun}) ${runWindow}`;

  const continued = `NOT __is_delta AND __prev${reset} IS NOT NULL`;
  const perSeries = `SELECT ${join([
    '__time',
    ...labelRefs(ctx),
    '__series',
    ...values.map(
      (_, i) =>
        `sum(__in${i} + if(${continued}, if(__first${reset} >= __prev${reset}, __first${i} - __prev${i}, __first${i}), 0)) AS __d${i}`
    ),
    `sum(__secs + if(${continued}, dateDiff('millisecond', __prev_t, __first_t) / 1000, 0)) AS __seconds`,
  ])} FROM (${withPrevious}) WHERE __time >= ${timeBucketExpression(metric, '$__fromTime')} GROUP BY ${join([
    '__time',
    ...labelRefs(ctx),
    '__series',
  ])}`;

  return outerQuery(
    ctx,
    [
      combine(
        values.map((_, i) => `__d${i}`),
        '__seconds'
      ),
    ],
    perSeries
  );
};

const generateHistogramQuantileQuery = (options: QueryBuilderOptions, metric: MetricQuery): string => {
  const ctx = buildContext(options, metric, readFromBeforeRangeCondition);
  const buckets = "CAST(BucketCounts, 'Array(Float64)')";
  const minus = (a: string, b: string) => `arrayMap((x, i) -> greatest(x - ${b}[i], 0.), ${a}, arrayEnumerate(${a}))`;

  const perRun = `SELECT ${join([
    `${timeBucketExpression(metric)} AS __time`,
    ...innerLabels(ctx),
    `${ctx.seriesKey} AS __series`,
    runKey(metric.type),
    `any(${isDeltaExpression(metric.type)}) AS __is_delta`,
    'any(ExplicitBounds) AS __point_bounds',
    `deltaSumTimestamp(toFloat64(Count), ${pointOrder}) AS __count_in`,
    `argMin(toFloat64(Count), ${metricTimeColumn}) AS __first_count`,
    `argMax(toFloat64(Count), ${metricTimeColumn}) AS __last_count`,
    `argMin(${buckets}, ${metricTimeColumn}) AS __first_b`,
    `argMax(${buckets}, ${metricTimeColumn}) AS __last_b`,
    `sumForEach(${buckets}) AS __sum_b`,
    `min(${metricTimeColumn}) AS __first_t`,
  ])} FROM ${ctx.table} WHERE ${ctx.where} GROUP BY ${join(['__time', ...labelRefs(ctx), '__series', '__run'])}`;

  const withPrevious = `SELECT *, lagInFrame(toNullable(__last_count)) OVER w AS __prev_count, lagInFrame(__last_b) OVER w AS __prev_b FROM (${perRun}) ${runWindow}`;

  // Bucket increases of a run plus those since the previous run or bucket of the series. A change in
  // the number of buckets reads as a reset; indexing instead of zipping keeps it from failing.
  const inRun = `if(__is_delta, __sum_b, if(__count_in = __last_count - __first_count, ${minus('__last_b', '__first_b')}, __last_b))`;
  const sincePrevious =
    `if(__is_delta OR __prev_count IS NULL, arrayMap(x -> 0., __first_b), ` +
    `if(__first_count >= __prev_count AND length(__prev_b) = length(__first_b), ${minus('__first_b', '__prev_b')}, __first_b))`;

  // Buckets of all series in a group add up, which is how histograms aggregate correctly.
  const perGroup = `SELECT ${join([
    '__time',
    ...labelRefs(ctx),
    `sumForEach(arrayMap((x, i) -> x + (${sincePrevious})[i], ${inRun}, arrayEnumerate(${inRun}))) AS __counts`,
    'any(__point_bounds) AS __bounds',
  ])} FROM (${withPrevious}) WHERE __time >= ${timeBucketExpression(metric, '$__fromTime')} GROUP BY ${join([
    '__time',
    ...labelRefs(ctx),
  ])}`;

  // Cumulative counts and the index of the bucket holding each quantile, named so the
  // interpolation below stays readable in the SQL editor.
  const quantiles = getQuantiles(metric);
  const withIndexes = `SELECT ${join([
    '__time',
    ...labelRefs(ctx),
    '__counts',
    '__bounds',
    'arrayCumSum(__counts) AS __cum',
    'arraySum(__counts) AS __total',
    ...quantiles.map((q, index) => `arrayFirstIndex(c -> c >= ${formatNumber(q)} * __total, __cum) AS __i${index}`),
  ])} FROM (${perGroup})`;

  return `SELECT ${join([
    '__time AS time',
    ...outerLabels(ctx),
    ...quantiles.map(
      (q, index) => `${histogramQuantileExpression(q, `__i${index}`)} AS ${escapeIdentifier(ctx.valueAliases[index])}`
    ),
  ])} FROM (${withIndexes}) ORDER BY time ASC`;
};

/**
 * The q-quantile of a histogram by linear interpolation within the bucket holding it, like
 * PromQL's histogram_quantile. Reads `__counts` (bucket counts), `__bounds` (explicit bounds),
 * `__cum` (cumulative counts), `__total` and the 1-based bucket index. Counts have one more entry
 * than bounds: the last bucket is unbounded and reads as the highest finite bound. The first
 * bucket starts at 0 unless its upper bound is negative. Empty histograms give NULL, which
 * Grafana shows as a gap.
 */
export const histogramQuantileExpression = (q: number, index: string): string => {
  const lower = `if(${index} = 1, least(0., __bounds[1]), __bounds[${index} - 1])`;
  const below = `if(${index} = 1, 0., __cum[${index} - 1])`;
  return (
    `if(__total = 0 OR empty(__bounds), NULL, ` +
    `if(${index} = 0 OR ${index} > length(__bounds), __bounds[length(__bounds)], ` +
    `${lower} + (__bounds[${index}] - ${lower}) * (${formatNumber(q)} * __total - ${below}) / __counts[${index}]))`
  );
};

/** Summaries carry precomputed quantiles per series, which are averaged per bucket. */
const generateSummaryQuantileQuery = (options: QueryBuilderOptions, metric: MetricQuery): string => {
  const ctx = buildContext(options, metric, timeRangeCondition);
  const quantiles = getQuantiles(metric);
  const inner = `SELECT ${join([
    `${timeBucketExpression(metric)} AS __time`,
    ...innerLabels(ctx),
    `${ctx.seriesKey} AS __series`,
    // A quantile the summary does not report, or reports as NaN (no observations in its window),
    // is missing rather than a value, so it neither turns the average into NaN nor counts as a series.
    ...quantiles.map((q, index) => {
      const at = `indexOf(ValueAtQuantiles.Quantile, ${formatNumber(q)})`;
      const value = `ValueAtQuantiles.Value[${at}]`;
      return `avg(if(${at} = 0 OR isNaN(${value}), NULL, ${value})) AS __q${index}`;
    }),
  ])} FROM ${ctx.table} WHERE ${ctx.where} GROUP BY ${join(['__time', ...labelRefs(ctx), '__series'])}`;

  return outerQuery(
    ctx,
    quantiles.map((_, index) => seriesAggregationSql(metric.aggregation, `__q${index}`)),
    inner
  );
};

/** Generates the SQL of a metrics query, or an empty string until a metric is picked. */
export const generateMetricsQuery = (options: QueryBuilderOptions): string => {
  const metric = options.metric;
  if (!metric?.name || !options.table) {
    return '';
  }

  const perSecond = (delta: string, seconds: string) => `${delta} / nullIf(${seconds}, 0)`;
  const aggregate = (expression: string) => seriesAggregationSql(metric.aggregation, expression);

  if (metric.type === MetricType.Gauge || (metric.type === MetricType.Sum && !metric.isMonotonic)) {
    return generateValueQuery(options, metric);
  }

  if (metric.type === MetricType.Sum) {
    return metric.fn === MetricFunction.Increase
      ? generateCounterQuery(options, metric, ['Value'], 'Value', ([d]) => aggregate(d))
      : generateCounterQuery(options, metric, ['Value'], 'Value', ([d], seconds) => aggregate(perSecond(d, seconds)));
  }

  // Histograms, exponential histograms and summaries.
  switch (metric.fn) {
    case MetricFunction.Quantile:
      if (metric.type === MetricType.Histogram) {
        return generateHistogramQuantileQuery(options, metric);
      }
      if (metric.type === MetricType.Summary) {
        return generateSummaryQuantileQuery(options, metric);
      }
      return generateCounterQuery(options, metric, ['Count'], 'Count', ([d], seconds) =>
        aggregate(perSecond(d, seconds))
      );
    case MetricFunction.Increase:
      return generateCounterQuery(options, metric, ['Count'], 'Count', ([d]) => aggregate(d));
    case MetricFunction.SumRate:
      return generateCounterQuery(options, metric, ['Sum'], 'Count', ([d], seconds) =>
        aggregate(perSecond(d, seconds))
      );
    case MetricFunction.AvgValue:
      return generateCounterQuery(options, metric, ['Sum', 'Count'], 'Count', ([sum, count]) => {
        return `sum(${sum}) / nullIf(sum(${count}), 0)`;
      });
    case MetricFunction.Rate:
    default:
      return generateCounterQuery(options, metric, ['Count'], 'Count', ([d], seconds) =>
        aggregate(perSecond(d, seconds))
      );
  }
};

/* ------------------------------------------------------------------------------------------------
 * Discovery queries, run by the data source to drive the editor.
 * ---------------------------------------------------------------------------------------------- */

export interface MetricCatalogEntry {
  name: string;
  type: MetricType;
  unit: string;
  description: string;
  isMonotonic: boolean;
}

/**
 * Lists the metrics with data in the last 6 hours of the dashboard range, across every metric table. MetricName
 * is the second sorting key of the exporter tables and a LowCardinality column, so this reads
 * little data.
 */
export const getMetricCatalogSql = (database: string, tables: MetricTables): string => {
  const selects = metricTypes
    .filter((type) => tables[type])
    .map((type) => {
      const monotonic = type === MetricType.Sum ? 'max(toUInt8(IsMonotonic))' : 'toUInt8(0)';
      return (
        `SELECT MetricName AS name, ${quoteString(type)} AS type, any(MetricUnit) AS unit, ` +
        `any(MetricDescription) AS description, ${monotonic} AS monotonic ` +
        `FROM ${getTableIdentifier(database, tables[type]!)} WHERE ${discoveryTimeCondition} GROUP BY MetricName`
      );
    });

  if (!selects.length) {
    return '';
  }
  return `SELECT name, type, unit, description, monotonic FROM (${selects.join(' UNION ALL ')}) ORDER BY name ASC, type ASC LIMIT 10000`;
};

/**
 * Lists the attribute keys of a metric, labelled with their source, so the editor offers exactly
 * the labels the metric has. Keys are collected per part with groupUniqArrayArray instead of a
 * DISTINCT over every row.
 */
export const getMetricLabelKeysSql = (
  database: string,
  table: string,
  metricName: string,
  jsonAttributes = false
): string => {
  const keys = (column: string) => (jsonAttributes ? `JSONAllPaths(${column})` : `mapKeys(${column})`);
  const sources = (Object.keys(metricAttributeColumns) as Array<keyof typeof metricAttributeColumns>).map(
    (source) =>
      `arrayMap(k -> (${quoteString(source)}, k), groupUniqArrayArray(1000)(${keys(metricAttributeColumns[source])}))`
  );
  return (
    `SELECT tupleElement(label, 1) AS source, tupleElement(label, 2) AS key FROM (` +
    `SELECT arrayJoin(arrayConcat(${sources.join(', ')})) AS label ` +
    `FROM ${getTableIdentifier(database, table)} WHERE MetricName = ${quoteString(metricName)} AND ${discoveryTimeCondition}` +
    `) ORDER BY source ASC, key ASC`
  );
};

/** Lists the values of a label for a metric. */
export const getMetricLabelValuesSql = (
  database: string,
  table: string,
  metricName: string,
  label: MetricLabel,
  jsonAttributes = false
): string => {
  const expression = getMetricLabelExpression(label, jsonAttributes);
  return (
    `SELECT DISTINCT toString(${expression}) AS value FROM ${getTableIdentifier(database, table)} ` +
    `WHERE MetricName = ${quoteString(metricName)} AND ${discoveryTimeCondition} AND value != '' ` +
    `ORDER BY value ASC LIMIT 1000`
  );
};

/** Lists the quantiles a summary metric reports. */
export const getSummaryQuantilesSql = (database: string, table: string, metricName: string): string =>
  `SELECT DISTINCT arrayJoin(ValueAtQuantiles.Quantile) AS quantile FROM ${getTableIdentifier(database, table)} ` +
  `WHERE MetricName = ${quoteString(metricName)} AND ${discoveryTimeCondition} ORDER BY quantile ASC LIMIT 100`;

export interface MetricHealth {
  /** Typical seconds between two points of a series, undefined without recent data. */
  exportInterval?: number;
  /** Series that several writers appear to share. */
  sharedSeries: number;
  series: number;
}

/**
 * One cheap look at a metric's last 15 minutes, read once when it is picked:
 *
 * - The export interval: the median gap between consecutive points of each series, taking the
 *   90th percentile across series so a few sporadic series do not coarsen the whole metric.
 * - Series shared by several writers. OTel requires every producer to have a unique identity
 *   (`service.instance.id`); replicas without one land in one series, where their points arrive in
 *   the same second or, for cumulative points, keep switching start time. A single writer only
 *   does that at a restart, so a series is counted as shared when at least 3 and at least a
 *   quarter of its points do. Gauges and delta points have no stable start time and are only
 *   checked for repeated seconds. Timestamps are compared in whole seconds, which also covers the
 *   DateTime64 columns of older exporter versions.
 */
export const getMetricHealthSql = (
  database: string,
  table: string,
  metricName: string,
  type: MetricType,
  features: MetricTableFeatures = {}
): string => {
  const window = `OVER (PARTITION BY series ORDER BY ${metricTimeColumn} ASC ROWS BETWEEN 1 PRECEDING AND CURRENT ROW)`;
  const cumulative = type === MetricType.Gauge ? '0' : hasTemporality(type) ? 'AggregationTemporality = 2' : '1';
  return (
    `SELECT quantile(0.9)(series_gap) AS export_interval, countIf(odd >= 3 AND odd * 4 >= points) AS shared_series, ` +
    `count() AS series FROM (` +
    `SELECT series, medianIf(gap, gap > 0) AS series_gap, count() AS points, countIf(gap = 0 OR start_changed) AS odd FROM (` +
    `SELECT ${getSeriesKeyExpression(features)} AS series, ` +
    `dateDiff('second', lagInFrame(toNullable(${metricTimeColumn})) ${window}, ${metricTimeColumn}) AS gap, ` +
    `${cumulative} AND gap IS NOT NULL AND StartTimeUnix != lagInFrame(StartTimeUnix) ${window} AS start_changed ` +
    `FROM ${getTableIdentifier(database, table)} WHERE MetricName = ${quoteString(metricName)} ` +
    `AND ${metricTimeColumn} >= now() - INTERVAL 15 MINUTE` +
    `) GROUP BY series)`
  );
};

/* ------------------------------------------------------------------------------------------------
 * Dashboard variable queries, like Prometheus' label_values().
 * ---------------------------------------------------------------------------------------------- */

/** All metric names in the last 6 hours of the range, across the given metric tables. */
export const getMetricNamesVariableSql = (database: string, tables: readonly string[]): string => {
  if (!tables.length) {
    return '';
  }
  const selects = tables.map(
    (table) =>
      `SELECT MetricName AS name FROM ${getTableIdentifier(database, table)} WHERE ${discoveryTimeCondition} GROUP BY name`
  );
  return `SELECT DISTINCT name FROM (${selects.join(' UNION ALL ')}) ORDER BY name ASC`;
};

/**
 * The values of a label in the last 6 hours of the range, optionally for one metric and narrowed
 * by label filters. Filters may refer to other variables, which chains variables (pods of the
 * selected $service).
 */
export const getMetricLabelValuesVariableSql = (
  database: string,
  tables: readonly string[],
  label: MetricLabel,
  options: { metricName?: string; filters?: Filter[]; jsonAttributes?: boolean } = {}
): string => {
  if (!tables.length || !label.key) {
    return '';
  }
  const conditions = [discoveryTimeCondition];
  if (options.metricName) {
    conditions.unshift(`MetricName = ${quoteString(options.metricName)}`);
  }
  const filters = getMetricFilterSql(options.filters, options.jsonAttributes);
  if (filters) {
    conditions.push(filters);
  }
  const expression = `toString(${getMetricLabelExpression(label, options.jsonAttributes)})`;
  const selects = tables.map(
    (table) =>
      `SELECT DISTINCT ${expression} AS value FROM ${getTableIdentifier(database, table)} WHERE ${conditions.join(' AND ')}`
  );
  return `SELECT DISTINCT value FROM (${selects.join(' UNION ALL ')}) WHERE value != '' ORDER BY value ASC LIMIT 10000`;
};
