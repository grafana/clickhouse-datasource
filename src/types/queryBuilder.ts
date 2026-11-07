export interface FieldLabel {
  label: string;
  tooltip: string;
}

export enum BuilderMode {
  List = 'list',
  Aggregate = 'aggregate',
  Trend = 'trend',
}

/**
 * QueryType determines the display/query format.
 */
export enum QueryType {
  Table = 'table',
  Logs = 'logs',
  TimeSeries = 'timeseries',
  Traces = 'traces',
}

export interface QueryBuilderOptions {
  database: string;
  table: string;
  queryType: QueryType;

  mode?: BuilderMode; // TODO: no longer required?

  columns?: SelectedColumn[];
  aggregates?: AggregateColumn[];
  filters?: Filter[];
  groupBy?: string[];
  orderBy?: OrderBy[];
  limit?: number;

  /**
   * The OTel metric this query reads, set by the metrics editor of a single-table
   * data source with the metrics signal. When present on a time series query, the
   * SQL generator builds a metrics query instead of a plain time series query.
   */
  metric?: MetricQuery;

  /**
   * Contains metadata for editor-specific use cases.
   */
  meta?: {
    /**
     * When enabled, will hide most/all of the query builder options.
     *
     * Intended to be used for trace ID lookups where we only care to show the visualization panel
     */
    minimized?: boolean;

    // Logs
    liveView?: boolean;
    logMessageLike?: string;

    // Trace
    traceDurationUnit?: TimeUnit;
    /**
     * true for trace ID mode, false for trace search mode
     */
    isTraceIdMode?: boolean;
    traceId?: string;
    /**
     * true when the trace timestamp optimization table is detected
     */
    hasTraceTimestampTable?: boolean;
    /**
     * Suffix used to locate the companion trace-timestamp index table
     * (e.g. `_trace_id_ts`). When omitted, generators fall back to the
     * built-in OTel default.
     */
    traceTimestampTableSuffix?: string;

    /**
     * True if "Nested" column types should be treated as if they
     * were created with flatten_nested=1. Applies to trace Events and Links columns.
     */
    flattenNested?: boolean;
    traceEventsColumnPrefix?: string;
    traceLinksColumnPrefix?: string;
    /**
     * True when the tags/serviceTags columns (and nested events/links attributes) use
     * the ClickHouse JSON type instead of Map(String,String).
     */
    tagsAreJSON?: boolean;

    // Logs & Traces
    otelEnabled?: boolean;
    otelVersion?: string;

    /**
     * UID of the data source the query belongs to, recorded by the editor in Explore. Switching
     * data sources keeps the query, so a different UID here marks a query carried over from
     * another data source rather than one opened from a panel, the history or a shared link.
     */
    datasourceUid?: string;
  };
}

export enum AggregateType {
  Sum = 'sum',
  Average = 'avg',
  Min = 'min',
  Max = 'max',
  Count = 'count',
  Any = 'any',
  // Count_Distinct = 'count_distinct',
}

export type AggregateColumn = {
  aggregateType: AggregateType;
  column: string;
  alias?: string;
};

export interface Field {
  name: string;
  type: string;
  rel: string;
  label: string;
  ref: string[];
}

export interface FullEntity {
  name: string;
  label: string;
  custom: boolean;
  queryable: boolean;
}

interface TableColumnPickListItem {
  label: string;
  value: string;
}

/**
 * Represents a column retrieved from ClickHouse
 */
export interface TableColumn {
  name: string;
  type: string;
  picklistValues: TableColumnPickListItem[];
  label?: string;
  filterable?: boolean;
  sortable?: boolean;
  groupable?: boolean;
  aggregatable?: boolean;
}

export interface SqlFunction {
  name: string;
  isAggregate: boolean;
  caseInsensitive: boolean;
  aliasTo: string;
  origin: string;
  description: string;
  syntax: string;
  arguments: string;
  returnedValue: string;
  examples: string;
  categories: string;
}

/**
 * Some columns are used to enable certain features.
 * This enum defines the different use cases that a column may be used for in the query generator.
 * For example, "Time" would be used to identify the primary time column for a time series.
 */
export enum ColumnHint {
  /**
   * An optional lower precision timestamp used for filtering logs.
   */
  FilterTime = 'filter_time',
  Time = 'time',

  ResourceAttributes = 'resource_attributes',
  ScopeAttributes = 'scope_attributes',
  LogAttributes = 'log_attributes',

  LogLevel = 'log_level',
  LogMessage = 'log_message',

  TraceId = 'trace_id',
  TraceSpanId = 'trace_span_id',
  TraceParentSpanId = 'trace_parent_span_id',
  TraceServiceName = 'trace_service_name',
  TraceOperationName = 'trace_operation_name',
  TraceDurationTime = 'trace_duration_time',
  TraceTags = 'trace_tags',
  TraceServiceTags = 'trace_service_tags',
  TraceStatusCode = 'trace_status_code',
  TraceKind = 'trace_kind',
  TraceStatusMessage = 'trace_status_message',
  TraceInstrumentationLibraryName = 'instrumentation_library_name',
  TraceInstrumentationLibraryVersion = 'instrumentation_library_version',
  TraceState = 'trace_state',
}

/**
 * TimeUnit determines a unit of time.
 */
export enum TimeUnit {
  Seconds = 'seconds',
  Milliseconds = 'milliseconds',
  Microseconds = 'microseconds',
  Nanoseconds = 'nanoseconds',
}

/**
 * Represents a column selection, including metadata for the query generator to use.
 */
export interface SelectedColumn {
  name: string;
  type?: string;
  alias?: string;
  custom?: boolean;
  hint?: ColumnHint;
}

export enum OrderByDirection {
  ASC = 'ASC',
  DESC = 'DESC',
}

export interface OrderBy {
  name: string;
  dir: OrderByDirection;
  /**
   * true if this orderBy was configured to be present by default
   */
  default?: boolean;

  /**
   * If provided, SQL generator will ignore "name" and instead
   * find the intended column by the hint
   */
  hint?: ColumnHint;
}

export enum FilterOperator {
  /**
   * A placeholder filter that gets excluded from SQL generation
   */
  IsAnything = 'IS ANYTHING',

  /**
   * Compares to an empty string
   */
  IsEmpty = 'IS EMPTY',
  IsNotEmpty = 'IS NOT EMPTY',

  IsNull = 'IS NULL',
  IsNotNull = 'IS NOT NULL',
  Equals = '=',
  NotEquals = '!=',
  LessThan = '<',
  LessThanOrEqual = '<=',
  GreaterThan = '>',
  GreaterThanOrEqual = '>=',
  Like = 'LIKE',
  NotLike = 'NOT LIKE',
  ILike = 'ILIKE',
  NotILike = 'NOT ILIKE',
  In = 'IN',
  NotIn = 'NOT IN',
  WithInGrafanaTimeRange = 'WITH IN DASHBOARD TIME RANGE',
  OutsideGrafanaTimeRange = 'OUTSIDE DASHBOARD TIME RANGE',
}

export interface CommonFilterProps {
  filterType: 'custom';
  /**
   * Column name
   */
  key: string;
  /**
   * key used when using a map type: exampleMap['mapKey']
   */
  mapKey?: string;
  type: string;
  condition: 'AND' | 'OR';

  /**
   * Used to uniquely identify a dynamically added filter
   * For example, might be set to 'timeRange' for the default added time range filter.
   */
  id?: string;
  /**
   * If provided, SQL generator will ignore "key" and instead
   * find the intended column by the hint.
   *
   * Note that the column MUST be present in the selected columns array in order
   * for the filter to be applied unless key is also provided.
   */
  hint?: ColumnHint;

  /**
   * Display label for filter
   */
  label?: string;
}

export interface NullFilter extends CommonFilterProps {
  operator: FilterOperator.IsAnything | FilterOperator.IsNull | FilterOperator.IsNotNull;
}

export interface BooleanFilter extends CommonFilterProps {
  type: 'boolean';
  operator: FilterOperator.IsAnything | FilterOperator.Equals | FilterOperator.NotEquals;
  value: boolean;
}

export interface StringFilter extends CommonFilterProps {
  operator:
    | FilterOperator.IsAnything
    | FilterOperator.IsEmpty
    | FilterOperator.IsNotEmpty
    | FilterOperator.Equals
    | FilterOperator.NotEquals
    | FilterOperator.Like
    | FilterOperator.NotLike
    | FilterOperator.ILike
    | FilterOperator.NotILike;
  value: string;
}

export interface NumberFilter extends CommonFilterProps {
  operator:
    | FilterOperator.IsAnything
    | FilterOperator.Equals
    | FilterOperator.NotEquals
    | FilterOperator.LessThan
    | FilterOperator.LessThanOrEqual
    | FilterOperator.GreaterThan
    | FilterOperator.GreaterThanOrEqual;
  value: number;
  /**
   * Original textual input, preserved for UI round-trip when the filter is
   * rendered with a human-friendly duration editor (see DurationFilterInput).
   * SQL generation ignores this field and uses `value` (already in the
   * column's stored unit).
   */
  rawInput?: string;
}

export interface DateFilterWithValue extends CommonFilterProps {
  type: 'datetime' | 'date';
  operator:
    | FilterOperator.IsAnything
    | FilterOperator.Equals
    | FilterOperator.NotEquals
    | FilterOperator.LessThan
    | FilterOperator.LessThanOrEqual
    | FilterOperator.GreaterThan
    | FilterOperator.GreaterThanOrEqual;
  value: string;
}

export interface DateFilterWithoutValue extends CommonFilterProps {
  type: 'datetime' | 'date';
  operator: FilterOperator.IsAnything | FilterOperator.WithInGrafanaTimeRange | FilterOperator.OutsideGrafanaTimeRange;
}

export type DateFilter = DateFilterWithValue | DateFilterWithoutValue;

export interface MultiFilter extends CommonFilterProps {
  operator: FilterOperator.IsAnything | FilterOperator.In | FilterOperator.NotIn;
  value: string[];
}

export type Filter = NullFilter | BooleanFilter | NumberFilter | DateFilter | StringFilter | MultiFilter;

/**
 * The OTel metric data point types, one per table written by the
 * opentelemetry-collector-contrib ClickHouse exporter.
 */
export enum MetricType {
  Gauge = 'gauge',
  Sum = 'sum',
  Histogram = 'histogram',
  ExponentialHistogram = 'exponential_histogram',
  Summary = 'summary',
}

/**
 * What is computed per series and time bucket.
 * - avg / min / max / last: the value of a gauge or non-monotonic sum.
 * - rate: per-second increase of a counter (a monotonic sum, or the Count of a histogram or summary).
 * - increase: increase of a counter per time bucket.
 * - sum_rate: per-second increase of the Sum of a histogram or summary.
 * - avg_value: Sum / Count of a histogram or summary, for example the mean latency.
 * - quantile: quantiles from histogram buckets or summary quantile values.
 */
export enum MetricFunction {
  Avg = 'avg',
  Min = 'min',
  Max = 'max',
  Last = 'last',
  Rate = 'rate',
  Increase = 'increase',
  SumRate = 'sum_rate',
  AvgValue = 'avg_value',
  Quantile = 'quantile',
}

/** How the per-series values are combined into one value per group. */
export enum MetricSeriesAggregation {
  Sum = 'sum',
  Avg = 'avg',
  Min = 'min',
  Max = 'max',
  Count = 'count',
}

/**
 * Where a metric label comes from.
 * - attribute: the data point `Attributes` map.
 * - resource: the `ResourceAttributes` map (service.name, k8s.pod.name, ...).
 * - scope: the `ScopeAttributes` map.
 * - column: a top level column such as ServiceName or ScopeName.
 */
export type MetricLabelSource = 'attribute' | 'resource' | 'scope' | 'column';

export interface MetricLabel {
  source: MetricLabelSource;
  /** The attribute key, or the column name for the `column` source. */
  key: string;
}

export interface MetricQuery {
  /** MetricName. Empty until a metric is picked. */
  name: string;
  type: MetricType;
  unit?: string;
  /** IsMonotonic of a sum metric: monotonic sums are counters. */
  isMonotonic?: boolean;
  fn: MetricFunction;
  /** Quantiles between 0 and 1 for the quantile function. */
  quantiles?: number[];
  aggregation: MetricSeriesAggregation;
  groupBy: MetricLabel[];
  /** True when the attribute columns use the ClickHouse JSON type instead of Map. */
  jsonAttributes?: boolean;
  /**
   * Smallest time bucket in seconds, set to twice the metric's detected export interval. Buckets
   * shorter than the export interval would hold only some of the series' points, so sums across
   * series would jump depending on which instances happened to export in each bucket.
   */
  minStep?: number;
}
