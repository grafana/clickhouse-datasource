import { CHBuilderQuery, CHQuery, CHSqlQuery, EditorType } from "types/sql";
import { migrateCHQuery } from "./migration";
import { pluginVersion } from "utils/version";
import { AggregateType, BuilderMode, ColumnHint, Filter, FilterOperator, OrderByDirection, QueryBuilderOptions, QueryType } from "types/queryBuilder";
import { mapQueryTypeToGrafanaFormat } from "./utils";

describe('Query Editor Version Migration', () => {
  it('does not apply migration for empty query', () => {
    const query = {} as CHQuery;

    const migratedQuery = migrateCHQuery(query);
    expect(migratedQuery).not.toBeUndefined();
    expect(migratedQuery).toEqual(query);
  });

  it('does not apply migration for default grafana query', () => {
    const defaultGrafanaQuery = {
      datasource: 'test-ds',
      refId: 'A'
    } as unknown as CHQuery;

    const migratedQuery = migrateCHQuery(defaultGrafanaQuery);
    expect(migratedQuery).not.toBeUndefined();
    expect(migratedQuery).toEqual(defaultGrafanaQuery);
  });

  it('does not apply migration to latest query schema', () => {
    const latestQuery: CHBuilderQuery = {
      pluginVersion,
      editorType: EditorType.Builder,
      builderOptions: {
        database: 'default',
        table: 'test',
        queryType: QueryType.Table,
        mode: BuilderMode.List,
        columns: [
          { name: 'a', type: 'String' },
          { name: 'b', type: 'String' },
        ],
        aggregates: [
          { aggregateType: AggregateType.Count, column: '*', alias: 'c' }
        ],
        filters: [
          {
            type: 'String',
            operator: FilterOperator.Equals,
            filterType: 'custom',
            key: 'b',
            condition: 'AND',
            value: 'test'
          }
        ],
        groupBy: ['a'],
        orderBy: [
          { name: 'a', dir: OrderByDirection.ASC }
        ],
        limit: 250,
        meta: {
          otelEnabled: false,
          otelVersion: 'test'
        }
      },
      rawSql: 'sql',
      refId: 'A'
    };

    const migratedQuery = migrateCHQuery(latestQuery);
    expect(migratedQuery).toBe(latestQuery);
    expect(migratedQuery).toEqual(latestQuery);
  });

  it('apply migration for v3 builder query', () => {
    const v3Query = {
      refId: 'A',
      datasource: {
        type: 'ch-ds',
        uid: 'test-uid'
      },
      key: 'test-key',
      queryType: 'builder',
      rawSql: 'SELECT 1',
      builderOptions: {
        mode: 'list',
        fields: [
          'created_at',
          'level',
          'event'
        ],
        limit: 50,
        database: 'default',
        table: 'logs',
        filters: [
          {
            operator: 'WITH IN DASHBOARD TIME RANGE',
            filterType: 'custom',
            key: 'created_at',
            type: 'datetime',
            condition: 'AND',
            restrictToFields: [
              {
                name: 'created_at',
                type: 'DateTime',
                label: 'created_at',
                picklistValues: []
              }
            ]
          },
          {
            filterType: 'custom',
            key: 'event',
            type: 'String',
            condition: 'AND',
            operator: 'IS NOT NULL'
          }
        ],
        metrics: [
          { field: 'level', aggregation: 'count', alias: 'c' }
        ],
        groupBy: ['c'],
        orderBy: [
          { name: 'created_at', dir: 'DESC' }
        ]
      },
      format: 1,
      selectedFormat: 1,
      meta: {
        timezone: 'tz'
      }
    } as unknown as CHQuery;

    const latestQuery: CHBuilderQuery = {
      pluginVersion,
      editorType: EditorType.Builder,
      refId: 'A',
      datasource: {
        type: 'ch-ds',
        uid: 'test-uid'
      },
      key: 'test-key',
      builderOptions: {
        database: 'default',
        table: 'logs',
        queryType: QueryType.Table,
        mode: BuilderMode.List,
        columns: [
          { name: 'created_at' },
          { name: 'level' },
          { name: 'event' },
        ],
        filters: [
          {
            operator: FilterOperator.WithInGrafanaTimeRange,
            filterType: 'custom',
            key: 'created_at',
            type: 'datetime',
            condition: 'AND',
            restrictToFields: [
              {
                name: 'created_at',
                type: 'DateTime',
                label: 'created_at',
                picklistValues: []
              }
            ]
          } as Filter,
          {
            filterType: 'custom',
            key: 'event',
            type: 'String',
            condition: 'AND',
            operator: FilterOperator.IsNotNull
          }
        ],
        aggregates: [
          { aggregateType: AggregateType.Count, column: 'level', alias: 'c' }
        ],
        groupBy: ['c'],
        orderBy: [
          { name: 'created_at', dir: OrderByDirection.DESC }
        ],
        limit: 50,
      },
      rawSql: 'SELECT 1',
      format: mapQueryTypeToGrafanaFormat(QueryType.Table),
      meta: {
        timezone: 'tz'
      }
    };

    const migratedQuery = migrateCHQuery(v3Query);
    expect(migratedQuery).toEqual(latestQuery);
  });

  it('apply migration for v3 sql query', () => {
    const v3Query = {
      refId: 'A',
      datasource: {
        type: 'ch-ds',
        uid: 'test-uid'
      },
      key: 'test-key',
      queryType: 'sql',
      rawSql: 'SELECT 1',
      meta: {
        timezone: 'tz',
        builderOptions: {
          fields: [
            'created_at',
            'level',
            'event'
          ]
        }
      },
      format: 1,
      selectedFormat: 1,
      expand: true
    } as unknown as CHQuery;

    const latestQuery: CHSqlQuery = {
      pluginVersion,
      editorType: EditorType.SQL,
      refId: 'A',
      datasource: {
        type: 'ch-ds',
        uid: 'test-uid'
      },
      key: 'test-key',
      rawSql: 'SELECT 1',
      queryType: QueryType.Table,
      format: mapQueryTypeToGrafanaFormat(QueryType.Table),
      expand: true,
      meta: {
        timezone: 'tz',
        builderOptions: {
          database: '',
          table: '',
          queryType: QueryType.Table,
          columns: [
            { name: 'created_at' },
            { name: 'level' },
            { name: 'event' },
          ]
        } as QueryBuilderOptions
      }
    };

    const migratedQuery = migrateCHQuery(v3Query);
    expect(migratedQuery).toEqual(latestQuery);
  });

  it('apply migration for partial v3 query', () => {
    const v3Query = {
      queryType: 'builder',
      builderOptions: {
        mode: 'list',
      },
      rawSql: ''
    } as unknown as CHQuery;

    const latestQuery: CHBuilderQuery = {
      pluginVersion,
      editorType: EditorType.Builder,
      builderOptions: {
        database: '',
        table: '',
        queryType: QueryType.Table,
        mode: BuilderMode.List,
        columns: []
      },
      rawSql: '',
      refId: ''
    };

    const migratedQuery = migrateCHQuery(v3Query);
    expect(migratedQuery).toEqual(latestQuery);
  });

  it('v3 migration maps hinted columns', () => {
    const v3Query = {
      queryType: 'builder',
      builderOptions: {
        timeField: 'timestamp',
        timeFieldType: 'DateTime',
        logLevelField: 'level'
      },
      rawSql: ''
    } as unknown as CHQuery;

    const latestQuery: CHBuilderQuery = {
      pluginVersion,
      editorType: EditorType.Builder,
      builderOptions: {
        database: '',
        table: '',
        queryType: QueryType.TimeSeries, // TimeSeries because v3 timeField is present
        columns: [
          { name: 'timestamp', type: 'DateTime', hint: ColumnHint.Time },
          { name: 'level', hint: ColumnHint.LogLevel }
        ]
      },
      format: undefined,
      rawSql: '',
      refId: ''
    };

    const migratedQuery = migrateCHQuery(v3Query);
    expect(migratedQuery).toEqual(latestQuery);
  });

  it('v3 migration detects QueryType.TimeSeries', () => {
    const v3Query = {
      queryType: 'builder',
      builderOptions: {
        timeField: 'timestamp',
        timeFieldType: 'DateTime',
      },
      rawSql: ''
    } as unknown as CHQuery;

    const latestQuery: CHBuilderQuery = {
      pluginVersion,
      editorType: EditorType.Builder,
      builderOptions: {
        database: '',
        table: '',
        queryType: QueryType.TimeSeries,
        columns: [
          { name: 'timestamp', type: 'DateTime', hint: ColumnHint.Time },
        ]
      },
      format: undefined,
      rawSql: '',
      refId: ''
    };

    const migratedQuery = migrateCHQuery(v3Query);
    expect(migratedQuery).toEqual(latestQuery);
  });

  it('v3 migration detects QueryType.Logs', () => {
    const v3Query = {
      queryType: 'builder',
      builderOptions: {
        logLevelField: 'level',
      },
      rawSql: ''
    } as unknown as CHQuery;

    const latestQuery: CHBuilderQuery = {
      pluginVersion,
      editorType: EditorType.Builder,
      builderOptions: {
        database: '',
        table: '',
        queryType: QueryType.Logs,
        columns: [
          { name: 'level', hint: ColumnHint.LogLevel }
        ]
      },
      format: undefined,
      rawSql: '',
      refId: ''
    };

    const migratedQuery = migrateCHQuery(v3Query);
    expect(migratedQuery).toEqual(latestQuery);
  });
});
