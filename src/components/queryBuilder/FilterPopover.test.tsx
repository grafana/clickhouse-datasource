import { FilterOperator } from 'types/queryBuilder';
import { getFilterValueKind, getOperatorOptions } from './FilterPopover';

describe('FilterPopover', () => {
  it('infers number filter kind from ClickHouse numeric types', () => {
    expect(getFilterValueKind('UInt64')).toBe('number');
    expect(getFilterValueKind('Nullable(Float64)')).toBe('number');
    expect(getFilterValueKind('Decimal(18, 2)')).toBe('number');
    expect(getFilterValueKind('Map(String, UInt32)')).toBe('number');
  });

  it('treats non-numeric types as string filters', () => {
    expect(getFilterValueKind('String')).toBe('string');
    expect(getFilterValueKind('LowCardinality(String)')).toBe('string');
    expect(getFilterValueKind('DateTime64(9)')).toBe('string');
    expect(getFilterValueKind('Map(String, String)')).toBe('string');
  });

  it('returns type-specific operator options', () => {
    expect(getOperatorOptions('number').map((option) => option.value)).toEqual([
      FilterOperator.GreaterThan,
      FilterOperator.LessThan,
      FilterOperator.GreaterThanOrEqual,
      FilterOperator.LessThanOrEqual,
      FilterOperator.Equals,
      FilterOperator.NotEquals,
      FilterOperator.IsNull,
      FilterOperator.IsNotNull,
    ]);
    expect(getOperatorOptions('string').map((option) => option.value)).toEqual([
      FilterOperator.Like,
      FilterOperator.NotLike,
      FilterOperator.Equals,
      FilterOperator.NotEquals,
      FilterOperator.IsNull,
      FilterOperator.IsNotNull,
    ]);
  });
});
