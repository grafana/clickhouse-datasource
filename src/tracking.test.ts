import { analyzeQueries } from 'tracking';
import { BuilderMode, QueryType, CHQuery, Format } from 'types';

describe('analyzeQueries', () => {
  [
    {
      description: 'should count 1 sql query (with a default mode of auto)',
      queries: [{ queryType: QueryType.SQL, selectedFormat: Format.AUTO }],
      expectedCounters: {
        sql_queries: 1,
        sql_query_format_auto: 1,
        sql_query_format_table: 0,
        sql_query_format_logs: 0,
        sql_query_format_time_series: 0,
        sql_query_format_trace: 0,
        builder_queries: 0,
        builder_table_queries: 0,
        builder_aggregate_queries: 0,
        builder_time_series_queries: 0,
      },
    },
    {
      description: 'should count 1 sql query with a mode of Table',
      queries: [{ queryType: QueryType.SQL, selectedFormat: Format.TABLE }],
      expectedCounters: {
        sql_queries: 1,
        sql_query_format_auto: 0,
        sql_query_format_table: 1,
        sql_query_format_logs: 0,
        sql_query_format_time_series: 0,
        sql_query_format_trace: 0,
        builder_queries: 0,
        builder_table_queries: 0,
        builder_aggregate_queries: 0,
        builder_time_series_queries: 0,
      },
    },
    {
      description: 'should count 1 sql query with a mode of Logs',
      queries: [{ queryType: QueryType.SQL, selectedFormat: Format.LOGS }],
      expectedCounters: {
        sql_queries: 1,
        sql_query_format_auto: 0,
        sql_query_format_table: 0,
        sql_query_format_logs: 1,
        sql_query_format_time_series: 0,
        sql_query_format_trace: 0,
        builder_queries: 0,
        builder_table_queries: 0,
        builder_aggregate_queries: 0,
        builder_time_series_queries: 0,
      },
    },
    {
      description: 'should count 1 sql query with a mode of Time Series',
      queries: [{ queryType: QueryType.SQL, selectedFormat: Format.TIMESERIES }],
      expectedCounters: {
        sql_queries: 1,
        sql_query_format_auto: 0,
        sql_query_format_table: 0,
        sql_query_format_logs: 0,
        sql_query_format_time_series: 1,
        sql_query_format_trace: 0,
        builder_queries: 0,
        builder_table_queries: 0,
        builder_aggregate_queries: 0,
        builder_time_series_queries: 0,
      },
    },
    {
      description: 'should count 1 sql query with a mode of Trace',
      queries: [{ queryType: QueryType.SQL, selectedFormat: Format.TRACE }],
      expectedCounters: {
        sql_queries: 1,
        sql_query_format_auto: 0,
        sql_query_format_table: 0,
        sql_query_format_logs: 0,
        sql_query_format_time_series: 0,
        sql_query_format_trace: 1,
        builder_queries: 0,
        builder_table_queries: 0,
        builder_aggregate_queries: 0,
        builder_time_series_queries: 0,
      },
    },
    {
      description: 'should count 1 builder query (with a default mode of Table)',
      queries: [{ queryType: QueryType.Builder, builderOptions: { mode: BuilderMode.List } }],
      expectedCounters: {
        sql_queries: 0,
        sql_query_format_auto: 0,
        sql_query_format_table: 0,
        sql_query_format_logs: 0,
        sql_query_format_time_series: 0,
        sql_query_format_trace: 0,
        builder_queries: 1,
        builder_table_queries: 1,
        builder_aggregate_queries: 0,
        builder_time_series_queries: 0,
      },
    },
    {
      description: 'should count 1 builder query with a mode of Aggregate',
      queries: [{ queryType: QueryType.Builder, builderOptions: { mode: BuilderMode.Aggregate } }],
      expectedCounters: {
        sql_queries: 0,
        sql_query_format_auto: 0,
        sql_query_format_table: 0,
        sql_query_format_logs: 0,
        sql_query_format_time_series: 0,
        sql_query_format_trace: 0,
        builder_queries: 1,
        builder_table_queries: 0,
        builder_aggregate_queries: 1,
        builder_time_series_queries: 0,
      },
    },
    {
      description: 'should count 1 builder query with a mode of Time Series',
      queries: [{ queryType: QueryType.Builder, builderOptions: { mode: BuilderMode.Trend } }],
      expectedCounters: {
        sql_queries: 0,
        sql_query_format_auto: 0,
        sql_query_format_table: 0,
        sql_query_format_logs: 0,
        sql_query_format_time_series: 0,
        sql_query_format_trace: 0,
        builder_queries: 1,
        builder_table_queries: 0,
        builder_aggregate_queries: 0,
        builder_time_series_queries: 1,
      },
    },
  ].forEach((t) => {
    it(t.description, () => {
      expect(analyzeQueries(t.queries as CHQuery[])).toMatchObject(t.expectedCounters);
    });
  });
});
