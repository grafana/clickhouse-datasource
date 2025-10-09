import {
  arrayToDataFrame,
  CoreApp,
  DataQueryRequest,
  DataQueryResponse,
  SupplementaryQueryType,
  TimeRange,
  TypedVariableModel,
  toDataFrame,
} from '@grafana/data';
import { DataQuery } from '@grafana/schema';
import { Observable, of } from 'rxjs';
import { DataSourceWithBackend } from '@grafana/runtime';
import { mockDatasource } from '__mocks__/datasource';
import { CHBuilderQuery, CHQuery, CHSqlQuery, EditorType } from 'types/sql';
import { ColumnHint, QueryType, BuilderMode, QueryBuilderOptions } from 'types/queryBuilder';
import { cloneDeep } from 'lodash';
import { Datasource } from './CHDatasource';
import * as logs from './logs';
import { AdHocFilter } from './adHocFilter';

jest.mock('./logs', () => ({
  getTimeFieldRoundingClause: jest.fn(),
  getIntervalInfo: jest.fn(),
  queryLogsVolume: jest.fn(),
  TIME_FIELD_ALIAS: jest.requireActual('./logs').TIME_FIELD_ALIAS,
  DEFAULT_LOGS_ALIAS: jest.requireActual('./logs').DEFAULT_LOGS_ALIAS,
  LOG_LEVEL_TO_IN_CLAUSE: jest.requireActual('./logs').LOG_LEVEL_TO_IN_CLAUSE,
}));

interface InstanceConfig {
  queryResponse: {} | [];
}

const templateSrvMock = { replace: jest.fn(), getVariables: jest.fn(), getAdhocFilters: jest.fn() };
// noinspection JSUnusedGlobalSymbols
jest.mock('@grafana/runtime', () => ({
  ...(jest.requireActual('@grafana/runtime') as unknown as object),
  getTemplateSrv: () => templateSrvMock,
}));

const createInstance = ({ queryResponse }: Partial<InstanceConfig> = {}) => {
  const instance = cloneDeep(mockDatasource);
  jest.spyOn(instance, 'query').mockImplementation((_request) => of({ data: [toDataFrame(queryResponse ?? [])] }));
  return instance;
};

describe('ClickHouseDatasource', () => {
  describe('metricFindQuery', () => {
    it('fetches values', async () => {
      const mockedValues = [1, 100];
      const queryResponse = {
        fields: [{ name: 'field', type: 'number', values: mockedValues }],
      };
      const expectedValues = mockedValues.map((v) => ({ text: v, value: v }));
      const values = await createInstance({ queryResponse }).metricFindQuery('mock', {});
      expect(values).toEqual(expectedValues);
    });

    it('fetches name/value pairs', async () => {
      const mockedIds = [1, 2];
      const mockedValues = [100, 200];
      const queryResponse = {
        fields: [
          { name: 'id', type: 'number', values: mockedIds },
          { name: 'values', type: 'number', values: mockedValues },
        ],
      };
      const expectedValues = mockedValues.map((v, i) => ({ text: v, value: mockedIds[i] }));
      const values = await createInstance({ queryResponse }).metricFindQuery('mock', {});
      expect(values).toEqual(expectedValues);
    });
  });

  describe('applyTemplateVariables', () => {
    it('interpolates', async () => {
      const rawSql = 'foo';
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => rawSql);
      const query = { rawSql: 'select', editorType: EditorType.SQL } as CHQuery;
      const val = createInstance({}).applyTemplateVariables(query, {});
      expect(spyOnReplace).toHaveBeenCalled();
      expect(val).toEqual({ rawSql, editorType: EditorType.SQL });
    });
    it('should handle $__conditionalAll and not replace', async () => {
      const query = { rawSql: '$__conditionalAll(foo, $fieldVal)', editorType: EditorType.SQL } as CHQuery;
      const vars = [{ current: { value: `'val1', 'val2'` }, name: 'fieldVal' }] as TypedVariableModel[];
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation((x) => x);
      const spyOnGetVars = jest.spyOn(templateSrvMock, 'getVariables').mockImplementation(() => vars);
      const val = createInstance({}).applyTemplateVariables(query, {});
      expect(spyOnReplace).toHaveBeenCalled();
      expect(spyOnGetVars).toHaveBeenCalled();
      expect(val).toEqual({ rawSql: `foo`, editorType: EditorType.SQL });
    });
    it('should handle $__conditionalAll and replace', async () => {
      const query = { rawSql: '$__conditionalAll(foo, $fieldVal)', editorType: EditorType.SQL } as CHQuery;
      const vars = [{ current: { value: '$__all' }, name: 'fieldVal' }] as TypedVariableModel[];
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation((x) => x);
      const spyOnGetVars = jest.spyOn(templateSrvMock, 'getVariables').mockImplementation(() => vars);
      const val = createInstance({}).applyTemplateVariables(query, {});
      expect(spyOnReplace).toHaveBeenCalled();
      expect(spyOnGetVars).toHaveBeenCalled();
      expect(val).toEqual({ rawSql: `1=1`, editorType: EditorType.SQL });
    });

    it('should apply ad-hoc filters correctly with template variables for table names', async () => {
      // Setup the query with template variables for table names
      const query = {
        rawSql: 'SELECT * FROM ${database}.${table}',
        editorType: EditorType.SQL,
      } as CHQuery;

      // Mock the ad-hoc filter
      const adHocFilter = new AdHocFilter();

      // The resolved table name after template variable substitution
      const resolvedSql = 'SELECT * FROM test_db.test_table';

      // The expected final SQL with ad-hoc filters applied
      const sqlWithAdHocFilters = `SELECT * FROM test_db.test_table settings additional_table_filters={'test_db.test_table' : ' column = \\'value\\' '}`;

      // Mock the template variable resolution
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => resolvedSql);
      const spyOnGetVars = jest.spyOn(templateSrvMock, 'getVariables').mockImplementation(() => []);

      // Setup ad-hoc filters
      const adHocFilters = [{ key: 'column', operator: '=', value: 'value' }];

      // Mock getAdhocFilters to return our test filters
      jest.spyOn(templateSrvMock, 'getAdhocFilters').mockImplementation(() => adHocFilters);

      // Mock adHocFilter.apply to return our expected modified SQL
      const applyFilterSpy = jest.spyOn(adHocFilter, 'apply').mockImplementation(() => sqlWithAdHocFilters);

      // Create datasource instance with our mocked ad-hoc filter
      const ds = createInstance({});
      ds.adHocFilter = adHocFilter;

      // Resolve variables
      const result = ds.applyTemplateVariables(query, {}, adHocFilters);

      // Verify template variables were resolved before ad-hoc filters were applied
      expect(spyOnReplace).toHaveBeenCalled();
      expect(spyOnGetVars).toHaveBeenCalled();

      // Verify that apply was called with the resolved SQL
      expect(applyFilterSpy).toHaveBeenCalledWith(resolvedSql, adHocFilters);

      // Verify that the final query contains the ad-hoc filters
      expect(result.rawSql).toEqual(sqlWithAdHocFilters);
    });
  });

  describe('Tag Keys', () => {
    it('should Fetch Default Tags When No Second AdHoc Variable', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => '$clickhouse_adhoc_query');
      const ds = cloneDeep(mockDatasource);
      const frame = arrayToDataFrame([{ name: 'foo', type: 'string', table: 'table' }]);
      jest.spyOn(ds, 'getDefaultDatabase').mockImplementation(() => undefined!); // Disable default DB
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));

      const keys = await ds.getTagKeys();
      expect(spyOnReplace).toHaveBeenCalled();
      const expected = { rawSql: 'SELECT name, type, table FROM system.columns' };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );

      expect(keys).toEqual([{ text: 'table.foo' }]);
    });

    it('should Fetch Tags With Default Database', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => '$clickhouse_adhoc_query');
      const frame = arrayToDataFrame([{ name: 'foo', type: 'string', table: 'table' }]);
      const ds = cloneDeep(mockDatasource);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));

      const keys = await ds.getTagKeys();
      expect(spyOnReplace).toHaveBeenCalled();
      const expected = { rawSql: "SELECT name, type, table FROM system.columns WHERE database IN ('foo')" };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );

      expect(keys).toEqual([{ text: 'table.foo' }]);
    });

    it('should Fetch Tags From Query', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => 'select name from foo');
      const frame = arrayToDataFrame([{ name: 'foo' }]);
      const ds = cloneDeep(mockDatasource);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));

      const keys = await ds.getTagKeys();
      expect(spyOnReplace).toHaveBeenCalled();
      const expected = { rawSql: 'select name from foo' };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );

      expect(keys).toEqual([{ text: 'name' }]);
    });
    it('returns no tags when CH version is less than 22.7 ', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => 'select name from foo');
      const frame = arrayToDataFrame([{ version: '21.9.342' }]);
      const ds = cloneDeep(mockDatasource);
      ds.adHocFiltersStatus = 2;
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));

      const keys = await ds.getTagKeys();
      expect(spyOnReplace).toHaveBeenCalled();

      expect(spyOnQuery).toHaveBeenCalled();

      expect(keys).toEqual({});
    });

    it('returns tags when CH version is greater than 22.7 ', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => 'select name from foo');
      const frameVer = arrayToDataFrame([{ version: '23.2.212' }]);
      const frameData = arrayToDataFrame([{ name: 'foo' }]);
      const ds = cloneDeep(mockDatasource);
      ds.adHocFiltersStatus = 2;
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((request) => {
        return request.targets[0].rawSql === 'SELECT version()' ? of({ data: [frameVer] }) : of({ data: [frameData] });
      });

      const keys = await ds.getTagKeys();
      expect(spyOnReplace).toHaveBeenCalled();

      expect(spyOnQuery).toHaveBeenCalled();

      expect(keys).toEqual([{ text: 'name' }]);
    });
  });

  describe('Tag Values', () => {
    it('should Fetch Tag Values from Schema', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => '$clickhouse_adhoc_query');
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.defaultDatabase = undefined;
      const frame = arrayToDataFrame([{ bar: 'foo' }]);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));
      const values = await ds.getTagValues({ key: 'foo.bar' });
      expect(spyOnReplace).toHaveBeenCalled();
      const expected = { rawSql: 'select distinct bar from foo limit 1000' };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );

      expect(values).toEqual([{ text: 'foo' }]);
    });

    it('should Fetch Tag Values from Query', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => 'select name from bar');
      const ds = cloneDeep(mockDatasource);
      const frame = arrayToDataFrame([{ name: 'foo' }]);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));
      const values = await ds.getTagValues({ key: 'name' });
      expect(spyOnReplace).toHaveBeenCalled();
      const expected = { rawSql: 'select name from bar' };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );

      expect(values).toEqual([{ text: 'foo' }]);
    });
  });

  describe('Conditional All', () => {
    it('should replace $__conditionalAll with 1=1 when all is selected', async () => {
      const rawSql = 'select stuff from table where $__conditionalAll(fieldVal in ($fieldVal), $fieldVal);';
      const val = createInstance({}).applyConditionalAll(rawSql, [
        { name: 'fieldVal', current: { value: '$__all' } } as any,
      ]);
      expect(val).toEqual('select stuff from table where 1=1;');
    });
    it('should replace $__conditionalAll with arg when anything else is selected', async () => {
      const rawSql = 'select stuff from table where $__conditionalAll(fieldVal in ($fieldVal), $fieldVal);';
      const val = createInstance({}).applyConditionalAll(rawSql, [
        { name: 'fieldVal', current: { value: `'val1', 'val2'` } } as any,
      ]);
      expect(val).toEqual(`select stuff from table where fieldVal in ($fieldVal);`);
    });
    it('should replace all $__conditionalAll', async () => {
      const rawSql =
        'select stuff from table where $__conditionalAll(fieldVal in ($fieldVal), $fieldVal) and $__conditionalAll(fieldVal in ($fieldVal2), $fieldVal2);';
      const val = createInstance({}).applyConditionalAll(rawSql, [
        { name: 'fieldVal', current: { value: `'val1', 'val2'` } } as any,
        { name: 'fieldVal2', current: { value: '$__all' } } as any,
      ]);
      expect(val).toEqual(`select stuff from table where fieldVal in ($fieldVal) and 1=1;`);
    });
  });

  describe('fetchPathsForJSONColumns', () => {
    it('sends a correct query when database and table names are provided', async () => {
      const ds = cloneDeep(mockDatasource);
      const frame = arrayToDataFrame([
        JSON.stringify({ keys: 'a.b.c', values: ['Int64'] }),
        JSON.stringify({ keys: 'a.b.d', values: ['String'] }),
        JSON.stringify({ keys: 'a.b.e', values: ['Bool'] }),
      ]);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));
      await ds.fetchPathsForJSONColumns('db_name', 'table_name', 'jsonCol');
      const expected = {
        rawSql:
          'SELECT arrayJoin(distinctJSONPathsAndTypes(jsonCol)) FROM "db_name"."table_name" SETTINGS max_execution_time=10',
      };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );
    });

    it('sends a correct query when only table name is provided', async () => {
      const ds = cloneDeep(mockDatasource);
      const frame = arrayToDataFrame([
        JSON.stringify({ keys: 'a.b.c', values: ['Int64'] }),
        JSON.stringify({ keys: 'a.b.d', values: ['String'] }),
        JSON.stringify({ keys: 'a.b.e', values: ['Bool'] }),
      ]);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));
      await ds.fetchPathsForJSONColumns('', 'table_name', 'jsonCol');
      const expected = {
        rawSql: 'SELECT arrayJoin(distinctJSONPathsAndTypes(jsonCol)) FROM "table_name" SETTINGS max_execution_time=10',
      };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );
    });

    it('sends a correct query when table name contains a dot', async () => {
      const ds = cloneDeep(mockDatasource);
      const frame = arrayToDataFrame([
        JSON.stringify({ keys: 'a.b.c', values: ['Int64'] }),
        JSON.stringify({ keys: 'a.b.d', values: ['String'] }),
        JSON.stringify({ keys: 'a.b.e', values: ['Bool'] }),
      ]);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));
      await ds.fetchPathsForJSONColumns('', 'table.name', 'jsonCol');
      const expected = {
        rawSql: 'SELECT arrayJoin(distinctJSONPathsAndTypes(jsonCol)) FROM "table.name" SETTINGS max_execution_time=10',
      };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );
    });

    it('returns correct json columns', async () => {
      const ds = cloneDeep(mockDatasource);
      const frame = arrayToDataFrame([
        JSON.stringify({ keys: 'a.b.c', values: ['Int64'] }),
        JSON.stringify({ keys: 'a.b.d', values: ['String'] }),
        JSON.stringify({ keys: 'a.b.e', values: ['Bool'] }),
      ]);
      jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));

      const jsonColumns = await ds.fetchPathsForJSONColumns('db_name', 'table_name', 'jsonCol');
      expect(jsonColumns).toMatchObject([
        { name: 'jsonCol.a.b.c', label: 'jsonCol.a.b.c', type: 'Int64', picklistValues: [] },
        { name: 'jsonCol.a.b.d', label: 'jsonCol.a.b.d', type: 'String', picklistValues: [] },
        { name: 'jsonCol.a.b.e', label: 'jsonCol.a.b.e', type: 'Bool', picklistValues: [] },
      ]);
    });
  });

  describe('fetchColumnsFromTable', () => {
    it('sends a correct query when database and table names are provided', async () => {
      const ds = cloneDeep(mockDatasource);
      const frame = arrayToDataFrame([{ name: 'foo', type: 'string', table: 'table' }]);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));
      await ds.fetchColumnsFromTable('db_name', 'table_name');
      const expected = { rawSql: 'DESC TABLE "db_name"."table_name"' };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );
    });

    it('sends a correct query when only table name is provided', async () => {
      const ds = cloneDeep(mockDatasource);
      const frame = arrayToDataFrame([{ name: 'foo', type: 'string', table: 'table' }]);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));
      await ds.fetchColumnsFromTable('', 'table_name');
      const expected = { rawSql: 'DESC TABLE "table_name"' };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );
    });

    it('sends a correct query when table name contains a dot', async () => {
      const ds = cloneDeep(mockDatasource);
      const frame = arrayToDataFrame([{ name: 'foo', type: 'string', table: 'table' }]);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_) => of({ data: [frame] }));

      await ds.fetchColumnsFromTable('', 'table.name');
      const expected = { rawSql: 'DESC TABLE "table.name"' };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );
    });
  });

  describe('fetchColumnsFromAliasTable', () => {
    it('sends a correct query when full table name is provided', async () => {
      const ds = cloneDeep(mockDatasource);
      const frame = arrayToDataFrame([{ name: 'foo', type: 'string', table: 'table' }]);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));
      await ds.fetchColumnsFromAliasTable('"db_name"."table_name"');
      const expected = { rawSql: 'SELECT alias, select, "type" FROM "db_name"."table_name"' };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );
    });
  });

  describe('getAliasTable', () => {
    it('returns the matching table alias', async () => {
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.aliasTables = [
        {
          targetDatabase: 'db_name',
          targetTable: 'table_name',
          aliasDatabase: 'alias_db',
          aliasTable: 'alias_table',
        },
      ];
      const result = ds.getAliasTable('db_name', 'table_name');
      const expected = '"alias_db"."alias_table"';

      expect(result).toBe(expected);
    });

    it('returns null when no alias matches found', async () => {
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.aliasTables = [
        {
          targetDatabase: 'db_name',
          targetTable: 'table_name',
          aliasDatabase: 'alias_db',
          aliasTable: 'alias_table',
        },
      ];
      const result = ds.getAliasTable('other_db', 'other_table');
      expect(result).toBeNull();
    });
  });

  describe('query', () => {
    it('filters out hidden queries', async () => {
      const instance = cloneDeep(mockDatasource);
      // Datasource inherits from DataSourceWithBackend
      const spy = jest
        .spyOn(DataSourceWithBackend.prototype, 'query')
        .mockImplementation((_request) => of({ data: [toDataFrame([])] }));
      instance.query({
        targets: [{ refId: '1' }, { refId: '2', hide: false }, { refId: '3', hide: true }] as DataQuery[],
        timezone: 'UTC',
      } as any);

      expect(spy).toHaveBeenCalledWith({
        targets: [
          { refId: '1', meta: { timezone: 'UTC' } },
          { refId: '2', hide: false, meta: { timezone: 'UTC' } },
        ],
        timezone: 'UTC',
      });
    });
  });

  describe('SupplementaryQueriesSupport', () => {
    const query: CHBuilderQuery = {
      pluginVersion: '',
      refId: '42',
      editorType: EditorType.Builder,
      rawSql: 'SELECT * FROM system.numbers LIMIT 1',
      builderOptions: {
        database: 'default',
        table: 'logs',
        queryType: QueryType.Logs,
        mode: BuilderMode.List,
        columns: [
          { name: 'created_at', hint: ColumnHint.Time },
          { name: 'level', hint: ColumnHint.LogLevel },
        ],
      },
    };
    const request: DataQueryRequest<CHQuery> = {
      app: CoreApp.Explore,
      interval: '1s',
      intervalMs: 1000,
      range: {} as TimeRange,
      requestId: '',
      scopedVars: {
        __interval_ms: {
          text: '',
          value: 60001,
        },
      },
      startTime: 0,
      targets: [],
      timezone: '',
    };

    let datasource: Datasource;
    beforeEach(() => {
      datasource = cloneDeep(mockDatasource);
    });

    describe('getSupplementaryLogsVolumeQuery', () => {
      it('should return undefined if any of the conditions are not met', async () => {
        [QueryType.Table, QueryType.TimeSeries, QueryType.Traces].forEach((queryType) => {
          expect(
            datasource.getSupplementaryLogsVolumeQuery(request, {
              ...query,
              builderOptions: {
                ...query.builderOptions,
                queryType,
              },
            })
          ).toBeUndefined();
        });
        [BuilderMode.Aggregate, BuilderMode.Trend].forEach((mode) => {
          expect(
            datasource.getSupplementaryLogsVolumeQuery(request, {
              ...query,
              builderOptions: {
                ...query.builderOptions,
                mode,
              },
            })
          ).toBeUndefined();
        });
        expect(
          datasource.getSupplementaryLogsVolumeQuery(request, {
            ...query,
            editorType: EditorType.SQL,
            queryType: undefined,
          })
        ).toBeUndefined();
        expect(
          datasource.getSupplementaryLogsVolumeQuery(request, {
            ...query,
            builderOptions: {
              ...query.builderOptions,
              database: '',
            },
          })
        ).toBeUndefined();
        expect(
          datasource.getSupplementaryLogsVolumeQuery(request, {
            ...query,
            builderOptions: {
              ...query.builderOptions,
              table: '',
            },
          })
        ).toBeUndefined();
        expect(
          datasource.getSupplementaryLogsVolumeQuery(request, {
            ...query,
            builderOptions: {
              ...query.builderOptions,
              columns: query.builderOptions.columns?.filter((c) => c.hint !== ColumnHint.Time),
            } as QueryBuilderOptions,
          })
        ).toBeUndefined();
      });

      it('should render a basic query if we have no log level field set', async () => {
        jest
          .spyOn(logs, 'getTimeFieldRoundingClause')
          .mockReturnValue('toStartOfInterval("created_at", INTERVAL 1 DAY)');
        const result = datasource.getSupplementaryLogsVolumeQuery(request, {
          ...query,
          builderOptions: {
            ...query.builderOptions,
            columns: query.builderOptions.columns?.filter((c) => c.hint !== ColumnHint.LogLevel),
          } as QueryBuilderOptions,
        });
        expect(result?.rawSql).toEqual(
          'SELECT toStartOfInterval("created_at", INTERVAL 1 DAY) as "time", count(*) as logs ' +
            'FROM "default"."logs" ' +
            'GROUP BY time ' +
            'ORDER BY time ASC'
        );
      });

      it('should render a sophisticated log volume query when log level field is set', async () => {
        jest
          .spyOn(logs, 'getTimeFieldRoundingClause')
          .mockReturnValue('toStartOfInterval("created_at", INTERVAL 1 DAY)');
        const result = datasource.getSupplementaryLogsVolumeQuery(request, query);
        expect(result?.rawSql).toEqual(
          `SELECT toStartOfInterval("created_at", INTERVAL 1 DAY) as "time", ` +
            `sum(multiSearchAny(toString("level"), ['critical','fatal','crit','alert','emerg','CRITICAL','FATAL','CRIT','ALERT','EMERG','Critical','Fatal','Crit','Alert','Emerg'])) as critical, ` +
            `sum(multiSearchAny(toString("level"), ['error','err','eror','ERROR','ERR','EROR','Error','Err','Eror'])) as error, ` +
            `sum(multiSearchAny(toString("level"), ['warn','warning','WARN','WARNING','Warn','Warning'])) as warn, ` +
            `sum(multiSearchAny(toString("level"), ['info','information','informational','INFO','INFORMATION','INFORMATIONAL','Info','Information','Informational'])) as info, ` +
            `sum(multiSearchAny(toString("level"), ['debug','dbug','DEBUG','DBUG','Debug','Dbug'])) as debug, ` +
            `sum(multiSearchAny(toString("level"), ['trace','TRACE','Trace'])) as trace, ` +
            `sum(multiSearchAny(toString("level"), ['unknown','UNKNOWN','Unknown'])) as unknown ` +
            `FROM "default"."logs" ` +
            `GROUP BY time ` +
            `ORDER BY time ASC`
        );
      });
    });

    describe('getDataProvider', () => {
      it('should not support LogsSample yet', async () => {
        expect(datasource.getDataProvider(SupplementaryQueryType.LogsSample, {} as any)).toBeUndefined();
      });

      it('should do nothing if there are no supplementary queries for targets', async () => {
        jest.spyOn(Datasource.prototype, 'getSupplementaryLogsVolumeQuery').mockReturnValue(undefined);
        jest.spyOn(logs, 'getIntervalInfo').mockReturnValue({ interval: '1d' });
        expect(
          datasource.getDataProvider(SupplementaryQueryType.LogsVolume, {
            scopedVars: {
              __interval: {},
            },
            targets: ['foo', 'bar'],
          } as any)
        ).toBeUndefined();
      });

      it('should call logVolumeQuery if there are supplementary log volume queries for targets', async () => {
        const range = ['from', 'to'];
        const supplementaryQuery = {
          rawSql: 'supplementaryQuery',
        } as CHSqlQuery;
        jest.spyOn(Datasource.prototype, 'getSupplementaryLogsVolumeQuery').mockReturnValue(supplementaryQuery);
        jest.spyOn(logs, 'getIntervalInfo').mockReturnValue({ interval: '1d' });
        const queryLogsVolumeSpy = jest
          .spyOn(logs, 'queryLogsVolume')
          .mockReturnValue('queryLogsVolumeResponse' as unknown as Observable<DataQueryResponse>);
        expect(
          datasource.getDataProvider(SupplementaryQueryType.LogsVolume, {
            scopedVars: {
              __interval: {},
            },
            targets: ['initialTarget'],
            range,
          } as any)
        ).toEqual('queryLogsVolumeResponse');
        expect(queryLogsVolumeSpy).toBeCalledTimes(1);
        expect(queryLogsVolumeSpy).toHaveBeenLastCalledWith(
          datasource,
          {
            hideFromInspector: true,
            interval: '1d',
            scopedVars: {
              __interval: {
                text: '1d',
                value: '1d',
              },
            },
            targets: [supplementaryQuery],
            range,
          },
          { range, targets: ['initialTarget'] }
        );
      });
    });
  });
});
