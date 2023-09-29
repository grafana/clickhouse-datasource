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
    // Logs
    otelEnabled?: boolean;
    otelVersion?: string;
    liveView?: boolean;

    // Trace
    isTraceSearchMode?: boolean;
    traceDurationUnit?: TimeUnit;
    traceId?: string; // TODO: this doesn't need to be persisted?
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
  TraceStartTime = 'trace_start_time',
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
}

export enum FilterOperator {
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
  key: string;
  type: string;
  condition: 'AND' | 'OR';
}

export interface NullFilter extends CommonFilterProps {
  operator: FilterOperator.IsNull | FilterOperator.IsNotNull;
}

export interface BooleanFilter extends CommonFilterProps {
  type: 'boolean';
  operator: FilterOperator.Equals | FilterOperator.NotEquals;
  value: boolean;
}

export interface StringFilter extends CommonFilterProps {
  operator: FilterOperator.Equals | FilterOperator.NotEquals | FilterOperator.Like | FilterOperator.NotLike;
  value: string;
}

export interface NumberFilter extends CommonFilterProps {
  operator:
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
  operator: FilterOperator.WithInGrafanaTimeRange | FilterOperator.OutsideGrafanaTimeRange;
}

export type DateFilter = DateFilterWithValue | DateFilterWithoutValue;

export interface MultiFilter extends CommonFilterProps {
  operator: FilterOperator.In | FilterOperator.NotIn;
  value: string[];
}

export type Filter = NullFilter | BooleanFilter | NumberFilter | DateFilter | StringFilter | MultiFilter;
