import { ColumnHint, TableColumn } from 'types/queryBuilder';
import {
  findColumnByNameHeuristic,
  isDateTimeColumn,
  isNumericColumn,
  isStringLikeColumn,
} from './columnNameHeuristics';

const col = (name: string, type: string): TableColumn => ({ name, type, picklistValues: [] });

describe('findColumnByNameHeuristic', () => {
  it('returns undefined when no heuristic is registered for the hint', () => {
    // ColumnHint.TraceTags intentionally has no heuristic; vendor-specific names.
    expect(findColumnByNameHeuristic([col('SpanAttributes', 'Map(String, String)')], ColumnHint.TraceTags)).toBeUndefined();
  });

  it('returns undefined when no column name matches', () => {
    expect(findColumnByNameHeuristic([col('unrelated', 'String')], ColumnHint.LogMessage)).toBeUndefined();
  });

  it('matches case-insensitively (Timestamp vs timestamp)', () => {
    expect(findColumnByNameHeuristic([col('Timestamp', 'DateTime')], ColumnHint.Time)?.name).toBe('Timestamp');
    expect(findColumnByNameHeuristic([col('timestamp', 'DateTime64(9)')], ColumnHint.Time)?.name).toBe('timestamp');
  });

  it('respects a typeFilter so a String named "timestamp" is skipped for the Time role', () => {
    const cols = [col('timestamp', 'String'), col('created_at', 'DateTime')];
    expect(findColumnByNameHeuristic(cols, ColumnHint.Time, isDateTimeColumn)?.name).toBe('created_at');
  });

  it('returns the first match in column order when several would match', () => {
    const cols = [col('Body', 'String'), col('message', 'String')];
    expect(findColumnByNameHeuristic(cols, ColumnHint.LogMessage, isStringLikeColumn)?.name).toBe('Body');
  });

  it('matches conventional log-level names', () => {
    for (const name of ['level', 'severity', 'severity_text', 'SeverityText', 'log_level']) {
      expect(findColumnByNameHeuristic([col(name, 'String')], ColumnHint.LogLevel)?.name).toBe(name);
    }
  });

  it('matches conventional trace column names (mirrors OTel map)', () => {
    const cases: Array<[ColumnHint, string]> = [
      [ColumnHint.TraceId, 'TraceId'],
      [ColumnHint.TraceSpanId, 'SpanId'],
      [ColumnHint.TraceParentSpanId, 'ParentSpanId'],
      [ColumnHint.TraceServiceName, 'ServiceName'],
      [ColumnHint.TraceOperationName, 'SpanName'],
      [ColumnHint.TraceDurationTime, 'Duration'],
    ];
    for (const [hint, name] of cases) {
      expect(findColumnByNameHeuristic([col(name, 'String')], hint)?.name).toBe(name);
    }
  });

  it('does not match partial words (e.g. "service_id" should not match serviceName heuristic)', () => {
    expect(findColumnByNameHeuristic([col('service_id', 'String')], ColumnHint.TraceServiceName)).toBeUndefined();
  });
});

describe('type predicates', () => {
  it('isDateTimeColumn recognises Date and DateTime variants', () => {
    expect(isDateTimeColumn(col('c', 'DateTime'))).toBe(true);
    expect(isDateTimeColumn(col('c', 'DateTime64(9)'))).toBe(true);
    expect(isDateTimeColumn(col('c', 'Date'))).toBe(true);
    expect(isDateTimeColumn(col('c', 'String'))).toBe(false);
  });

  it('isStringLikeColumn recognises String, FixedString, LowCardinality(String), Enum', () => {
    expect(isStringLikeColumn(col('c', 'String'))).toBe(true);
    expect(isStringLikeColumn(col('c', 'FixedString(8)'))).toBe(true);
    expect(isStringLikeColumn(col('c', 'LowCardinality(String)'))).toBe(true);
    expect(isStringLikeColumn(col('c', 'Enum8(\'ok\' = 1)'))).toBe(true);
    expect(isStringLikeColumn(col('c', 'UInt64'))).toBe(false);
  });

  it('isNumericColumn recognises integer/float/decimal types', () => {
    expect(isNumericColumn(col('c', 'UInt64'))).toBe(true);
    expect(isNumericColumn(col('c', 'Int32'))).toBe(true);
    expect(isNumericColumn(col('c', 'Float64'))).toBe(true);
    expect(isNumericColumn(col('c', 'Decimal(10, 2)'))).toBe(true);
    expect(isNumericColumn(col('c', 'String'))).toBe(false);
  });
});
