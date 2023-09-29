import { ColumnHint, QueryBuilderOptions, QueryType } from 'types/queryBuilder';
import { generateSql } from './sqlGenerator';

describe('SQL Generator', () => {
  it('generates sql', () => {
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
          { name: 'Timestamp', type: 'DateTime64(9)', hint: ColumnHint.TraceStartTime },
          { name: 'Duration', type: 'Int64', hint: ColumnHint.TraceDurationTime },
          { name: 'SpanAttributes', type: 'Map(LowCardinality(String), String)', hint: ColumnHint.TraceTags },
          { name: 'ResourceAttributes', type: 'Map(LowCardinality(String), String)', hint: ColumnHint.TraceServiceTags },
      ],
      limit: 1000,
      filters: [],
      orderBy: []
    };

    const sql = generateSql(opts);
    console.log(sql);
  });
})
