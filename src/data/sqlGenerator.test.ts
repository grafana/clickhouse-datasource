import { AggregateType, ColumnHint, QueryBuilderOptions, QueryType } from 'types/queryBuilder';
import { generateSql, getColumnByHint, getColumnIndexByHint, getColumnsByHints, isAggregateQuery } from './sqlGenerator';

describe('SQL Generator', () => {
  it('generates logs sql', () => {
    const opts: QueryBuilderOptions = {
      database: 'default',
      table: 'logs',
      queryType: QueryType.Logs,
      columns: [
          { name: 'timestamp', type: 'DateTime', hint: ColumnHint.Time },
          { name: 'level', type: 'String', hint: ColumnHint.LogLevel },
          { name: 'message', type: 'String', hint: ColumnHint.LogMessage },
      ],
      limit: 1000,
      filters: [],
      orderBy: []
    };

    const sql = generateSql(opts);
    expect(sql).not.toBeUndefined();
    expect(sql).not.toHaveLength(0);
    expect(sql.length).toBeGreaterThan(0);
  });

  it('generates trace sql', () => {
    const opts: QueryBuilderOptions = {
      database: 'otel',
      table: 'otel_traces',
      queryType: QueryType.Traces,
      columns: [
          { name: 'TraceId', type: 'String', hint: ColumnHint.TraceId },
          { name: 'SpanId', type: 'String', hint: ColumnHint.TraceSpanId },
          { name: 'ParentSpanId', type: 'String', hint: ColumnHint.TraceParentSpanId },
          { name: 'ServiceName', type: 'LowCardinality(String)', hint: ColumnHint.TraceServiceName },
          { name: 'SpanName', type: 'LowCardinality(String)', hint: ColumnHint.TraceOperationName },
          { name: 'Timestamp', type: 'DateTime64(9)', hint: ColumnHint.Time },
          { name: 'Duration', type: 'Int64', hint: ColumnHint.TraceDurationTime },
          { name: 'SpanAttributes', type: 'Map(LowCardinality(String), String)', hint: ColumnHint.TraceTags },
          { name: 'ResourceAttributes', type: 'Map(LowCardinality(String), String)', hint: ColumnHint.TraceServiceTags },
      ],
      limit: 1000,
      filters: [],
      orderBy: []
    };

    const sql = generateSql(opts);
    expect(sql).not.toBeUndefined();
    expect(sql).not.toHaveLength(0);
    expect(sql.length).toBeGreaterThan(0);
  });

  it('generates other sql', () => {
    const opts: QueryBuilderOptions = {
      database: 'default',
      table: 'data',
      queryType: QueryType.Table,
      columns: [
          { name: 'timestamp', type: 'DateTime' },
          { name: 'text', type: 'String' },
      ],
      limit: 1000,
      filters: [],
      orderBy: []
    };

    const sql = generateSql(opts);
    expect(sql).not.toBeUndefined();
    expect(sql).not.toHaveLength(0);
    expect(sql.length).toBeGreaterThan(0);
  });
});

describe('isAggregateQuery', () => {
  it('returns true for aggregate query', () => {
    const builderOptions = { aggregates: [{ column: 'foo', aggregateType: AggregateType.Count }] } as QueryBuilderOptions;
    expect(isAggregateQuery(builderOptions)).toEqual(true);
  });
  it('returns false for query without aggregates', () => {
    const builderOptions = {} as QueryBuilderOptions;
    expect(isAggregateQuery(builderOptions)).toEqual(false);
  });
});

describe('getColumnByHint', () => {
  it('returns a selected column when present', () => {
    const testColumn = { name: 'time', type: 'datetime', hint: ColumnHint.Time };
    const builderOptions = { columns: [testColumn] } as QueryBuilderOptions;
    expect(getColumnByHint(builderOptions, ColumnHint.Time)).toMatchObject(testColumn);
  });
  it('returns a undefined when column not present', () => {
    const testColumn = { name: 'time', type: 'datetime' };
    const builderOptions = { columns: [testColumn] } as QueryBuilderOptions;
    expect(getColumnByHint(builderOptions, ColumnHint.Time)).toBeUndefined();
  });
});

describe('getColumnIndexByHint', () => {
  it('returns a selected column index when present', () => {
    const testColumns = [{}, { name: 'time', type: 'datetime', hint: ColumnHint.Time }];
    const builderOptions = { columns: testColumns } as QueryBuilderOptions;
    expect(getColumnIndexByHint(builderOptions, ColumnHint.Time)).toEqual(1);
  });
  it('returns -1 when column not present', () => {
    const testColumn = { name: 'time', type: 'datetime' };
    const builderOptions = { columns: [testColumn] } as QueryBuilderOptions;
    expect(getColumnIndexByHint(builderOptions, ColumnHint.Time)).toEqual(-1);
  });
});

describe('getColumnsByHints', () => {
  it('returns selected columns when present', () => {
    const testColumns = [
      { name: 'time', type: 'DateTime', hint: ColumnHint.Time },
      { name: 'level', type: 'String', hint: ColumnHint.LogLevel },
    ];
    const builderOptions = { columns: testColumns } as QueryBuilderOptions;
    expect(getColumnsByHints(builderOptions, [ColumnHint.Time, ColumnHint.LogLevel])).toHaveLength(2);
  });
  it('returns empty array when columns not present', () => {
    const testColumn = { name: 'time', type: 'datetime' };
    const builderOptions = { columns: [testColumn] } as QueryBuilderOptions;
    expect(getColumnsByHints(builderOptions, [ColumnHint.Time])).toHaveLength(0);
  });
});
