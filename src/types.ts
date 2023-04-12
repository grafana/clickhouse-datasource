import { DataQuery, DataSourceJsonData } from '@grafana/data';

export const defaultQuery: Partial<CHQuery> = {};

export interface CHConfig extends DataSourceJsonData {
  username: string;
  server: string;
  protocol: Protocol;
  port: number;
  defaultDatabase?: string;
  tlsSkipVerify?: boolean;
  tlsAuth?: boolean;
  tlsAuthWithCACert?: boolean;
  secure?: boolean;
  validate?: boolean;
  timeout?: string;
  queryTimeout?: string;
}

export interface CHSecureConfig {
  password: string;
  tlsCACert?: string;
  tlsClientCert?: string;
  tlsClientKey?: string;
}

export enum Protocol {
  NATIVE = 'native',
  HTTP = 'http',
}

export enum Format {
  TIMESERIES = 0,
  TABLE = 1,
  LOGS = 2,
  TRACE = 3,
  AUTO = 4,
}

//#region Query
export enum QueryType {
  SQL = 'sql',
  Builder = 'builder',
}

export interface CHSQLQuery extends DataQuery {
  queryType: QueryType.SQL;
  rawSql: string;
  meta?: {
    timezone?: string;
    // meta fields to be used just for building builder options when migrating  back to QueryType.Builder
    builderOptions?: SqlBuilderOptions;
  };
  format: Format;
  selectedFormat: Format;
  expand?: boolean;
}

export interface CHBuilderQuery extends DataQuery {
  queryType: QueryType.Builder;
  rawSql: string;
  builderOptions: SqlBuilderOptions;
  format: Format;
  selectedFormat: Format;
  meta?: {
    timezone?: string;
  };
}

export type CHQuery = CHSQLQuery | CHBuilderQuery;

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
};
export interface SqlBuilderOptionsAggregate {
  mode: BuilderMode.Aggregate;
  database: string;
  table: string;
  fields: string[];
  metrics: BuilderMetricField[];
  groupBy?: string[];
  filters?: Filter[];
  orderBy?: OrderBy[];
  limit?: number;
}
export interface SqlBuilderOptionsTrend {
  mode: BuilderMode.Trend;
  database: string;
  table: string;
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

//#endregion

//#region Default Queries
export const defaultQueryType: QueryType = QueryType.Builder;
export const defaultCHBuilderQuery: Omit<CHBuilderQuery, 'refId'> = {
  queryType: QueryType.Builder,
  rawSql: '',
  builderOptions: {
    mode: BuilderMode.List,
    fields: [],
    limit: 100,
  },
  format: Format.TABLE,
  selectedFormat: Format.AUTO,
};
export const defaultCHSQLQuery: Omit<CHSQLQuery, 'refId'> = {
  queryType: QueryType.SQL,
  rawSql: '',
  format: Format.TABLE,
  selectedFormat: Format.AUTO,
  expand: false,
};
//#endregion
