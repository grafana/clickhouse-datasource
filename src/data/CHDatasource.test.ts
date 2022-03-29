import { ArrayDataFrame, toDataFrame } from '@grafana/data';
import { of } from 'rxjs';
import { mockDatasource } from '__mocks__/datasource';
import { CHQuery, QueryType } from 'types';
import { cloneDeep } from 'lodash';

interface InstanceConfig {
  queryResponse: {} | [];
}

const templateSrvMock = { replace: jest.fn(), getVariables: jest.fn(), getAdhocFilters: jest.fn() };
jest.mock('@grafana/runtime', () => ({
  ...(jest.requireActual('@grafana/runtime') as unknown as object),
  getTemplateSrv: () => templateSrvMock,
}));

const createInstance = ({ queryResponse }: Partial<InstanceConfig> = {}) => {
  const instance = cloneDeep(mockDatasource);
  jest.spyOn(instance, 'query').mockImplementation((request) => of({ data: [toDataFrame(queryResponse ?? [])] }));
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
      const query = { rawSql: 'select', queryType: QueryType.SQL } as CHQuery;
      const val = await createInstance({}).applyTemplateVariables(query, {});
      expect(spyOnReplace).toHaveBeenCalled();
      expect(val).toEqual({ rawSql, queryType: QueryType.SQL });
    });
  });

  describe('Tag Keys', () => {
    it('should Fetch Default Tags When No Second AdHoc Variable', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => '$clickhouse_adhoc_query');
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.defaultDatabase = undefined;
      const frame = new ArrayDataFrame([{ name: 'foo', type: 'string', table: 'table' }]);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((request) => of({ data: [frame] }));

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
      const frame = new ArrayDataFrame([{ name: 'foo', type: 'string', table: 'table' }]);
      const ds = cloneDeep(mockDatasource);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((request) => of({ data: [frame] }));

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
      const frame = new ArrayDataFrame([{ name: 'foo' }]);
      const ds = cloneDeep(mockDatasource);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((request) => of({ data: [frame] }));

      const keys = await ds.getTagKeys();
      expect(spyOnReplace).toHaveBeenCalled();
      const expected = { rawSql: 'select name from foo' };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );

      expect(keys).toEqual([{ text: 'name' }]);
    });
  });

  describe('Tag Values', () => {
    it('should Fetch Tag Values from Schema', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => '$clickhouse_adhoc_query');
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.defaultDatabase = undefined;
      const frame = new ArrayDataFrame([{ bar: 'foo' }]);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((request) => of({ data: [frame] }));

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
      const frame = new ArrayDataFrame([{ name: 'foo' }]);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((request) => of({ data: [frame] }));

      const values = await ds.getTagValues({ key: 'name' });
      expect(spyOnReplace).toHaveBeenCalled();
      const expected = { rawSql: 'select name from bar' };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );

      expect(values).toEqual([{ text: 'foo' }]);
    });
  });
});
