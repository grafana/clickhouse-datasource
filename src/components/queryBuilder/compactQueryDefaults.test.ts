import {
  isCompactQueryTypeMismatch,
  isDefaultCompactQuery,
  shouldBuildCompactQueryDefaults,
} from './compactQueryDefaults';
import { BuilderMode, ColumnHint, OrderByDirection, QueryBuilderOptions, QueryType } from 'types/queryBuilder';
import { SignalType } from 'types/config';

const defaultOptions: QueryBuilderOptions = {
  database: '',
  table: '',
  queryType: QueryType.Table,
  mode: BuilderMode.List,
  columns: [],
  filters: [],
};

const emptyMismatchedOptions: QueryBuilderOptions = {
  database: 'logs_db',
  table: 'logs_table',
  queryType: QueryType.Logs,
  mode: BuilderMode.List,
  columns: [],
  filters: [],
};

const authoredTimeSeriesOptions: QueryBuilderOptions = {
  database: 'metrics_db',
  table: 'requests',
  queryType: QueryType.TimeSeries,
  mode: BuilderMode.Trend,
  columns: [{ name: 'created_at', hint: ColumnHint.Time }, { name: 'requests_count' }],
  filters: [],
  orderBy: [{ name: 'created_at', dir: OrderByDirection.ASC }],
  limit: 100,
};

const authoredLogsOptions: QueryBuilderOptions = {
  database: 'otel_v2',
  table: 'otel_logs',
  queryType: QueryType.Logs,
  mode: BuilderMode.List,
  columns: [
    { name: 'Timestamp', hint: ColumnHint.Time },
    { name: 'Body', hint: ColumnHint.LogMessage },
  ],
  filters: [],
};

describe('isDefaultCompactQuery', () => {
  it('is true for a fresh default query', () => {
    expect(isDefaultCompactQuery(defaultOptions)).toBe(true);
  });

  it('is false for a query with user content', () => {
    expect(isDefaultCompactQuery(authoredTimeSeriesOptions)).toBe(false);
  });
});

describe('isCompactQueryTypeMismatch', () => {
  it('is true when the query type does not match the signal type', () => {
    expect(isCompactQueryTypeMismatch(authoredTimeSeriesOptions, 'logs')).toBe(true);
    expect(isCompactQueryTypeMismatch(authoredLogsOptions, 'traces')).toBe(true);
  });

  it('is false when the query type matches the signal type', () => {
    expect(isCompactQueryTypeMismatch(authoredLogsOptions, 'logs')).toBe(false);
  });
});

describe('shouldBuildCompactQueryDefaults', () => {
  const cases: Array<{
    name: string;
    builderOptions: QueryBuilderOptions;
    signalType: SignalType;
    expected: boolean;
  }> = [
    {
      name: 'builds defaults for a fresh default query',
      builderOptions: defaultOptions,
      signalType: 'logs',
      expected: true,
    },
    {
      name: 'builds defaults for a mismatched query without user content',
      builderOptions: emptyMismatchedOptions,
      signalType: 'traces',
      expected: true,
    },
    {
      name: 'preserves an authored query whose type does not match the signal type',
      builderOptions: authoredTimeSeriesOptions,
      signalType: 'logs',
      expected: false,
    },
    {
      name: 'preserves an authored query whose type matches the signal type',
      builderOptions: authoredLogsOptions,
      signalType: 'logs',
      expected: false,
    },
  ];

  it.each(cases)('$name', ({ builderOptions, signalType, expected }) => {
    expect(shouldBuildCompactQueryDefaults(builderOptions, signalType)).toBe(expected);
  });
});
