import {
  arrayToDataFrame,
  CoreApp,
  DataQueryRequest,
  SupplementaryQueryType,
  TimeRange,
  toDataFrame,
  TypedVariableModel,
} from '@grafana/data';
import { DataSourceWithBackend } from '@grafana/runtime';
import { DataQuery } from '@grafana/schema';
import { mockDatasource } from '__mocks__/datasource';
import { cloneDeep } from 'lodash';
import { of } from 'rxjs';
import {
  BuilderMode,
  ColumnHint,
  FilterOperator,
  OrderByDirection,
  QueryBuilderOptions,
  QueryType,
} from 'types/queryBuilder';
import { CHBuilderQuery, CHQuery, CHSqlQuery, EditorType } from 'types/sql';
import { AdHocFilter } from './adHocFilter';
import { Datasource } from './CHDatasource';
import * as logs from './logs';

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

    it('forwards scopedVars from options to the query request', async () => {
      const queryResponse = {
        fields: [{ name: 'field', type: 'string', values: ['val1'] }],
      };
      const instance = createInstance({ queryResponse });
      const querySpy = jest.spyOn(instance, 'query');
      const scopedVars = { namespace: { text: 'prod', value: 'prod' } };

      await instance.metricFindQuery('SELECT 1', { scopedVars });

      expect(querySpy).toHaveBeenCalledWith(expect.objectContaining({ scopedVars }));
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
      const adHocFilters = [
        { key: 'column', operator: '=', value: 'value' },
        { key: 'column.nested', operator: '=', value: 'value2' },
      ];

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
      expect(applyFilterSpy).toHaveBeenCalledWith(resolvedSql, adHocFilters, false);

      // Verify that the final query contains the ad-hoc filters
      expect(result.rawSql).toEqual(sqlWithAdHocFilters);
    });

    it('should apply ad-hoc filters correctly with JSON and template variables for table names', async () => {
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
      const spyOnGetVars = jest
        .spyOn(templateSrvMock, 'getVariables')
        .mockImplementation(() => [{ name: 'clickhouse_adhoc_use_json' }]);

      // Setup ad-hoc filters
      const adHocFilters = [
        { key: 'column', operator: '=', value: 'value' },
        { key: 'column.nested', operator: '=', value: 'value2' },
      ];

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
      expect(applyFilterSpy).toHaveBeenCalledWith(resolvedSql, adHocFilters, true);

      // Verify that the final query contains the ad-hoc filters
      expect(result.rawSql).toEqual(sqlWithAdHocFilters);
    });

    it('should expand $__adHocFilters macro with single quotes', async () => {
      const query = {
        rawSql: "SELECT * FROM complex_table settings $__adHocFilters('my_table')",
        editorType: EditorType.SQL,
      } as CHQuery;

      const adHocFilters = [
        { key: 'key', operator: '=', value: 'val' },
        { key: 'keyNum', operator: '=', value: '123' },
      ];

      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation((x) => x);
      const spyOnGetVars = jest.spyOn(templateSrvMock, 'getVariables').mockImplementation(() => []);

      const result = createInstance({}).applyTemplateVariables(query, {}, adHocFilters);

      expect(spyOnReplace).toHaveBeenCalled();
      expect(spyOnGetVars).toHaveBeenCalled();
      expect(result.rawSql).toEqual(
        "SELECT * FROM complex_table settings additional_table_filters={'my_table': ' key = \\'val\\' AND keyNum = \\'123\\' '}"
      );
    });

    it('should expand $__adHocFilters macro with double quotes', async () => {
      const query = {
        rawSql: 'SELECT * FROM complex_table settings $__adHocFilters("my_table")',
        editorType: EditorType.SQL,
      } as CHQuery;

      const adHocFilters = [{ key: 'key', operator: '=', value: 'val' }];

      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation((x) => x);
      const spyOnGetVars = jest.spyOn(templateSrvMock, 'getVariables').mockImplementation(() => []);

      const result = createInstance({}).applyTemplateVariables(query, {}, adHocFilters);

      expect(spyOnReplace).toHaveBeenCalled();
      expect(spyOnGetVars).toHaveBeenCalled();
      expect(result.rawSql).toEqual(
        "SELECT * FROM complex_table settings additional_table_filters={'my_table': ' key = \\'val\\' '}"
      );
    });

    it('should expand $__adHocFilters macro to empty object when no filters are present', async () => {
      const query = {
        rawSql: "SELECT * FROM complex_table settings $__adHocFilters('my_table')",
        editorType: EditorType.SQL,
      } as CHQuery;

      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation((x) => x);
      const spyOnGetVars = jest.spyOn(templateSrvMock, 'getVariables').mockImplementation(() => []);

      const result = createInstance({}).applyTemplateVariables(query, {}, []);

      expect(spyOnReplace).toHaveBeenCalled();
      expect(spyOnGetVars).toHaveBeenCalled();
      expect(result.rawSql).toEqual('SELECT * FROM complex_table settings additional_table_filters={}');
    });

    it('should handle $__adHocFilters macro with spaces', async () => {
      const query = {
        rawSql: "SELECT * FROM complex_table settings $__adHocFilters(  'my_table'  )",
        editorType: EditorType.SQL,
      } as CHQuery;

      const adHocFilters = [{ key: 'key', operator: '=', value: 'val' }];

      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation((x) => x);
      const spyOnGetVars = jest.spyOn(templateSrvMock, 'getVariables').mockImplementation(() => []);

      const result = createInstance({}).applyTemplateVariables(query, {}, adHocFilters);

      expect(spyOnReplace).toHaveBeenCalled();
      expect(spyOnGetVars).toHaveBeenCalled();
      expect(result.rawSql).toEqual(
        "SELECT * FROM complex_table settings additional_table_filters={'my_table': ' key = \\'val\\' '}"
      );
    });

    it('should expand $__adHocFilters macro with multiple tables', async () => {
      const query = {
        rawSql: "SELECT * FROM complex_table settings $__adHocFilters('table1', 'table2')",
        editorType: EditorType.SQL,
      } as CHQuery;

      const adHocFilters = [
        { key: 'key', operator: '=', value: 'val' },
        { key: 'keyNum', operator: '=', value: '123' },
      ];

      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation((x) => x);
      const spyOnGetVars = jest.spyOn(templateSrvMock, 'getVariables').mockImplementation(() => []);

      const result = createInstance({}).applyTemplateVariables(query, {}, adHocFilters);

      expect(spyOnReplace).toHaveBeenCalled();
      expect(spyOnGetVars).toHaveBeenCalled();
      expect(result.rawSql).toEqual(
        "SELECT * FROM complex_table settings additional_table_filters={'table1': ' key = \\'val\\' AND keyNum = \\'123\\' ', 'table2': ' key = \\'val\\' AND keyNum = \\'123\\' '}"
      );
    });

    it('should expand $__adHocFilters macro with multiple tables using double quotes', async () => {
      const query = {
        rawSql: 'SELECT * FROM complex_table settings $__adHocFilters("table1", "table2", "table3")',
        editorType: EditorType.SQL,
      } as CHQuery;

      const adHocFilters = [{ key: 'key', operator: '=', value: 'val' }];

      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation((x) => x);
      const spyOnGetVars = jest.spyOn(templateSrvMock, 'getVariables').mockImplementation(() => []);

      const result = createInstance({}).applyTemplateVariables(query, {}, adHocFilters);

      expect(spyOnReplace).toHaveBeenCalled();
      expect(spyOnGetVars).toHaveBeenCalled();
      expect(result.rawSql).toEqual(
        "SELECT * FROM complex_table settings additional_table_filters={'table1': ' key = \\'val\\' ', 'table2': ' key = \\'val\\' ', 'table3': ' key = \\'val\\' '}"
      );
    });

    describe('span link trace retarget (#1889)', () => {
      const originalTraceId = 'a55d8be622a816047a902c60adedd776';
      const linkedTraceId = '4ea6a6e0d0525ed05ecc350d3cdd66b6';

      const traceIdBuilderQuery = (traceId: string, extra: Record<string, unknown> = {}): CHQuery =>
        ({
          pluginVersion: '',
          editorType: EditorType.Builder,
          rawSql: `SELECT "TraceId" as traceID FROM "otel"."otel_traces" WHERE traceID = '${traceId}'`,
          builderOptions: {
            database: 'otel',
            table: 'otel_traces',
            queryType: QueryType.Traces,
            columns: [{ name: 'TraceId', hint: ColumnHint.TraceId }],
            meta: { isTraceIdMode: true, traceId },
          },
          ...extra,
        }) as unknown as CHQuery;

      beforeEach(() => {
        jest.spyOn(templateSrvMock, 'replace').mockImplementation((x) => x);
        jest.spyOn(templateSrvMock, 'getVariables').mockImplementation(() => []);
      });

      it('retargets rawSql to the linked trace id when core injects a top-level query', () => {
        // Grafana core builds the span-link navigation target as { ...currentQuery, query: linkedTraceId }.
        const query = traceIdBuilderQuery(originalTraceId, { query: linkedTraceId });

        const result = createInstance({}).applyTemplateVariables(query, {}) as CHBuilderQuery;

        expect(result.rawSql).toContain(linkedTraceId);
        expect(result.rawSql).not.toContain(originalTraceId);
        expect(result.builderOptions.meta?.traceId).toEqual(linkedTraceId);
      });

      it('leaves the normal trace view untouched when there is no injected query', () => {
        const query = traceIdBuilderQuery(originalTraceId);

        const result = createInstance({}).applyTemplateVariables(query, {});

        expect(result.rawSql).toContain(originalTraceId);
        expect(result.rawSql).not.toContain(linkedTraceId);
      });

      it('does not retarget when the injected query matches the current trace id', () => {
        const query = traceIdBuilderQuery(originalTraceId, { query: originalTraceId });

        const result = createInstance({}).applyTemplateVariables(query, {});

        expect(result.rawSql).toContain(originalTraceId);
      });

      it('ignores a non-trace-id injected query value', () => {
        const query = traceIdBuilderQuery(originalTraceId, { query: 'not-a-trace-id' });

        const result = createInstance({}).applyTemplateVariables(query, {});

        expect(result.rawSql).toContain(originalTraceId);
        expect(result.rawSql).not.toContain('not-a-trace-id');
      });
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

    it('should Fetch Tag Values from Schema with . in column name', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => '$clickhouse_adhoc_query');
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.defaultDatabase = undefined;
      const frame = arrayToDataFrame([{ ['bar.fizz']: 'foo' }]);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));
      const values = await ds.getTagValues({ key: 'foo.bar.fizz' });
      expect(spyOnReplace).toHaveBeenCalled();
      const expected = { rawSql: 'select distinct bar.fizz from foo limit 1000' };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );

      expect(values).toEqual([{ text: 'foo' }]);
    });
  });

  describe('Hide Table Name In AdHoc Filters', () => {
    it('should return only column names when hideTableNameInAdhocFilters is true', async () => {
      jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => 'foo');
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.hideTableNameInAdhocFilters = true;
      const frame = arrayToDataFrame([{ name: 'foo', type: 'String', table: 'table' }]);
      jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));

      const keys = await ds.getTagKeys();
      expect(keys).toEqual([{ text: 'foo' }]);
    });

    it('should return table.column when hideTableNameInAdhocFilters is false', async () => {
      jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => 'foo');
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.hideTableNameInAdhocFilters = false;
      const frame = arrayToDataFrame([{ name: 'foo', type: 'String', table: 'table' }]);
      jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));

      const keys = await ds.getTagKeys();
      expect(keys).toEqual([{ text: 'table.foo' }]);
    });

    it('should return table.column when hideTableNameInAdhocFilters is undefined (default)', async () => {
      jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => 'foo');
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.hideTableNameInAdhocFilters = undefined;
      const frame = arrayToDataFrame([{ name: 'foo', type: 'String', table: 'table' }]);
      jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));

      const keys = await ds.getTagKeys();
      expect(keys).toEqual([{ text: 'table.foo' }]);
    });

    it('should fetch tag values with column name when hideTableNameInAdhocFilters is true', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => 'foo');
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.hideTableNameInAdhocFilters = true;
      const frame = arrayToDataFrame([{ bar: 'value1' }, { bar: 'value2' }]);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));

      const values = await ds.getTagValues({ key: 'bar' });
      expect(spyOnReplace).toHaveBeenCalled();
      const expected = { rawSql: 'select distinct bar from foo limit 1000' };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );

      expect(values).toEqual([{ text: 'value1' }, { text: 'value2' }]);
    });

    it('should fetch tag values with table.column format when hideTableNameInAdhocFilters is false', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => '$clickhouse_adhoc_query');
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.defaultDatabase = undefined;
      ds.settings.jsonData.hideTableNameInAdhocFilters = false;
      const frame = arrayToDataFrame([{ bar: 'value1' }, { bar: 'value2' }]);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));

      const values = await ds.getTagValues({ key: 'foo.bar' });
      expect(spyOnReplace).toHaveBeenCalled();
      const expected = { rawSql: 'select distinct bar from foo limit 1000' };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );

      expect(values).toEqual([{ text: 'value1' }, { text: 'value2' }]);
    });

    it('should handle nested column names with dots when hideTableNameInAdhocFilters is true', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => 'foo');
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.hideTableNameInAdhocFilters = true;
      const frame = arrayToDataFrame([{ 'nested.field': 'value1' }, { 'nested.field': 'value2' }]);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));

      const values = await ds.getTagValues({ key: 'nested.field' });
      expect(spyOnReplace).toHaveBeenCalled();
      const expected = { rawSql: 'select distinct nested.field from foo limit 1000' };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );

      expect(values).toEqual([{ text: 'value1' }, { text: 'value2' }]);
    });

    it('should handle nested column names with dots when hideTableNameInAdhocFilters is false', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => '$clickhouse_adhoc_query');
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.defaultDatabase = undefined;
      ds.settings.jsonData.hideTableNameInAdhocFilters = false;
      const frame = arrayToDataFrame([{ 'nested.field': 'value1' }, { 'nested.field': 'value2' }]);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));

      const values = await ds.getTagValues({ key: 'foo.nested.field' });
      expect(spyOnReplace).toHaveBeenCalled();
      const expected = { rawSql: 'select distinct nested.field from foo limit 1000' };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );

      expect(values).toEqual([{ text: 'value1' }, { text: 'value2' }]);
    });
  });

  describe('Map type ad-hoc filters (#1434)', () => {
    it('expands Map-typed columns into one tag key per discovered map key', async () => {
      jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => 'db.events');
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.defaultDatabase = 'db';
      ds.settings.jsonData.defaultTable = 'events';
      // system.columns → two columns, one Map-typed.
      const columnsFrame = arrayToDataFrame([
        { name: 'level', type: 'String', table: 'events' },
        { name: 'labels', type: 'Map(String, String)', table: 'events' },
      ]);
      // fetchUniqueMapKeys → distinct map keys for `labels`.
      const mapKeysFrame = arrayToDataFrame([{ keys: 'http.method' }, { keys: 'http.status' }]);
      jest.spyOn(ds, 'query').mockImplementation((request) => {
        const sql = request.targets[0].rawSql ?? '';
        if (sql.includes('arrayJoin("labels".keys)')) {
          return of({ data: [mapKeysFrame] });
        }
        return of({ data: [columnsFrame] });
      });

      const keys = await ds.getTagKeys();
      expect(keys).toEqual([
        { text: 'events.level' },
        { text: 'events.labels.http.method' },
        { text: 'events.labels.http.status' },
      ]);
    });

    it('falls back to a flat Map column entry when no table context is available', async () => {
      jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => 'db');
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.defaultDatabase = 'db';
      const columnsFrame = arrayToDataFrame([{ name: 'labels', type: 'Map(String, String)', table: 'events' }]);
      jest.spyOn(ds, 'query').mockImplementation(() => of({ data: [columnsFrame] }));

      const keys = await ds.getTagKeys();
      // No `db.table` context → we don't fan out mapKeys probes; show the
      // raw Map column entry instead of crashing or emitting `[object Object]`.
      expect(keys).toEqual([{ text: 'events.labels' }]);
    });

    it('rewrites dotted Map keys into bracket access in fetchTagValuesFromSchema', async () => {
      jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => 'db.events');
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.defaultDatabase = 'db';
      const columnsFrame = arrayToDataFrame([{ name: 'labels', type: 'Map(String, String)', table: 'events' }]);
      const mapKeysFrame = arrayToDataFrame([{ keys: 'http.method' }]);
      const valuesFrame = arrayToDataFrame([{ val: 'GET' }, { val: 'POST' }]);

      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((request) => {
        const sql = request.targets[0].rawSql ?? '';
        if (sql.includes('arrayJoin("labels".keys)')) {
          return of({ data: [mapKeysFrame] });
        }
        if (sql.includes("labels['http.method']")) {
          return of({ data: [valuesFrame] });
        }
        return of({ data: [columnsFrame] });
      });

      await ds.getTagKeys(); // populates the mapColumnsByTable cache
      const values = await ds.getTagValues({ key: 'events.labels.http.method' });
      expect(values).toEqual([{ text: 'GET' }, { text: 'POST' }]);
      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          targets: expect.arrayContaining([
            expect.objectContaining({
              rawSql: "select distinct labels['http.method'] from db.events limit 1000",
            }),
          ]),
        })
      );
    });

    it('looks up per-table Map columns using the bare table name even when source is db.table', async () => {
      // Regression: mapColumnsByTable is populated from system.columns
      // (keyed by bare table name), but fetchTagValuesFromSchema passes
      // `db.table` as the source. The lookup must normalize the prefix so
      // the per-table set is hit — without this the code falls back to a
      // flattened union, which can mis-detect Map columns when two tables
      // share a column name (one Map, one scalar).
      jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => 'db.events');
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.defaultDatabase = 'db';
      const columnsFrame = arrayToDataFrame([
        // `labels` is Map in `events` but a String in `other` — the lookup
        // must scope by table.
        { name: 'labels', type: 'Map(String, String)', table: 'events' },
        { name: 'labels', type: 'String', table: 'other' },
      ]);
      const mapKeysFrame = arrayToDataFrame([{ keys: 'region' }]);
      const valuesFrame = arrayToDataFrame([{ val: 'eu' }]);

      jest.spyOn(ds, 'query').mockImplementation((request) => {
        const sql = request.targets[0].rawSql ?? '';
        if (sql.includes('arrayJoin("labels".keys)')) {
          return of({ data: [mapKeysFrame] });
        }
        if (sql.includes("labels['region']")) {
          return of({ data: [valuesFrame] });
        }
        return of({ data: [columnsFrame] });
      });

      await ds.getTagKeys();
      const values = await ds.getTagValues({ key: 'events.labels.region' });
      expect(values).toEqual([{ text: 'eu' }]);
    });

    it('escapes single quotes in Map keys when building the values SELECT', async () => {
      // A Map key containing `'` must be escaped for ClickHouse string-
      // literal embedding (`'` → `\'`) — otherwise the SELECT is invalid
      // SQL and could allow injection via a crafted key.
      jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => 'db.events');
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.defaultDatabase = 'db';
      const columnsFrame = arrayToDataFrame([{ name: 'labels', type: 'Map(String, String)', table: 'events' }]);
      const mapKeysFrame = arrayToDataFrame([{ keys: "weird'key" }]);
      const valuesFrame = arrayToDataFrame([{ val: 'v' }]);

      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((request) => {
        const sql = request.targets[0].rawSql ?? '';
        if (sql.includes('arrayJoin("labels".keys)')) {
          return of({ data: [mapKeysFrame] });
        }
        if (sql.includes("labels['weird\\'key']")) {
          return of({ data: [valuesFrame] });
        }
        return of({ data: [columnsFrame] });
      });

      await ds.getTagKeys();
      const values = await ds.getTagValues({ key: "events.labels.weird'key" });
      expect(values).toEqual([{ text: 'v' }]);
      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          targets: expect.arrayContaining([
            expect.objectContaining({
              rawSql: "select distinct labels['weird\\'key'] from db.events limit 1000",
            }),
          ]),
        })
      );
    });

    it('publishes the Map-column set to the AdHocFilter for escapeKey rewriting', async () => {
      jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => 'db.events');
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.defaultDatabase = 'db';
      const columnsFrame = arrayToDataFrame([
        { name: 'labels', type: 'Map(String, String)', table: 'events' },
        { name: 'other_map', type: 'Nullable(Map(String, String))', table: 'events' },
      ]);
      const mapKeysFrame = arrayToDataFrame([{ keys: 'a' }]);
      jest.spyOn(ds, 'query').mockImplementation((request) => {
        const sql = request.targets[0].rawSql ?? '';
        if (sql.includes('.keys)')) {
          return of({ data: [mapKeysFrame] });
        }
        return of({ data: [columnsFrame] });
      });

      await ds.getTagKeys();
      const published = ds.adHocFilter.getMapColumns();
      expect(published.has('labels')).toBe(true);
      expect(published.has('other_map')).toBe(true);
      // OTel fallback names remain in the set for back-compat.
      expect(published.has('LogAttributes')).toBe(true);
    });
  });

  describe('fetchUniqueMapKeys probe (#1843)', () => {
    it('issues the bare LIMIT probe for free-form tables (no time column known)', async () => {
      const ds = cloneDeep(mockDatasource);
      const frame = arrayToDataFrame([{ keys: 'a' }, { keys: 'b' }]);
      const spy = jest.spyOn(ds, 'query').mockImplementation(() => of({ data: [frame] }));

      const result = await ds.fetchUniqueMapKeys('labels', 'db', 'events');
      expect(result).toEqual(['a', 'b']);
      const sql = spy.mock.calls[0][0].targets[0].rawSql!;
      expect(sql).toBe('SELECT DISTINCT arrayJoin("labels".keys) as keys FROM "db"."events" LIMIT 1000');
    });

    it('bounds the probe to the configured logs time column when target matches OTel logs table', async () => {
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.logs = {
        defaultDatabase: 'otel',
        defaultTable: 'otel_logs',
        otelEnabled: false,
        timeColumn: 'Timestamp',
      };
      const frame = arrayToDataFrame([{ keys: 'http.method' }]);
      const spy = jest.spyOn(ds, 'query').mockImplementation(() => of({ data: [frame] }));

      await ds.fetchUniqueMapKeys('LogAttributes', 'otel', 'otel_logs');
      const sql = spy.mock.calls[0][0].targets[0].rawSql!;
      expect(sql).toContain(' WHERE "Timestamp" >= now() - INTERVAL 6 HOUR');
      expect(sql).toContain('LIMIT 1000');
    });

    it('bounds the probe via the OTel canon column map when otelEnabled is true', async () => {
      // When otelEnabled flips on, getDefaultLogsColumns() returns the OTel
      // version's logColumnMap instead of the manually configured columns.
      // The probe must prefer FilterTime (TimestampTime in OTel 1.2.9) over
      // Time, since that's what the rest of the logs pipeline uses for the
      // hot path. This test would have missed the OTel path entirely if it
      // weren't covered explicitly.
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.logs = {
        defaultDatabase: 'otel',
        defaultTable: 'otel_logs',
        otelEnabled: true,
        otelVersion: '1.29.0',
      };
      const frame = arrayToDataFrame([{ keys: 'http.method' }]);
      const spy = jest.spyOn(ds, 'query').mockImplementation(() => of({ data: [frame] }));

      await ds.fetchUniqueMapKeys('LogAttributes', 'otel', 'otel_logs');
      const sql = spy.mock.calls[0][0].targets[0].rawSql!;
      expect(sql).toContain(' WHERE "TimestampTime" >= now() - INTERVAL 6 HOUR');
    });

    it('bounds the probe to the configured trace start-time column when target matches OTel traces table', async () => {
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.traces = {
        defaultDatabase: 'otel',
        defaultTable: 'otel_traces',
        otelEnabled: false,
        startTimeColumn: 'Timestamp',
      };
      const frame = arrayToDataFrame([{ keys: 'k1' }]);
      const spy = jest.spyOn(ds, 'query').mockImplementation(() => of({ data: [frame] }));

      await ds.fetchUniqueMapKeys('SpanAttributes', 'otel', 'otel_traces');
      const sql = spy.mock.calls[0][0].targets[0].rawSql!;
      expect(sql).toContain(' WHERE "Timestamp" >= now() - INTERVAL 6 HOUR');
    });

    it('omits the predicate when the target db/table does not match either OTel config', async () => {
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.logs = {
        defaultDatabase: 'otel',
        defaultTable: 'otel_logs',
        otelEnabled: false,
        timeColumn: 'Timestamp',
      };
      const frame = arrayToDataFrame([{ keys: 'k' }]);
      const spy = jest.spyOn(ds, 'query').mockImplementation(() => of({ data: [frame] }));

      await ds.fetchUniqueMapKeys('labels', 'analytics', 'events');
      const sql = spy.mock.calls[0][0].targets[0].rawSql!;
      expect(sql).not.toContain('WHERE');
    });

    it('short-circuits to empty when discovery is disabled, without issuing a query', async () => {
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.enableMapKeysDiscovery = false;
      const spy = jest.spyOn(ds, 'query');

      const result = await ds.fetchUniqueMapKeys('labels', 'db', 'events');
      expect(result).toEqual([]);
      expect(spy).not.toHaveBeenCalled();
    });

    it('skips the getTagKeys fan-out when discovery is disabled', async () => {
      jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => 'db.events');
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.defaultDatabase = 'db';
      ds.settings.jsonData.defaultTable = 'events';
      ds.settings.jsonData.enableMapKeysDiscovery = false;
      const columnsFrame = arrayToDataFrame([{ name: 'labels', type: 'Map(String, String)', table: 'events' }]);
      const spy = jest.spyOn(ds, 'query').mockImplementation(() => of({ data: [columnsFrame] }));

      const keys = await ds.getTagKeys();
      // No expansion, no fan-out — flat entry only.
      expect(keys).toEqual([{ text: 'events.labels' }]);
      // system.columns lookup is the single query — no per-column map-key probes.
      const probeCalls = spy.mock.calls.filter((c) => (c[0].targets[0].rawSql ?? '').includes('arrayJoin'));
      expect(probeCalls).toHaveLength(0);
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

  describe.skip('fetchPathsForJSONColumns', () => {
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

  describe('filterQuery', () => {
    it('returns true when hide is not set', () => {
      expect(mockDatasource.filterQuery({ refId: '1' } as CHQuery)).toBe(true);
    });

    it('returns true when hide is false', () => {
      expect(mockDatasource.filterQuery({ refId: '1', hide: false } as CHQuery)).toBe(true);
    });

    it('returns false when hide is true', () => {
      expect(mockDatasource.filterQuery({ refId: '1', hide: true } as CHQuery)).toBe(false);
    });
  });

  describe('query', () => {
    it('attaches timezone metadata to targets', async () => {
      const instance = cloneDeep(mockDatasource);
      const spy = jest
        .spyOn(DataSourceWithBackend.prototype, 'query')
        .mockImplementation((_request) => of({ data: [toDataFrame([])] }));
      instance.query({
        targets: [{ refId: '1' }, { refId: '2', hide: false }] as DataQuery[],
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

    describe('getSupportedSupplementaryQueryTypes', () => {
      it('should return LogsVolume and LogsSample for empty dsRequest', async () => {
        const dsRequest = { targets: [{ editorType: EditorType.Builder }] } as DataQueryRequest<CHQuery>;
        const result = datasource.getSupportedSupplementaryQueryTypes(dsRequest);
        expect(result).toEqual([SupplementaryQueryType.LogsVolume, SupplementaryQueryType.LogsSample]);
      });

      it('should return LogsVolume and LogsSample when all targets use Builder editor', async () => {
        const dsRequest: DataQueryRequest<CHQuery> = {
          ...request,
          targets: [
            {
              ...query,
              editorType: EditorType.Builder,
            },
          ],
        };
        const result = datasource.getSupportedSupplementaryQueryTypes(dsRequest);
        expect(result).toEqual([SupplementaryQueryType.LogsVolume, SupplementaryQueryType.LogsSample]);
      });

      it('should return empty array when any target uses SQL editor', async () => {
        const dsRequest: DataQueryRequest<CHQuery> = {
          ...request,
          targets: [
            {
              ...query,
              editorType: EditorType.SQL,
              queryType: query.builderOptions.queryType,
            },
          ],
        };
        const result = datasource.getSupportedSupplementaryQueryTypes(dsRequest);
        expect(result).toEqual([]);
      });
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

    describe('getSupplementaryLogsSampleQuery', () => {
      beforeEach(() => {
        jest.spyOn(datasource, 'getDefaultLogsTable').mockReturnValue('logs');
        jest.spyOn(datasource, 'getDefaultLogsColumns').mockReturnValue(
          new Map<ColumnHint, string>([
            [ColumnHint.Time, 'created_at'],
            [ColumnHint.LogLevel, 'level'],
          ])
        );
      });

      it('should return undefined if editorType is not Builder', () => {
        expect(
          datasource.getSupplementaryLogsSampleQuery({
            ...query,
            editorType: EditorType.SQL,
            queryType: undefined,
          } as any)
        ).toBeUndefined();
      });

      it('should return undefined if database is empty', () => {
        expect(
          datasource.getSupplementaryLogsSampleQuery({
            ...query,
            builderOptions: { ...query.builderOptions, database: '' },
          })
        ).toBeUndefined();
      });

      it('should return undefined if table does not match default logs table', () => {
        expect(
          datasource.getSupplementaryLogsSampleQuery({
            ...query,
            builderOptions: { ...query.builderOptions, table: 'other_table' },
          })
        ).toBeUndefined();
      });

      it('should return undefined if no time column is found', () => {
        expect(
          datasource.getSupplementaryLogsSampleQuery({
            ...query,
            builderOptions: { ...query.builderOptions, columns: [] },
          })
        ).toBeUndefined();
      });

      it('should return a Logs/List query with format 2, limit 100, ordered DESC by time', () => {
        const result = datasource.getSupplementaryLogsSampleQuery(query);
        expect(result).toBeDefined();
        expect(result?.format).toBe(2);
        expect(result?.editorType).toBe(EditorType.Builder);
        const bo = (result as CHBuilderQuery).builderOptions;
        expect(bo.queryType).toBe(QueryType.Logs);
        expect(bo.mode).toBe(BuilderMode.List);
        expect(bo.limit).toBe(100);
        expect(bo.database).toBe(query.builderOptions.database);
        expect(bo.table).toBe(query.builderOptions.table);
        // columns come from getDefaultLogsColumns()
        expect(bo.columns).toEqual([
          { hint: ColumnHint.Time, name: 'created_at' },
          { hint: ColumnHint.LogLevel, name: 'level' },
        ]);
        expect(bo.orderBy).toEqual([{ name: '', hint: ColumnHint.Time, dir: OrderByDirection.DESC }]);
      });

      it('should copy and resolve hint-based filters from the original query', () => {
        const hintedQuery: CHBuilderQuery = {
          ...query,
          builderOptions: {
            ...query.builderOptions,
            filters: [
              {
                hint: ColumnHint.LogLevel,
                key: '',
                operator: FilterOperator.Equals,
                value: 'error',
                type: 'string',
                filterType: 'custom',
                condition: 'AND',
              },
            ],
          },
        };
        const result = datasource.getSupplementaryLogsSampleQuery(hintedQuery) as CHBuilderQuery;
        expect(result).toBeDefined();
        // hint-based filter key should be resolved to the actual column name
        expect(result.builderOptions.filters![0].key).toBe('level');
      });

      it('should work for any Builder query type, not just Logs', () => {
        const timeSeriesQuery: CHBuilderQuery = {
          ...query,
          builderOptions: {
            ...query.builderOptions,
            queryType: QueryType.TimeSeries,
          },
        };
        const result = datasource.getSupplementaryLogsSampleQuery(timeSeriesQuery);
        expect(result).toBeDefined();
        expect((result as CHBuilderQuery).builderOptions.queryType).toBe(QueryType.Logs);
      });
    });

    describe('getSupplementaryRequest', () => {
      it('should return undefined for LogsSample if no targets produce a supplementary query', () => {
        jest.spyOn(Datasource.prototype, 'getSupplementaryLogsSampleQuery').mockReturnValue(undefined);
        expect(
          datasource.getSupplementaryRequest(SupplementaryQueryType.LogsSample, {
            targets: [{ refId: 'A', editorType: EditorType.Builder }],
          } as any)
        ).toBeUndefined();
      });

      it('should return a modified request with logs-sample targets', () => {
        const supplementaryQuery = { rawSql: 'SELECT * FROM logs', refId: '', format: 2 } as CHSqlQuery;
        jest.spyOn(Datasource.prototype, 'getSupplementaryLogsSampleQuery').mockReturnValue(supplementaryQuery);
        const result = datasource.getSupplementaryRequest(SupplementaryQueryType.LogsSample, {
          targets: [{ refId: 'A', editorType: EditorType.Builder }],
        } as any);
        expect(result).toMatchObject({
          hideFromInspector: true,
          targets: [{ ...supplementaryQuery, refId: 'logs-sample-A' }],
        });
      });

      it('should return undefined if there are no supplementary queries for targets', async () => {
        jest.spyOn(Datasource.prototype, 'getSupplementaryLogsVolumeQuery').mockReturnValue(undefined);
        jest.spyOn(logs, 'getIntervalInfo').mockReturnValue({ interval: '1d' });
        expect(
          datasource.getSupplementaryRequest(SupplementaryQueryType.LogsVolume, {
            scopedVars: {
              __interval: {},
            },
            targets: ['foo', 'bar'],
          } as any)
        ).toBeUndefined();
      });

      it('should return a modified request with log-volume targets', async () => {
        const range = ['from', 'to'];
        const supplementaryQuery = {
          rawSql: 'supplementaryQuery',
          refId: '',
        } as CHSqlQuery;
        jest.spyOn(Datasource.prototype, 'getSupplementaryLogsVolumeQuery').mockReturnValue(supplementaryQuery);
        jest.spyOn(logs, 'getIntervalInfo').mockReturnValue({ interval: '1d' });
        const result = datasource.getSupplementaryRequest(SupplementaryQueryType.LogsVolume, {
          scopedVars: {
            __interval: {},
          },
          targets: [{ refId: 'A', editorType: EditorType.Builder }],
          range,
        } as any);
        expect(result).toMatchObject({
          hideFromInspector: true,
          interval: '1d',
          scopedVars: {
            __interval: { text: '1d', value: '1d' },
          },
          targets: [{ ...supplementaryQuery, refId: 'log-volume-A' }],
          range,
        });
      });
    });
  });

  describe('modifyQuery', () => {
    const query: CHBuilderQuery = {
      pluginVersion: '',
      refId: 'A',
      editorType: EditorType.Builder,
      rawSql: '',
      builderOptions: {
        database: 'default',
        table: 'logs',
        queryType: QueryType.Logs,
        mode: BuilderMode.List,
        columns: [{ name: 'LogAttributes', hint: ColumnHint.LogAttributes, type: 'Map(String, String)' }],
      },
    };

    let datasource: Datasource;
    beforeEach(() => {
      datasource = cloneDeep(mockDatasource);
    });

    it('should correctly find merged value in log labels field', () => {
      const frame = {
        fields: [{ name: 'labels', values: { get: () => ({ ['LogAttributes.service_name']: 'value' }), length: 1 } }],
      } as any;

      const result = datasource.modifyQuery(query, {
        type: 'ADD_FILTER',
        options: { key: 'LogAttributes.service_name', value: 'value' },
        frame,
      } as any);

      expect((result as CHBuilderQuery).builderOptions.filters![0].mapKey).toBe('service_name');
    });

    describe('ADD_FILTER', () => {
      it('adds an Equals filter for the given field', () => {
        const result = datasource.modifyQuery(query, {
          type: 'ADD_FILTER',
          options: { key: 'level', value: 'info' },
        } as any) as CHBuilderQuery;

        expect(result.builderOptions.filters).toHaveLength(1);
        expect(result.builderOptions.filters![0]).toMatchObject({
          key: 'level',
          operator: FilterOperator.Equals,
          value: 'info',
        });
      });

      it('replaces an existing Equals filter for the same field', () => {
        const queryWithFilter: CHBuilderQuery = {
          ...query,
          builderOptions: {
            ...query.builderOptions,
            filters: [
              {
                condition: 'AND',
                key: 'level',
                type: 'string',
                filterType: 'custom',
                operator: FilterOperator.Equals,
                value: 'debug',
              },
            ],
          },
        };

        const result = datasource.modifyQuery(queryWithFilter, {
          type: 'ADD_FILTER',
          options: { key: 'level', value: 'info' },
        } as any) as CHBuilderQuery;

        expect(result.builderOptions.filters).toHaveLength(1);
        // @ts-expect-error not expecting `NullFilter`
        expect(result.builderOptions.filters![0].value).toBe('info');
      });

      it('returns query unchanged when key is missing', () => {
        const result = datasource.modifyQuery(query, {
          type: 'ADD_FILTER',
          options: { value: 'info' },
        } as any);

        expect(result).toBe(query);
      });
    });

    describe('ADD_FILTER_OUT', () => {
      it('adds a NotEquals filter for the given field', () => {
        const result = datasource.modifyQuery(query, {
          type: 'ADD_FILTER_OUT',
          options: { key: 'level', value: 'error' },
        } as any) as CHBuilderQuery;

        expect(result.builderOptions.filters).toHaveLength(1);
        expect(result.builderOptions.filters![0]).toMatchObject({
          key: 'level',
          operator: FilterOperator.NotEquals,
          value: 'error',
        });
      });

      it('removes an existing Equals filter for the same field', () => {
        const queryWithFilter: CHBuilderQuery = {
          ...query,
          builderOptions: {
            ...query.builderOptions,
            filters: [
              {
                condition: 'AND',
                key: 'level',
                type: 'string',
                filterType: 'custom',
                operator: FilterOperator.Equals,
                value: 'info',
              },
            ],
          },
        };

        const result = datasource.modifyQuery(queryWithFilter, {
          type: 'ADD_FILTER_OUT',
          options: { key: 'level', value: 'error' },
        } as any) as CHBuilderQuery;

        expect(result.builderOptions.filters).toHaveLength(1);
        expect(result.builderOptions.filters![0].operator).toBe(FilterOperator.NotEquals);
      });

      it('returns query unchanged when key is missing', () => {
        const result = datasource.modifyQuery(query, {
          type: 'ADD_FILTER_OUT',
          options: { value: 'error' },
        } as any);

        expect(result).toBe(query);
      });

      it('accumulates multiple NotEquals filters for different values', () => {
        const queryWithFilter: CHBuilderQuery = {
          ...query,
          builderOptions: {
            ...query.builderOptions,
            filters: [
              {
                condition: 'AND',
                key: 'level',
                type: 'string',
                filterType: 'custom',
                operator: FilterOperator.NotEquals,
                value: 'info',
              },
            ],
          },
        };

        const result = datasource.modifyQuery(queryWithFilter, {
          type: 'ADD_FILTER_OUT',
          options: { key: 'level', value: 'error' },
        } as any) as CHBuilderQuery;

        expect(result.builderOptions.filters).toHaveLength(2);
        expect(result.builderOptions.filters!.map((f) => ('value' in f ? f.value : null))).toEqual(
          expect.arrayContaining(['info', 'error'])
        );
      });

      it('replaces a NotEquals filter with the exact same value', () => {
        const queryWithFilter: CHBuilderQuery = {
          ...query,
          builderOptions: {
            ...query.builderOptions,
            filters: [
              {
                condition: 'AND',
                key: 'level',
                type: 'string',
                filterType: 'custom',
                operator: FilterOperator.NotEquals,
                value: 'error',
              },
            ],
          },
        };

        const result = datasource.modifyQuery(queryWithFilter, {
          type: 'ADD_FILTER_OUT',
          options: { key: 'level', value: 'error' },
        } as any) as CHBuilderQuery;

        expect(result.builderOptions.filters).toHaveLength(1);
        expect(result.builderOptions.filters![0].operator).toBe(FilterOperator.NotEquals);
        // @ts-expect-error not expecting `NullFilter`
        expect(result.builderOptions.filters![0].value).toBe('error');
      });
    });

    describe('ADD_STRING_FILTER', () => {
      it('adds an ILike filter using the provided key', () => {
        const result = datasource.modifyQuery(query, {
          type: 'ADD_STRING_FILTER',
          options: { key: 'Body', value: 'error' },
        } as any) as CHBuilderQuery;

        expect(result.builderOptions.filters).toHaveLength(1);
        expect(result.builderOptions.filters![0]).toMatchObject({
          key: 'Body',
          operator: FilterOperator.ILike,
          value: 'error',
        });
      });

      it('resolves column from LogMessage hint when key is absent', () => {
        const queryWithLogMessage: CHBuilderQuery = {
          ...query,
          builderOptions: {
            ...query.builderOptions,
            columns: [{ name: 'Body', hint: ColumnHint.LogMessage }],
          },
        };

        const result = datasource.modifyQuery(queryWithLogMessage, {
          type: 'ADD_STRING_FILTER',
          options: { value: 'error' },
        } as any) as CHBuilderQuery;

        expect(result.builderOptions.filters).toHaveLength(1);
        expect(result.builderOptions.filters![0]).toMatchObject({
          key: 'Body',
          operator: FilterOperator.ILike,
          value: 'error',
        });
      });

      it('returns query unchanged when key is absent and no LogMessage column is configured', () => {
        const result = datasource.modifyQuery(query, {
          type: 'ADD_STRING_FILTER',
          options: { value: 'error' },
        } as any);

        expect(result).toBe(query);
      });
    });

    describe('ADD_STRING_FILTER_OUT', () => {
      it('adds a NotILike filter using the provided key', () => {
        const result = datasource.modifyQuery(query, {
          type: 'ADD_STRING_FILTER_OUT',
          options: { key: 'Body', value: 'error' },
        } as any) as CHBuilderQuery;

        expect(result.builderOptions.filters).toHaveLength(1);
        expect(result.builderOptions.filters![0]).toMatchObject({
          key: 'Body',
          operator: FilterOperator.NotILike,
          value: 'error',
        });
      });

      it('resolves column from LogMessage hint when key is absent', () => {
        const queryWithLogMessage: CHBuilderQuery = {
          ...query,
          builderOptions: {
            ...query.builderOptions,
            columns: [{ name: 'Body', hint: ColumnHint.LogMessage }],
          },
        };

        const result = datasource.modifyQuery(queryWithLogMessage, {
          type: 'ADD_STRING_FILTER_OUT',
          options: { value: 'error' },
        } as any) as CHBuilderQuery;

        expect(result.builderOptions.filters).toHaveLength(1);
        expect(result.builderOptions.filters![0]).toMatchObject({
          key: 'Body',
          operator: FilterOperator.NotILike,
          value: 'error',
        });
      });

      it('returns query unchanged when key is absent and no LogMessage column is configured', () => {
        const result = datasource.modifyQuery(query, {
          type: 'ADD_STRING_FILTER_OUT',
          options: { value: 'error' },
        } as any);

        expect(result).toBe(query);
      });
    });

    describe('hint-matched columns via logAliasToColumnHints', () => {
      it('ADD_FILTER uses hint and empty key when column is resolved via log alias', () => {
        const queryWithLevel: CHBuilderQuery = {
          ...query,
          builderOptions: {
            ...query.builderOptions,
            columns: [{ name: 'SeverityText', hint: ColumnHint.LogLevel, type: 'string' }],
          },
        };

        const result = datasource.modifyQuery(queryWithLevel, {
          type: 'ADD_FILTER',
          options: { key: 'level', value: 'info' },
        } as any) as CHBuilderQuery;

        expect(result.builderOptions.filters).toHaveLength(1);
        expect(result.builderOptions.filters![0]).toMatchObject({
          key: '',
          hint: ColumnHint.LogLevel,
          operator: FilterOperator.Equals,
          value: 'info',
        });
      });

      it('ADD_FILTER replaces existing hint-matched filter', () => {
        const queryWithLevel: CHBuilderQuery = {
          ...query,
          builderOptions: {
            ...query.builderOptions,
            columns: [{ name: 'SeverityText', hint: ColumnHint.LogLevel, type: 'string' }],
            filters: [
              {
                condition: 'AND',
                key: '',
                hint: ColumnHint.LogLevel,
                type: 'string',
                filterType: 'custom',
                operator: FilterOperator.Equals,
                value: 'debug',
              },
            ],
          },
        };

        const result = datasource.modifyQuery(queryWithLevel, {
          type: 'ADD_FILTER',
          options: { key: 'level', value: 'info' },
        } as any) as CHBuilderQuery;

        expect(result.builderOptions.filters).toHaveLength(1);
        // @ts-expect-error not expecting `NullFilter`
        expect(result.builderOptions.filters![0].value).toBe('info');
      });
    });

    describe('OTel map key splitting', () => {
      it('splits ResourceAttributes key into column + mapKey', () => {
        const queryWithResource: CHBuilderQuery = {
          ...query,
          builderOptions: {
            ...query.builderOptions,
            columns: [{ name: 'ResourceAttributes', type: 'Map(String, String)' }],
          },
        };

        const result = datasource.modifyQuery(queryWithResource, {
          type: 'ADD_FILTER',
          options: { key: 'ResourceAttributes.service.name', value: 'my-service' },
        } as any) as CHBuilderQuery;

        expect(result.builderOptions.filters![0]).toMatchObject({
          mapKey: 'service.name',
          type: 'Map(String, String)',
          operator: FilterOperator.Equals,
          value: 'my-service',
        });
      });

      it('splits ScopeAttributes key into column + mapKey', () => {
        const queryWithScope: CHBuilderQuery = {
          ...query,
          builderOptions: {
            ...query.builderOptions,
            columns: [{ name: 'ScopeAttributes', type: 'Map(String, String)' }],
          },
        };

        const result = datasource.modifyQuery(queryWithScope, {
          type: 'ADD_FILTER',
          options: { key: 'ScopeAttributes.version', value: '1.0' },
        } as any) as CHBuilderQuery;

        expect(result.builderOptions.filters![0]).toMatchObject({
          mapKey: 'version',
          type: 'Map(String, String)',
          operator: FilterOperator.Equals,
          value: '1.0',
        });
      });

      it('sets type to JSON for JSON-typed map column', () => {
        const queryWithJson: CHBuilderQuery = {
          ...query,
          builderOptions: {
            ...query.builderOptions,
            columns: [{ name: 'LogAttributes', type: 'JSON' }],
          },
        };

        const result = datasource.modifyQuery(queryWithJson, {
          type: 'ADD_FILTER',
          options: { key: 'LogAttributes.request_id', value: 'abc123' },
        } as any) as CHBuilderQuery;

        expect(result.builderOptions.filters![0]).toMatchObject({
          mapKey: 'request_id',
          type: 'JSON',
          operator: FilterOperator.Equals,
          value: 'abc123',
        });
      });
    });

    describe('ADD_STRING_FILTER with LogMessage column alias', () => {
      it('resolves LogMessage column by alias when name differs', () => {
        const queryWithAlias: CHBuilderQuery = {
          ...query,
          builderOptions: {
            ...query.builderOptions,
            columns: [{ name: 'log_body', alias: 'Body', hint: ColumnHint.LogMessage }],
          },
        };

        const result = datasource.modifyQuery(queryWithAlias, {
          type: 'ADD_STRING_FILTER',
          options: { value: 'error' },
        } as any) as CHBuilderQuery;

        expect(result.builderOptions.filters).toHaveLength(1);
        expect(result.builderOptions.filters![0]).toMatchObject({
          key: 'Body',
          operator: FilterOperator.ILike,
          value: 'error',
        });
      });
    });

    it('returns query unchanged for non-Builder editorType', () => {
      const sqlQuery: CHSqlQuery = { pluginVersion: '', refId: 'A', editorType: EditorType.SQL, rawSql: 'SELECT 1' };
      const result = datasource.modifyQuery(sqlQuery, {
        type: 'ADD_FILTER',
        options: { key: 'level', value: 'info' },
      } as any);
      expect(result).toBe(sqlQuery);
    });

    it('returns query unchanged when value is missing', () => {
      const result = datasource.modifyQuery(query, { type: 'ADD_FILTER', options: { key: 'level' } } as any);
      expect(result).toBe(query);
    });
  });

  describe('LogsLabelTypesSupport', () => {
    let datasource: Datasource;
    beforeEach(() => {
      datasource = cloneDeep(mockDatasource);
    });

    describe('getLabelDisplayTypeFromFrame', () => {
      it('returns "Resource attributes" for a ResourceAttributes-prefixed key', () => {
        expect(datasource.getLabelDisplayTypeFromFrame('ResourceAttributes.service.name', undefined, null)).toBe(
          'Resource attributes'
        );
      });

      it('returns "Scope attributes" for a ScopeAttributes-prefixed key', () => {
        expect(datasource.getLabelDisplayTypeFromFrame('ScopeAttributes.otelcol.name', undefined, null)).toBe(
          'Scope attributes'
        );
      });

      it('returns "Log attributes" for a LogAttributes-prefixed key', () => {
        expect(datasource.getLabelDisplayTypeFromFrame('LogAttributes.http.status_code', undefined, null)).toBe(
          'Log attributes'
        );
      });

      it('returns null for the Body core column', () => {
        expect(datasource.getLabelDisplayTypeFromFrame('Body', undefined, null)).toBeNull();
      });

      it('returns null for the TraceId core column', () => {
        expect(datasource.getLabelDisplayTypeFromFrame('TraceId', undefined, null)).toBeNull();
      });

      it('returns null for the bare "ResourceAttributes" without a dot', () => {
        // The backend's flatten always emits at least one nested key, so the
        // bare column name never reaches Grafana's label list. Guard against
        // mis-grouping if a custom schema ever surfaces it.
        expect(datasource.getLabelDisplayTypeFromFrame('ResourceAttributes', undefined, null)).toBeNull();
      });

      it('returns null for an arbitrary user-defined column', () => {
        expect(datasource.getLabelDisplayTypeFromFrame('service_name', undefined, null)).toBeNull();
      });
    });

    describe('round-trip with modifyQuery', () => {
      // Each grouped key, when fed back through modifyQuery, must split the
      // prefix into a Map column + mapKey so the Filter for value action
      // hits the right Map(String, String) column. This keeps the Log Details
      // grouping and the filter routing aligned.
      const cases = [
        { prefix: 'ResourceAttributes', mapKey: 'service.name', value: 'my-service' },
        { prefix: 'ScopeAttributes', mapKey: 'version', value: '1.0' },
        { prefix: 'LogAttributes', mapKey: 'http.status_code', value: '200' },
      ];

      cases.forEach(({ prefix, mapKey, value }) => {
        it(`${prefix}: classifies the key and routes the filter to the Map column`, () => {
          const labelKey = `${prefix}.${mapKey}`;

          // 1. The grouping classifies it into a non-null section.
          expect(datasource.getLabelDisplayTypeFromFrame(labelKey, undefined, null)).not.toBeNull();

          // 2. modifyQuery splits the same prefix back into column + mapKey.
          const queryForPrefix: CHBuilderQuery = {
            pluginVersion: '',
            refId: 'A',
            editorType: EditorType.Builder,
            rawSql: '',
            builderOptions: {
              database: 'default',
              table: 'logs',
              queryType: QueryType.Logs,
              mode: BuilderMode.List,
              columns: [{ name: prefix, type: 'Map(String, String)' }],
            },
          };

          const result = datasource.modifyQuery(queryForPrefix, {
            type: 'ADD_FILTER',
            options: { key: labelKey, value },
          } as any) as CHBuilderQuery;

          expect(result.builderOptions.filters![0]).toMatchObject({
            mapKey,
            type: 'Map(String, String)',
            operator: FilterOperator.Equals,
            value,
          });
        });
      });
    });
  });

  describe('getLogRowContext', () => {
    const baseBuilderOptions: QueryBuilderOptions = {
      database: 'default',
      table: 'logs',
      queryType: QueryType.Logs,
      mode: BuilderMode.List,
      columns: [
        { name: 'timestamp', type: 'DateTime64(9)', hint: ColumnHint.Time },
        { name: 'body', type: 'String', hint: ColumnHint.LogMessage },
      ],
      filters: [],
      orderBy: [
        { name: 'timestamp', hint: ColumnHint.Time, dir: OrderByDirection.DESC },
        { name: 'offset', dir: OrderByDirection.ASC },
      ],
    };

    const baseQuery: CHBuilderQuery = {
      pluginVersion: '',
      refId: 'A',
      editorType: EditorType.Builder,
      rawSql: '',
      builderOptions: baseBuilderOptions,
    };

    const makeRow = () => {
      const frame = toDataFrame({ fields: [{ name: 'timestamp', values: [1700000000000] }] });
      return {
        entryFieldIndex: 0,
        rowIndex: 0,
        dataFrame: frame,
        timeEpochNs: '1700000000000000000',
        entry: '',
        hasAnsi: false,
        hasUnescapedContent: false,
        labels: {},
        logLevel: 'info',
        raw: '',
        timeFromNow: '',
        timeEpochMs: 1700000000000,
        timeLocal: '',
        timeUtc: '',
        uid: '',
      } as any;
    };

    const contextOptions = {
      direction: 'BACKWARD' as any,
      limit: 10,
    };

    it('preserves secondary ORDER BY entries (e.g. `offset ASC`) as tiebreakers', async () => {
      const ds = cloneDeep(mockDatasource);
      // Force a single context column so we don't hit the "no columns" guard.
      jest.spyOn(ds, 'getLogContextColumnsFromLogRow').mockReturnValue([{ name: 'service', value: 'web' }]);
      const querySpy = jest.spyOn(ds, 'query').mockImplementation((_req) => of({ data: [toDataFrame([])] }));

      const query = cloneDeep(baseQuery);
      await ds.getLogRowContext(makeRow(), contextOptions, query);

      expect(querySpy).toHaveBeenCalledTimes(1);
      const request = querySpy.mock.calls[0][0] as DataQueryRequest<CHQuery>;
      const sent = request.targets[0] as CHBuilderQuery;
      const orderBy = sent.builderOptions.orderBy ?? [];

      // Primary entry is the time column (inserted by getLogRowContext).
      expect(orderBy[0]).toMatchObject({ hint: ColumnHint.Time });
      // User's secondary entry survives as a tiebreaker.
      expect(orderBy).toContainEqual(expect.objectContaining({ name: 'offset', dir: OrderByDirection.ASC }));
      // Original time-column entry is not duplicated.
      const timeEntries = orderBy.filter((e) => e.hint === ColumnHint.Time || e.name === 'timestamp');
      expect(timeEntries).toHaveLength(1);
    });

    it('surfaces the underlying ClickHouse error text instead of swallowing it', async () => {
      const ds = cloneDeep(mockDatasource);
      jest.spyOn(ds, 'getLogContextColumnsFromLogRow').mockReturnValue([{ name: 'service', value: 'web' }]);
      jest.spyOn(ds, 'query').mockImplementation((_req) => {
        // Observable that errors with a ClickHouse-shaped error payload.
        return new (require('rxjs').Observable)((subscriber: any) => {
          subscriber.error({ data: { message: 'Code: 47. DB::Exception: Unknown identifier: offset' } });
        });
      });

      await expect(ds.getLogRowContext(makeRow(), contextOptions, cloneDeep(baseQuery))).rejects.toThrow(
        /Unknown identifier: offset/
      );
    });

    it('surfaces errors reported on DataQueryResponse.errors[]', async () => {
      const ds = cloneDeep(mockDatasource);
      jest.spyOn(ds, 'getLogContextColumnsFromLogRow').mockReturnValue([{ name: 'service', value: 'web' }]);
      jest.spyOn(ds, 'query').mockImplementation((_req) =>
        of({
          data: [],
          errors: [{ message: 'Code: 62. DB::Exception: Syntax error' } as any],
        })
      );

      await expect(ds.getLogRowContext(makeRow(), contextOptions, cloneDeep(baseQuery))).rejects.toThrow(
        /Syntax error/
      );
    });
  });

  describe('hasTraceTimestampTable', () => {
    it('resolves false when database or table is empty', async () => {
      const ds = cloneDeep(mockDatasource);
      await expect(ds.hasTraceTimestampTable('', 'otel_traces')).resolves.toBe(false);
      await expect(ds.hasTraceTimestampTable('otel', '')).resolves.toBe(false);
    });

    it('resolves true when the companion table exists', async () => {
      const ds = cloneDeep(mockDatasource);
      jest.spyOn(ds, 'fetchTables').mockResolvedValue(['otel_traces', 'otel_traces_trace_id_ts']);

      await expect(ds.hasTraceTimestampTable('otel', 'otel_traces')).resolves.toBe(true);
    });

    it('resolves false when the companion table does not exist (#1842)', async () => {
      const ds = cloneDeep(mockDatasource);
      jest.spyOn(ds, 'fetchTables').mockResolvedValue(['otel_traces']);

      await expect(ds.hasTraceTimestampTable('otel', 'otel_traces')).resolves.toBe(false);
    });

    it('does not call fetchTables again once a result is cached', async () => {
      const ds = cloneDeep(mockDatasource);
      const fetchSpy = jest.spyOn(ds, 'fetchTables').mockResolvedValue(['otel_traces']);

      await ds.hasTraceTimestampTable('otel', 'otel_traces');
      await ds.hasTraceTimestampTable('otel', 'otel_traces');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('dedupes concurrent calls to a single fetchTables', async () => {
      const ds = cloneDeep(mockDatasource);
      const fetchSpy = jest.spyOn(ds, 'fetchTables').mockResolvedValue(['otel_traces', 'otel_traces_trace_id_ts']);

      const [a, b] = await Promise.all([
        ds.hasTraceTimestampTable('otel', 'otel_traces'),
        ds.hasTraceTimestampTable('otel', 'otel_traces'),
      ]);

      expect(a).toBe(true);
      expect(b).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('resolves false on fetch failure and evicts the cache so the next call retries', async () => {
      const ds = cloneDeep(mockDatasource);
      const fetchSpy = jest
        .spyOn(ds, 'fetchTables')
        .mockRejectedValueOnce(new Error('connection refused'))
        .mockResolvedValueOnce(['otel_traces', 'otel_traces_trace_id_ts']);

      await expect(ds.hasTraceTimestampTable('otel', 'otel_traces')).resolves.toBe(false);
      await expect(ds.hasTraceTimestampTable('otel', 'otel_traces')).resolves.toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('re-checks once the TTL expires', async () => {
      const ds = cloneDeep(mockDatasource);
      const fetchSpy = jest.spyOn(ds, 'fetchTables').mockResolvedValue(['otel_traces']);
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(0);

      await ds.hasTraceTimestampTable('otel', 'otel_traces');
      await ds.hasTraceTimestampTable('otel', 'otel_traces');
      expect(fetchSpy).toHaveBeenCalledTimes(1); // cached within TTL

      nowSpy.mockReturnValue(30 * 1000 + 1); // advance past the 30s TTL
      await ds.hasTraceTimestampTable('otel', 'otel_traces');
      expect(fetchSpy).toHaveBeenCalledTimes(2); // re-fetched after expiry

      nowSpy.mockRestore();
    });

    it('honours a configured custom suffix', async () => {
      const ds = cloneDeep(mockDatasource);
      ds.settings = {
        ...ds.settings,
        jsonData: {
          ...ds.settings.jsonData,
          traces: { ...(ds.settings.jsonData.traces || {}), traceTimestampTableSuffix: '_idx_ts' },
        },
      };
      jest.spyOn(ds, 'fetchTables').mockResolvedValue(['traces', 'traces_idx_ts']);

      await expect(ds.hasTraceTimestampTable('default', 'traces')).resolves.toBe(true);
    });
  });

  describe('peekTraceTimestampTable', () => {
    it('returns undefined when database or table is empty', () => {
      const ds = cloneDeep(mockDatasource);
      expect(ds.peekTraceTimestampTable('', 'otel_traces')).toBeUndefined();
      expect(ds.peekTraceTimestampTable('otel', '')).toBeUndefined();
    });

    it('returns undefined when nothing is cached', () => {
      const ds = cloneDeep(mockDatasource);
      expect(ds.peekTraceTimestampTable('otel', 'otel_traces')).toBeUndefined();
    });

    it('returns undefined while the check is still pending', () => {
      const ds = cloneDeep(mockDatasource);
      jest.spyOn(ds, 'fetchTables').mockResolvedValue(['otel_traces', 'otel_traces_trace_id_ts']);

      // Kick off the async check but do not await it — the promise has not settled yet.
      void ds.hasTraceTimestampTable('otel', 'otel_traces');
      expect(ds.peekTraceTimestampTable('otel', 'otel_traces')).toBeUndefined();
    });

    it('returns true once the check resolves true', async () => {
      const ds = cloneDeep(mockDatasource);
      jest.spyOn(ds, 'fetchTables').mockResolvedValue(['otel_traces', 'otel_traces_trace_id_ts']);

      await ds.hasTraceTimestampTable('otel', 'otel_traces');
      expect(ds.peekTraceTimestampTable('otel', 'otel_traces')).toBe(true);
    });

    it('returns false once the check resolves false', async () => {
      const ds = cloneDeep(mockDatasource);
      jest.spyOn(ds, 'fetchTables').mockResolvedValue(['otel_traces']);

      await ds.hasTraceTimestampTable('otel', 'otel_traces');
      expect(ds.peekTraceTimestampTable('otel', 'otel_traces')).toBe(false);
    });

    it('returns undefined once the TTL has expired', async () => {
      const ds = cloneDeep(mockDatasource);
      jest.spyOn(ds, 'fetchTables').mockResolvedValue(['otel_traces', 'otel_traces_trace_id_ts']);
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(0);

      await ds.hasTraceTimestampTable('otel', 'otel_traces');
      expect(ds.peekTraceTimestampTable('otel', 'otel_traces')).toBe(true);

      nowSpy.mockReturnValue(30 * 1000 + 1); // advance past the 30s TTL
      expect(ds.peekTraceTimestampTable('otel', 'otel_traces')).toBeUndefined();

      nowSpy.mockRestore();
    });
  });

  describe('queryHasFilter', () => {
    const query: CHBuilderQuery = {
      pluginVersion: '',
      refId: 'A',
      editorType: EditorType.Builder,
      rawSql: '',
      builderOptions: {
        database: 'default',
        table: 'logs',
        queryType: QueryType.Logs,
        mode: BuilderMode.List,
        columns: [{ name: 'LogAttributes', hint: ColumnHint.LogAttributes, type: 'Map(String, String)' }],
      },
    };

    let datasource: Datasource;
    beforeEach(() => {
      datasource = cloneDeep(mockDatasource);
    });

    it('returns false for SQL mode queries', () => {
      const sqlQuery: CHSqlQuery = { pluginVersion: '', refId: 'A', editorType: EditorType.SQL, rawSql: 'SELECT 1' };
      expect(datasource.queryHasFilter(sqlQuery, { key: 'level', value: 'info' })).toBe(false);
    });

    it('returns false when no filters exist', () => {
      expect(datasource.queryHasFilter(query, { key: 'level', value: 'info' })).toBe(false);
    });

    it('returns true when an Equals filter matches key and value', () => {
      const queryWithFilter: CHBuilderQuery = {
        ...query,
        builderOptions: {
          ...query.builderOptions,
          filters: [
            {
              condition: 'AND',
              key: 'level',
              type: 'string',
              filterType: 'custom',
              operator: FilterOperator.Equals,
              value: 'info',
            },
          ],
        },
      };

      expect(datasource.queryHasFilter(queryWithFilter, { key: 'level', value: 'info' })).toBe(true);
    });

    it('returns false when value does not match', () => {
      const queryWithFilter: CHBuilderQuery = {
        ...query,
        builderOptions: {
          ...query.builderOptions,
          filters: [
            {
              condition: 'AND',
              key: 'level',
              type: 'string',
              filterType: 'custom',
              operator: FilterOperator.Equals,
              value: 'debug',
            },
          ],
        },
      };

      expect(datasource.queryHasFilter(queryWithFilter, { key: 'level', value: 'info' })).toBe(false);
    });

    it('returns false for NotEquals filter (only Equals counts)', () => {
      const queryWithFilter: CHBuilderQuery = {
        ...query,
        builderOptions: {
          ...query.builderOptions,
          filters: [
            {
              condition: 'AND',
              key: 'level',
              type: 'string',
              filterType: 'custom',
              operator: FilterOperator.NotEquals,
              value: 'info',
            },
          ],
        },
      };

      expect(datasource.queryHasFilter(queryWithFilter, { key: 'level', value: 'info' })).toBe(false);
    });

    it('returns true for hint-matched column via log alias', () => {
      const queryWithLevel: CHBuilderQuery = {
        ...query,
        builderOptions: {
          ...query.builderOptions,
          columns: [{ name: 'SeverityText', hint: ColumnHint.LogLevel, type: 'string' }],
          filters: [
            {
              condition: 'AND',
              key: '',
              hint: ColumnHint.LogLevel,
              type: 'string',
              filterType: 'custom',
              operator: FilterOperator.Equals,
              value: 'info',
            },
          ],
        },
      };

      expect(datasource.queryHasFilter(queryWithLevel, { key: 'level', value: 'info' })).toBe(true);
    });

    it('returns true for OTel map key match', () => {
      const queryWithMap: CHBuilderQuery = {
        ...query,
        builderOptions: {
          ...query.builderOptions,
          columns: [{ name: 'ResourceAttributes', type: 'Map(String, String)' }],
          filters: [
            {
              condition: 'AND',
              key: 'ResourceAttributes',
              mapKey: 'service.name',
              type: 'Map(String, String)',
              filterType: 'custom',
              operator: FilterOperator.Equals,
              value: 'my-service',
            },
          ],
        },
      };

      expect(
        datasource.queryHasFilter(queryWithMap, { key: 'ResourceAttributes.service.name', value: 'my-service' })
      ).toBe(true);
    });

    it('returns false when key is missing', () => {
      expect(datasource.queryHasFilter(query, { value: 'info' } as any)).toBe(false);
    });
  });

  describe('toggleQueryFilter', () => {
    const query: CHBuilderQuery = {
      pluginVersion: '',
      refId: 'A',
      editorType: EditorType.Builder,
      rawSql: '',
      builderOptions: {
        database: 'default',
        table: 'logs',
        queryType: QueryType.Logs,
        mode: BuilderMode.List,
        columns: [{ name: 'LogAttributes', hint: ColumnHint.LogAttributes, type: 'Map(String, String)' }],
      },
    };

    let datasource: Datasource;
    beforeEach(() => {
      datasource = cloneDeep(mockDatasource);
    });

    it('returns query unchanged for SQL mode', () => {
      const sqlQuery: CHSqlQuery = { pluginVersion: '', refId: 'A', editorType: EditorType.SQL, rawSql: 'SELECT 1' };
      const result = datasource.toggleQueryFilter(sqlQuery, {
        type: 'FILTER_FOR',
        options: { key: 'level', value: 'info' },
      });
      expect(result).toBe(sqlQuery);
    });

    it('returns query unchanged when key is missing', () => {
      const result = datasource.toggleQueryFilter(query, { type: 'FILTER_FOR', options: { value: 'info' } as any });
      expect(result).toBe(query);
    });

    it('FILTER_FOR adds an Equals filter when none exists', () => {
      const result = datasource.toggleQueryFilter(query, {
        type: 'FILTER_FOR',
        options: { key: 'level', value: 'info' },
      }) as CHBuilderQuery;

      expect(result.builderOptions.filters).toHaveLength(1);
      expect(result.builderOptions.filters![0]).toMatchObject({
        key: 'level',
        operator: FilterOperator.Equals,
        value: 'info',
      });
    });

    it('FILTER_FOR removes existing Equals filter with same key+value (toggle off)', () => {
      const queryWithFilter: CHBuilderQuery = {
        ...query,
        builderOptions: {
          ...query.builderOptions,
          filters: [
            {
              condition: 'AND',
              key: 'level',
              type: 'string',
              filterType: 'custom',
              operator: FilterOperator.Equals,
              value: 'info',
            },
          ],
        },
      };

      const result = datasource.toggleQueryFilter(queryWithFilter, {
        type: 'FILTER_FOR',
        options: { key: 'level', value: 'info' },
      }) as CHBuilderQuery;

      expect(result.builderOptions.filters).toHaveLength(0);
    });

    it('FILTER_FOR replaces existing NotEquals filter with Equals', () => {
      const queryWithFilter: CHBuilderQuery = {
        ...query,
        builderOptions: {
          ...query.builderOptions,
          filters: [
            {
              condition: 'AND',
              key: 'level',
              type: 'string',
              filterType: 'custom',
              operator: FilterOperator.NotEquals,
              value: 'info',
            },
          ],
        },
      };

      const result = datasource.toggleQueryFilter(queryWithFilter, {
        type: 'FILTER_FOR',
        options: { key: 'level', value: 'info' },
      }) as CHBuilderQuery;

      expect(result.builderOptions.filters).toHaveLength(1);
      expect(result.builderOptions.filters![0]).toMatchObject({
        operator: FilterOperator.Equals,
        value: 'info',
      });
    });

    it('FILTER_OUT adds a NotEquals filter when none exists', () => {
      const result = datasource.toggleQueryFilter(query, {
        type: 'FILTER_OUT',
        options: { key: 'level', value: 'error' },
      }) as CHBuilderQuery;

      expect(result.builderOptions.filters).toHaveLength(1);
      expect(result.builderOptions.filters![0]).toMatchObject({
        key: 'level',
        operator: FilterOperator.NotEquals,
        value: 'error',
      });
    });

    it('FILTER_OUT removes existing NotEquals filter with same key+value (toggle off)', () => {
      const queryWithFilter: CHBuilderQuery = {
        ...query,
        builderOptions: {
          ...query.builderOptions,
          filters: [
            {
              condition: 'AND',
              key: 'level',
              type: 'string',
              filterType: 'custom',
              operator: FilterOperator.NotEquals,
              value: 'error',
            },
          ],
        },
      };

      const result = datasource.toggleQueryFilter(queryWithFilter, {
        type: 'FILTER_OUT',
        options: { key: 'level', value: 'error' },
      }) as CHBuilderQuery;

      expect(result.builderOptions.filters).toHaveLength(0);
    });

    it('FILTER_OUT replaces existing Equals filter with NotEquals', () => {
      const queryWithFilter: CHBuilderQuery = {
        ...query,
        builderOptions: {
          ...query.builderOptions,
          filters: [
            {
              condition: 'AND',
              key: 'level',
              type: 'string',
              filterType: 'custom',
              operator: FilterOperator.Equals,
              value: 'error',
            },
          ],
        },
      };

      const result = datasource.toggleQueryFilter(queryWithFilter, {
        type: 'FILTER_OUT',
        options: { key: 'level', value: 'error' },
      }) as CHBuilderQuery;

      expect(result.builderOptions.filters).toHaveLength(1);
      expect(result.builderOptions.filters![0]).toMatchObject({
        operator: FilterOperator.NotEquals,
        value: 'error',
      });
    });

    it('works with hint-based columns via log alias', () => {
      const queryWithLevel: CHBuilderQuery = {
        ...query,
        builderOptions: {
          ...query.builderOptions,
          columns: [{ name: 'SeverityText', hint: ColumnHint.LogLevel, type: 'string' }],
        },
      };

      const result = datasource.toggleQueryFilter(queryWithLevel, {
        type: 'FILTER_FOR',
        options: { key: 'level', value: 'info' },
      }) as CHBuilderQuery;

      expect(result.builderOptions.filters).toHaveLength(1);
      expect(result.builderOptions.filters![0]).toMatchObject({
        key: '',
        hint: ColumnHint.LogLevel,
        operator: FilterOperator.Equals,
        value: 'info',
      });
    });

    it('works with OTel map keys', () => {
      const queryWithResource: CHBuilderQuery = {
        ...query,
        builderOptions: {
          ...query.builderOptions,
          columns: [{ name: 'ResourceAttributes', type: 'Map(String, String)' }],
        },
      };

      const result = datasource.toggleQueryFilter(queryWithResource, {
        type: 'FILTER_FOR',
        options: { key: 'ResourceAttributes.service.name', value: 'my-service' },
      }) as CHBuilderQuery;

      expect(result.builderOptions.filters).toHaveLength(1);
      expect(result.builderOptions.filters![0]).toMatchObject({
        mapKey: 'service.name',
        type: 'Map(String, String)',
        operator: FilterOperator.Equals,
        value: 'my-service',
      });
    });

    it('toggles off OTel map key filter when it already exists', () => {
      const queryWithMapFilter: CHBuilderQuery = {
        ...query,
        builderOptions: {
          ...query.builderOptions,
          columns: [{ name: 'ResourceAttributes', type: 'Map(String, String)' }],
          filters: [
            {
              condition: 'AND',
              key: 'ResourceAttributes',
              mapKey: 'service.name',
              type: 'Map(String, String)',
              filterType: 'custom',
              operator: FilterOperator.Equals,
              value: 'my-service',
            },
          ],
        },
      };

      const result = datasource.toggleQueryFilter(queryWithMapFilter, {
        type: 'FILTER_FOR',
        options: { key: 'ResourceAttributes.service.name', value: 'my-service' },
      }) as CHBuilderQuery;

      expect(result.builderOptions.filters).toHaveLength(0);
    });
  });
});
