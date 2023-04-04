import { analyzeQueries } from 'tracking';
import { BuilderMode, QueryType, CHQuery } from 'types';

describe('analyzeQueries', () => {
  [
    {
      description: 'should count 1 sql query',
      queries: [{ queryType: QueryType.SQL }],
      expectedCounters: { builder_queries: 0, sql_queries: 1, builder_table_queries: 0, builder_aggregate_queries: 0, builder_time_series_queries: 0 },
    },
    {
      description: 'should count 1 builder query (with a default mode of Table)',
      queries: [{ queryType: QueryType.Builder, builderOptions: { mode: BuilderMode.List } }],
      expectedCounters: { builder_queries: 1, sql_queries: 0, builder_table_queries: 1, builder_aggregate_queries: 0, builder_time_series_queries: 0 },
    },
    {
      description: 'should count 1 builder query with a mode of Aggregate',
      queries: [{ queryType: QueryType.Builder, builderOptions: { mode: BuilderMode.Aggregate } }],
      expectedCounters: { builder_queries: 1, sql_queries: 0, builder_table_queries: 0, builder_aggregate_queries: 1, builder_time_series_queries: 0 },
    },
    {
      description: 'should count 1 builder query with a mode of Time Series',
      queries: [{ queryType: QueryType.Builder, builderOptions: { mode: BuilderMode.Trend } }],
      expectedCounters: { builder_queries: 1, sql_queries: 0, builder_table_queries: 0, builder_aggregate_queries: 0, builder_time_series_queries: 1 },
    },
  ].forEach((t) => {
    it(t.description, () => {
      expect(
        analyzeQueries(
          t.queries as CHQuery[]
        )
      ).toMatchObject(t.expectedCounters);
    });
  });
});
