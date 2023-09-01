export enum BuilderMode {
  List = 'list',
  Aggregate = 'aggregate',
  Trend = 'trend',
}

/**
 * @property {string} timeField Explore only: used for Logs Volume histogram
 * @property {string} logLevelField Explore only: used for Logs Volume histogram
 */
export interface SqlBuilderOptionsList {
  mode: BuilderMode.List;
  database?: string;
  table?: string;
  fields?: string[];
  filters?: Filter[];
  orderBy?: OrderBy[];
  limit?: number;
  timeField?: string;
  logLevelField?: string;
}

export enum BuilderMetricFieldAggregation {
  Sum = 'sum',
  Average = 'avg',
  Min = 'min',
  Max = 'max',
  Count = 'count',
  Any = 'any',
  // Count_Distinct = 'count_distinct',
}

export type BuilderMetricField = {
  field: string;
  aggregation: BuilderMetricFieldAggregation;
  alias?: string;
}

export interface SqlBuilderOptionsAggregate {
  mode: BuilderMode.Aggregate;
  fields: string[];
  metrics: BuilderMetricField[];
  groupBy?: string[];
  filters?: Filter[];
  orderBy?: OrderBy[];
  limit?: number;
}

export interface SqlBuilderOptionsTrend {
  mode: BuilderMode.Trend;
  fields: string[];
  metrics: BuilderMetricField[];
  filters?: Filter[];
  groupBy?: string[];
  timeField: string;
  timeFieldType: string;
  orderBy?: OrderBy[];
  limit?: number;
}

export type SqlBuilderOptions = SqlBuilderOptionsList | SqlBuilderOptionsAggregate | SqlBuilderOptionsTrend;

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

interface FullFieldPickListItem {
  value: string;
  label: string;
}

export interface FullField {
  name: string;
  label: string;
  type: string;
  picklistValues: FullFieldPickListItem[];
  filterable?: boolean;
  sortable?: boolean;
  groupable?: boolean;
  aggregatable?: boolean;
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
