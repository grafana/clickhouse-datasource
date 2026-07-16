import { ColumnHint, FilterOperator, OrderByDirection } from 'types/queryBuilder';
import {
  getDefaultLogsFilters,
  getDefaultLogsOrderBy,
  getDefaultTraceFilters,
  getDefaultTraceOrderBy,
} from './defaultQueryOptions';

describe('defaultQueryOptions', () => {
  it('returns logs filters and order by defaults', () => {
    expect(getDefaultLogsFilters()).toMatchObject([
      { hint: ColumnHint.FilterTime, operator: FilterOperator.WithInGrafanaTimeRange },
      { hint: ColumnHint.LogLevel, operator: FilterOperator.IsAnything },
    ]);
    expect(getDefaultLogsOrderBy()).toEqual([
      { name: '', hint: ColumnHint.FilterTime, dir: OrderByDirection.DESC, default: true },
      { name: '', hint: ColumnHint.Time, dir: OrderByDirection.DESC, default: true },
    ]);
  });

  it('returns trace filters and order by defaults', () => {
    expect(getDefaultTraceFilters()).toMatchObject([
      { hint: ColumnHint.Time, operator: FilterOperator.WithInGrafanaTimeRange },
      { hint: ColumnHint.TraceParentSpanId, operator: FilterOperator.IsEmpty },
      { hint: ColumnHint.TraceDurationTime, operator: FilterOperator.GreaterThan },
      { hint: ColumnHint.TraceServiceName, operator: FilterOperator.IsAnything },
    ]);
    expect(getDefaultTraceOrderBy()).toEqual([
      { name: '', hint: ColumnHint.Time, dir: OrderByDirection.DESC, default: true },
      { name: '', hint: ColumnHint.TraceDurationTime, dir: OrderByDirection.DESC, default: true },
    ]);
  });

  it('returns fresh arrays for each call', () => {
    expect(getDefaultLogsFilters()).not.toBe(getDefaultLogsFilters());
    expect(getDefaultTraceOrderBy()).not.toBe(getDefaultTraceOrderBy());
  });
});
