import { SelectableValue } from '@grafana/data';
import { FilterOperator } from 'types/queryBuilder';
import * as utils from 'components/queryBuilder/utils';

export const filterOperatorOptions: Array<SelectableValue<FilterOperator>> = [
  { value: FilterOperator.WithInGrafanaTimeRange, label: 'Within dashboard time range' },
  { value: FilterOperator.OutsideGrafanaTimeRange, label: 'Outside dashboard time range' },
  { value: FilterOperator.IsAnything, label: 'IS ANYTHING' },
  { value: FilterOperator.Equals, label: '=' },
  { value: FilterOperator.NotEquals, label: '!=' },
  { value: FilterOperator.LessThan, label: '<' },
  { value: FilterOperator.LessThanOrEqual, label: '<=' },
  { value: FilterOperator.GreaterThan, label: '>' },
  { value: FilterOperator.GreaterThanOrEqual, label: '>=' },
  { value: FilterOperator.Like, label: 'LIKE' },
  { value: FilterOperator.NotLike, label: 'NOT LIKE' },
  { value: FilterOperator.ILike, label: 'ILIKE' },
  { value: FilterOperator.NotILike, label: 'NOT ILIKE' },
  { value: FilterOperator.IsEmpty, label: 'IS EMPTY' },
  { value: FilterOperator.IsNotEmpty, label: 'IS NOT EMPTY' },
  { value: FilterOperator.In, label: 'IN' },
  { value: FilterOperator.NotIn, label: 'NOT IN' },
  { value: FilterOperator.IsNull, label: 'IS NULL' },
  { value: FilterOperator.IsNotNull, label: 'IS NOT NULL' },
];

const booleanOperators = [FilterOperator.Equals, FilterOperator.NotEquals];
const comparableOperators = [
  FilterOperator.IsAnything,
  FilterOperator.IsNull,
  FilterOperator.IsNotNull,
  FilterOperator.Equals,
  FilterOperator.NotEquals,
  FilterOperator.LessThan,
  FilterOperator.LessThanOrEqual,
  FilterOperator.GreaterThan,
  FilterOperator.GreaterThanOrEqual,
];
const dateOperators = [
  ...comparableOperators,
  FilterOperator.WithInGrafanaTimeRange,
  FilterOperator.OutsideGrafanaTimeRange,
];
const jsonStringOperators = [
  FilterOperator.IsAnything,
  FilterOperator.Equals,
  FilterOperator.NotEquals,
  FilterOperator.Like,
  FilterOperator.NotLike,
  FilterOperator.ILike,
  FilterOperator.NotILike,
  FilterOperator.In,
  FilterOperator.NotIn,
  FilterOperator.IsNull,
  FilterOperator.IsNotNull,
];
const stringOperators = [
  ...jsonStringOperators,
  FilterOperator.IsEmpty,
  FilterOperator.IsNotEmpty,
  FilterOperator.LessThan,
  FilterOperator.LessThanOrEqual,
  FilterOperator.GreaterThan,
  FilterOperator.GreaterThanOrEqual,
];

const filterBySourceOrder = (operators: FilterOperator[]): Array<SelectableValue<FilterOperator>> => {
  return filterOperatorOptions.filter((option) => operators.includes(option.value!));
};

const filterByRequestedOrder = (operators: FilterOperator[]): Array<SelectableValue<FilterOperator>> => {
  return operators
    .map((operator) => filterOperatorOptions.find((option) => option.value === operator))
    .filter((option): option is SelectableValue<FilterOperator> => Boolean(option));
};

export const getFilterOperatorsByType = (
  type = 'string',
  isJSONType = false
): Array<SelectableValue<FilterOperator>> => {
  if (utils.isBooleanType(type)) {
    return filterBySourceOrder(booleanOperators);
  }
  if (utils.isNumberType(type)) {
    return filterBySourceOrder(comparableOperators);
  }
  if (utils.isDateType(type)) {
    return filterBySourceOrder(dateOperators);
  }
  if (isJSONType) {
    return filterBySourceOrder(jsonStringOperators);
  }
  return filterBySourceOrder(stringOperators);
};

export const getFilterOperatorOptions = (
  operators: FilterOperator[],
  labels?: Partial<Record<FilterOperator, string>>
): Array<SelectableValue<FilterOperator>> => {
  return filterByRequestedOrder(operators).map((option) => ({
    ...option,
    label: labels?.[option.value!] || option.label,
  }));
};
