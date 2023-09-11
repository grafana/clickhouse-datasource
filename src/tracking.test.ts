import { analyzeQueries } from 'tracking';
import { CHQuery, EditorType } from 'types/sql';
import { QueryType } from 'types/queryBuilder';
import { BuilderMode } from 'types/queryBuilder';

describe('analyzeQueries', () => {
  [
    // {
    //   description: 'should count 1 sql query (with a default mode of auto)',
    //   queries: [{ editorType: EditorType.SQL, QueryType: QueryType.Table }],
    //   expectedCounters: {
    //     sql_queries: 1,
    //     sql_query_format_auto: 1,
    //     sql_query_format_table: 0,
    //     sql_query_format_logs: 0,
    //     sql_query_format_time_series: 0,
    //     sql_query_format_trace: 0,
    //     builder_queries: 0,
    //     builder_table_queries: 0,
    //     builder_aggregate_queries: 0,
    //     builder_time_series_queries: 0,
    //   },
    // },
    {
      description: 'should count 1 sql query with a mode of Table',
      queries: [{ editorType: EditorType.SQL, queryType: QueryType.Table }],
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
      queries: [{ editorType: EditorType.SQL, queryType: QueryType.Logs }],
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
      queries: [{ editorType: EditorType.SQL, queryType: QueryType.TimeSeries }],
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
      description: 'should count 1 sql query with a mode of Traces',
      queries: [{ editorType: EditorType.SQL, queryType: QueryType.Traces }],
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
      queries: [{ editorType: EditorType.Builder, builderOptions: { mode: BuilderMode.List } }],
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
      queries: [{ editorType: EditorType.Builder, builderOptions: { mode: BuilderMode.Aggregate } }],
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
      queries: [{ editorType: EditorType.Builder, builderOptions: { mode: BuilderMode.Trend } }],
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
