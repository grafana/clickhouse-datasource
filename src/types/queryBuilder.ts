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

    // Logs & Traces
    otelEnabled?: boolean;
    otelVersion?: string;
  }
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
}

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
  filterable?: boolean;
  sortable?: boolean;
  groupable?: boolean;
  aggregatable?: boolean;
}

/**
 * Some columns are used to enable certain features.
 * This enum defines the different use cases that a column may be used for in the query generator.
 * For example, "Time" would be used to identify the primary time column for a time series.
 */
export enum ColumnHint {
  Time = 'time',

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
    | FilterOperator.NotLike;
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
