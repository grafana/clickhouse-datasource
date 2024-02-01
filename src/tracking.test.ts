import { ClickhouseCounters, analyzeQueries } from 'tracking';
import { CHBuilderQuery, CHQuery, CHSqlQuery, EditorType } from 'types/sql';
import { QueryType, BuilderMode } from 'types/queryBuilder';

interface AnalyzeQueriesTestCase {
  description: string;
  queries: CHQuery[];
  expectedCounters: ClickhouseCounters;
}

describe('analyzeQueries', () => {
  const baseQuery: Partial<CHQuery> = {
    pluginVersion: '',
    rawSql: '',
    refId: ''
  };

  const emptyCounters: ClickhouseCounters = {
    sql_queries: 0,
    sql_query_type_table: 0,
    sql_query_type_logs: 0,
    sql_query_type_timeseries: 0,
    sql_query_type_traces: 0,

    builder_queries: 0,
    builder_query_type_table: 0,
    builder_query_type_table_simple: 0,
    builder_query_type_table_aggregate: 0,
    builder_query_type_logs: 0,
    builder_query_type_timeseries: 0,
    builder_query_type_timeseries_simple: 0,
    builder_query_type_timeseries_aggregate: 0,
    builder_query_type_traces: 0,
    builder_query_type_traces_search: 0,
    builder_query_type_traces_id: 0,
    builder_minimized_queries: 0,
    builder_otel_queries: 0
  };
  
  const cases: AnalyzeQueriesTestCase[] = [
    {
      description: 'should count 1 sql query with no query types',
      queries: [{
        ...baseQuery,
        editorType: EditorType.SQL
      } as CHSqlQuery],
      expectedCounters: {
        ...emptyCounters,
        sql_queries: 1
      }
    },
    {
      description: 'should count 1 sql query with Table type',
      queries: [{
        ...baseQuery,
        editorType: EditorType.SQL,
        queryType: QueryType.Table
      } as CHSqlQuery],
      expectedCounters: {
        ...emptyCounters,
        sql_queries: 1,
        sql_query_type_table: 1
      }
    },
    {
      description: 'should count 1 sql query with Logs type',
      queries: [{
        ...baseQuery,
        editorType: EditorType.SQL,
        queryType: QueryType.Logs
      } as CHSqlQuery],
      expectedCounters: {
        ...emptyCounters,
        sql_queries: 1,
        sql_query_type_logs: 1
      }
    },
    {
      description: 'should count 1 sql query with TimeSeries type',
      queries: [{
        ...baseQuery,
        editorType: EditorType.SQL,
        queryType: QueryType.TimeSeries
      } as CHSqlQuery],
      expectedCounters: {
        ...emptyCounters,
        sql_queries: 1,
        sql_query_type_timeseries: 1
      }
    },
    {
      description: 'should count 1 sql query with Traces type',
      queries: [{
        ...baseQuery,
        editorType: EditorType.SQL,
        queryType: QueryType.Traces
      } as CHSqlQuery],
      expectedCounters: {
        ...emptyCounters,
        sql_queries: 1,
        sql_query_type_traces: 1
      }
    },

    {
      description: 'should count 1 builder query with no builderOptions',
      queries: [{
        ...baseQuery,
        editorType: EditorType.Builder
      } as CHBuilderQuery],
      expectedCounters: {
        ...emptyCounters,
        builder_queries: 1
      }
    },
    {
      description: 'should count 1 builder query with empty builderOptions',
      queries: [{
        ...baseQuery,
        editorType: EditorType.Builder,
        builderOptions: {}
      } as CHBuilderQuery],
      expectedCounters: {
        ...emptyCounters,
        builder_queries: 1
      }
    },
    {
      description: 'should count 1 builder query with Table type, no mode',
      queries: [{
        ...baseQuery,
        editorType: EditorType.Builder,
        builderOptions: {
          queryType: QueryType.Table
        }
      } as CHBuilderQuery],
      expectedCounters: {
        ...emptyCounters,
        builder_queries: 1,
        builder_query_type_table: 1,
        builder_query_type_table_simple: 1 // Table defaults to simple
      }
    },
    {
      description: 'should count 1 builder query with Table type, simple mode',
      queries: [{
        ...baseQuery,
        editorType: EditorType.Builder,
        builderOptions: {
          queryType: QueryType.Table,
          mode: BuilderMode.List
        }
      } as CHBuilderQuery],
      expectedCounters: {
        ...emptyCounters,
        builder_queries: 1,
        builder_query_type_table: 1,
        builder_query_type_table_simple: 1
      }
    },
    {
      description: 'should count 1 builder query with Table type, aggregate mode',
      queries: [{
        ...baseQuery,
        editorType: EditorType.Builder,
        builderOptions: {
          queryType: QueryType.Table,
          mode: BuilderMode.Aggregate
        }
      } as CHBuilderQuery],
      expectedCounters: {
        ...emptyCounters,
        builder_queries: 1,
        builder_query_type_table: 1,
        builder_query_type_table_aggregate: 1
      }
    },
    {
      description: 'should count 1 builder query with Logs type',
      queries: [{
        ...baseQuery,
        editorType: EditorType.Builder,
        builderOptions: {
          queryType: QueryType.Logs
        }
      } as CHBuilderQuery],
      expectedCounters: {
        ...emptyCounters,
        builder_queries: 1,
        builder_query_type_logs: 1,
      }
    },
    {
      description: 'should count 1 builder query with TimeSeries type, no mode',
      queries: [{
        ...baseQuery,
        editorType: EditorType.Builder,
        builderOptions: {
          queryType: QueryType.TimeSeries
        }
      } as CHBuilderQuery],
      expectedCounters: {
        ...emptyCounters,
        builder_queries: 1,
        builder_query_type_timeseries: 1,
        builder_query_type_timeseries_simple: 1 // TimeSeries defaults to simple
      }
    },
    {
      description: 'should count 1 builder query with TimeSeries type, simple mode',
      queries: [{
        ...baseQuery,
        editorType: EditorType.Builder,
        builderOptions: {
          queryType: QueryType.TimeSeries,
          mode: BuilderMode.Aggregate
        }
      } as CHBuilderQuery],
      expectedCounters: {
        ...emptyCounters,
        builder_queries: 1,
        builder_query_type_timeseries: 1,
        builder_query_type_timeseries_simple: 1
      }
    },
    {
      description: 'should count 1 builder query with TimeSeries type, aggregate mode',
      queries: [{
        ...baseQuery,
        editorType: EditorType.Builder,
        builderOptions: {
          queryType: QueryType.TimeSeries,
          mode: BuilderMode.Trend
        }
      } as CHBuilderQuery],
      expectedCounters: {
        ...emptyCounters,
        builder_queries: 1,
        builder_query_type_timeseries: 1,
        builder_query_type_timeseries_aggregate: 1
      }
    },
    {
      description: 'should count 1 builder query with Traces type, no mode',
      queries: [{
        ...baseQuery,
        editorType: EditorType.Builder,
        builderOptions: {
          queryType: QueryType.Traces
        }
      } as CHBuilderQuery],
      expectedCounters: {
        ...emptyCounters,
        builder_queries: 1,
        builder_query_type_traces: 1,
        builder_query_type_traces_search: 1 // Traces defaults to search mode
      }
    },
    {
      description: 'should count 1 builder query with Traces type, trace ID mode',
      queries: [{
        ...baseQuery,
        editorType: EditorType.Builder,
        builderOptions: {
          queryType: QueryType.Traces,
          meta: {
            isTraceIdMode: true
          }
        }
      } as CHBuilderQuery],
      expectedCounters: {
        ...emptyCounters,
        builder_queries: 1,
        builder_query_type_traces: 1,
        builder_query_type_traces_id: 1
      }
    },
    {
      description: 'should count 1 builder query with Traces type, trace search mode',
      queries: [{
        ...baseQuery,
        editorType: EditorType.Builder,
        builderOptions: {
          queryType: QueryType.Traces,
          meta: {
            isTraceIdMode: false
          }
        }
      } as CHBuilderQuery],
      expectedCounters: {
        ...emptyCounters,
        builder_queries: 1,
        builder_query_type_traces: 1,
        builder_query_type_traces_search: 1
      }
    },
    {
      description: 'should count 1 minimized query',
      queries: [{
        ...baseQuery,
        editorType: EditorType.Builder,
        builderOptions: {
          queryType: QueryType.Table,
          meta: {
            minimized: true
          }
        }
      } as CHBuilderQuery],
      expectedCounters: {
        ...emptyCounters,
        builder_queries: 1,
        builder_query_type_table: 1,
        builder_query_type_table_simple: 1,
        builder_minimized_queries: 1
      }
    },
    {
      description: 'should count 1 otel query',
      queries: [{
        ...baseQuery,
        editorType: EditorType.Builder,
        builderOptions: {
          queryType: QueryType.Table,
          meta: {
            otelEnabled: true
          }
        }
      } as CHBuilderQuery],
      expectedCounters: {
        ...emptyCounters,
        builder_queries: 1,
        builder_query_type_table: 1,
        builder_query_type_table_simple: 1,
        builder_otel_queries: 1
      }
    },
    {
      description: 'should count 3 queries, mixed types',
      queries: [
        {
          ...baseQuery,
          editorType: EditorType.SQL
        } as CHSqlQuery,
        {
        ...baseQuery,
        editorType: EditorType.Builder,
        builderOptions: {
          queryType: QueryType.Table
        }
      } as CHBuilderQuery,
      {
        ...baseQuery,
        editorType: EditorType.SQL
      } as CHSqlQuery],
      expectedCounters: {
        ...emptyCounters,
        sql_queries: 2,
        builder_queries: 1,
        builder_query_type_table: 1,
        builder_query_type_table_simple: 1,
      }
    },
    {
      description: 'should count 0 queries',
      queries: [],
      expectedCounters: { ...emptyCounters }
    },
  ];
  
  it.each(cases)('$description', (c) => {
    expect(analyzeQueries(c.queries)).toMatchObject(c.expectedCounters);
  });
});
