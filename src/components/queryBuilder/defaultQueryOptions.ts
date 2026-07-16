import {
  ColumnHint,
  DateFilterWithoutValue,
  Filter,
  FilterOperator,
  NumberFilter,
  OrderBy,
  OrderByDirection,
  StringFilter,
} from 'types/queryBuilder';

export const getDefaultLogsFilters = (): Filter[] => [
  {
    type: 'datetime',
    operator: FilterOperator.WithInGrafanaTimeRange,
    filterType: 'custom',
    key: '',
    hint: ColumnHint.FilterTime,
    condition: 'AND',
  } as DateFilterWithoutValue,
  {
    type: 'string',
    operator: FilterOperator.IsAnything,
    filterType: 'custom',
    key: '',
    hint: ColumnHint.LogLevel,
    condition: 'AND',
    value: '',
  } as StringFilter,
];

export const getDefaultLogsOrderBy = (): OrderBy[] => [
  { name: '', hint: ColumnHint.FilterTime, dir: OrderByDirection.DESC, default: true },
  { name: '', hint: ColumnHint.Time, dir: OrderByDirection.DESC, default: true },
];

export const getDefaultTraceFilters = (): Filter[] => [
  {
    type: 'datetime',
    operator: FilterOperator.WithInGrafanaTimeRange,
    filterType: 'custom',
    key: '',
    hint: ColumnHint.Time,
    condition: 'AND',
  } as DateFilterWithoutValue,
  {
    type: 'string',
    operator: FilterOperator.IsEmpty,
    filterType: 'custom',
    key: '',
    hint: ColumnHint.TraceParentSpanId,
    condition: 'AND',
    value: '',
  } as StringFilter,
  {
    type: 'UInt64',
    operator: FilterOperator.GreaterThan,
    filterType: 'custom',
    key: '',
    hint: ColumnHint.TraceDurationTime,
    condition: 'AND',
    value: 0,
  } as NumberFilter,
  {
    type: 'string',
    operator: FilterOperator.IsAnything,
    filterType: 'custom',
    key: '',
    hint: ColumnHint.TraceServiceName,
    condition: 'AND',
    value: '',
  } as StringFilter,
];

export const getDefaultTraceOrderBy = (): OrderBy[] => [
  { name: '', hint: ColumnHint.Time, dir: OrderByDirection.DESC, default: true },
  { name: '', hint: ColumnHint.TraceDurationTime, dir: OrderByDirection.DESC, default: true },
];
