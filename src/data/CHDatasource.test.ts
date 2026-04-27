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
import { BuilderMode, ColumnHint, FilterOperator, OrderByDirection, QueryBuilderOptions, QueryType } from 'types/queryBuilder';
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
        { key: 'column.nested', operator: '=', value: 'value2' }
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
      const spyOnGetVars = jest.spyOn(templateSrvMock, 'getVariables').mockImplementation(() => [{name: 'clickhouse_adhoc_use_json'}]);

      // Setup ad-hoc filters
      const adHocFilters = [
        { key: 'column', operator: '=', value: 'value' },
        { key: 'column.nested', operator: '=', value: 'value2' }
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
                condition: 'AND'
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
            filters: [{ condition: 'AND', key: 'level', type: 'string', filterType: 'custom', operator: FilterOperator.Equals, value: 'debug' }],
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
            filters: [{ condition: 'AND', key: 'level', type: 'string', filterType: 'custom', operator: FilterOperator.Equals, value: 'info' }],
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
            filters: [{ condition: 'AND', key: 'level', type: 'string', filterType: 'custom', operator: FilterOperator.NotEquals, value: 'info' }],
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
            filters: [{ condition: 'AND', key: 'level', type: 'string', filterType: 'custom', operator: FilterOperator.NotEquals, value: 'error' }],
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
            filters: [{ condition: 'AND', key: '', hint: ColumnHint.LogLevel, type: 'string', filterType: 'custom', operator: FilterOperator.Equals, value: 'debug' }],
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
      const result = datasource.modifyQuery(sqlQuery, { type: 'ADD_FILTER', options: { key: 'level', value: 'info' } } as any);
      expect(result).toBe(sqlQuery);
    });

    it('returns query unchanged when value is missing', () => {
      const result = datasource.modifyQuery(query, { type: 'ADD_FILTER', options: { key: 'level' } } as any);
      expect(result).toBe(query);
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
      const querySpy = jest
        .spyOn(ds, 'query')
        .mockImplementation((_req) => of({ data: [toDataFrame([])] }));

      const query = cloneDeep(baseQuery);
      await ds.getLogRowContext(makeRow(), contextOptions, query);

      expect(querySpy).toHaveBeenCalledTimes(1);
      const request = querySpy.mock.calls[0][0] as DataQueryRequest<CHQuery>;
      const sent = request.targets[0] as CHBuilderQuery;
      const orderBy = sent.builderOptions.orderBy ?? [];

      // Primary entry is the time column (inserted by getLogRowContext).
      expect(orderBy[0]).toMatchObject({ hint: ColumnHint.Time });
      // User's secondary entry survives as a tiebreaker.
      expect(orderBy).toContainEqual(
        expect.objectContaining({ name: 'offset', dir: OrderByDirection.ASC })
      );
      // Original time-column entry is not duplicated.
      const timeEntries = orderBy.filter(
        (e) => e.hint === ColumnHint.Time || e.name === 'timestamp'
      );
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
});
