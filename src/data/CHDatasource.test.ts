import { toDataFrame } from '@grafana/data';
import { of } from 'rxjs';
import { mockDatasource } from '__mocks__/datasource';
import { CHQuery } from 'types';
import { AdHocVariableFilter } from './CHDatasource';

interface InstanceConfig {
  queryResponse: {} | [];
}

const templateSrvMock = { replace: jest.fn() };
jest.mock('@grafana/runtime', () => ({
  ...(jest.requireActual('@grafana/runtime') as unknown as object),
  getTemplateSrv: () => templateSrvMock,
}));

const createInstance = ({ queryResponse }: Partial<InstanceConfig> = {}) => {
  const instance = mockDatasource;
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
      const values = await createInstance({ queryResponse }).metricFindQuery('mock');
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
      const values = await createInstance({ queryResponse }).metricFindQuery('mock' );
      expect(values).toEqual(expectedValues);
    });
  });

  describe('applyTemplateVariables', () => {
    it('interpolates', async () => {
      const rawSql = 'foo';
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => rawSql);
      const query = { rawSql: 'select' } as CHQuery;
      const val = await createInstance({}).applyTemplateVariables(query, {});
      expect(spyOnReplace).toHaveBeenCalled();
      expect(val).toEqual({ rawSql });
    });
  });

  describe('AdHocManager', () => {
    it('apply ad hoc filter when there is a where clause', () => {
      let val = createInstance({}).applyAdHocFilter('SELECT stuff FROM table WHERE col = test;', [{key: 'key', operator: '=', value: 'val'}, {key: 'keyNum', operator: '=', value: '123'}] as AdHocVariableFilter[])
      expect(val).toEqual(`SELECT stuff FROM table WHERE key = 'val' AND keyNum = 123 AND col = test;`);
    });
    it('does not apply ad hoc filter when there is no where clause', () => {
      let val = createInstance({}).applyAdHocFilter('select stuff from table;', [{key: 'key', operator: '=', value: 'val'}] as AdHocVariableFilter[])
      expect(val).toEqual('select stuff from table;');
    });
  });
});
