import { ArrayDataFrame, ScopedVar, ScopedVars, toDataFrame } from '@grafana/data'
import { DataQuery } from '@grafana/schema'
import { of } from 'rxjs'
import { DataSourceWithBackend } from '@grafana/runtime'
import { mockDatasource } from '__mocks__/datasource'
import { CHQuery, QueryType } from 'types'
import { cloneDeep } from 'lodash'

interface InstanceConfig {
  queryResponse: {} | [];
}

const templateSrvMock = { replace: jest.fn(), getVariables: jest.fn(), getAdhocFilters: jest.fn() }
// noinspection JSUnusedGlobalSymbols
jest.mock('@grafana/runtime', () => ({
  ...(jest.requireActual('@grafana/runtime') as unknown as object),
  getTemplateSrv: () => templateSrvMock,
}))

const createInstance = ({ queryResponse }: Partial<InstanceConfig> = {}) => {
  const instance = cloneDeep(mockDatasource)
  jest.spyOn(instance, 'query').mockImplementation((_request) => of({ data: [ toDataFrame(queryResponse ?? []) ] }))
  return instance
}

describe('ClickHouseDatasource', () => {
  describe('metricFindQuery', () => {
    it('fetches values', async () => {
      const mockedValues = [ 1, 100 ]
      const queryResponse = {
        fields: [ { name: 'field', type: 'number', values: mockedValues } ],
      }
      const expectedValues = mockedValues.map((v) => ({ text: v, value: v }))
      const values = await createInstance({ queryResponse }).metricFindQuery('mock', {})
      expect(values).toEqual(expectedValues)
    })

    it('fetches name/value pairs', async () => {
      const mockedIds = [ 1, 2 ]
      const mockedValues = [ 100, 200 ]
      const queryResponse = {
        fields: [
          { name: 'id', type: 'number', values: mockedIds },
          { name: 'values', type: 'number', values: mockedValues },
        ],
      }
      const expectedValues = mockedValues.map((v, i) => ({ text: v, value: mockedIds[i] }))
      const values = await createInstance({ queryResponse }).metricFindQuery('mock', {})
      expect(values).toEqual(expectedValues)
    })
  })

  describe('applyTemplateVariables', () => {
    it('interpolates', async () => {
      const rawSql = 'foo'
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => rawSql)
      const query = { rawSql: 'select', queryType: QueryType.SQL } as CHQuery
      const val = createInstance({}).applyTemplateVariables(query, {})
      expect(spyOnReplace).toHaveBeenCalled()
      expect(val).toEqual({ rawSql, queryType: QueryType.SQL })
    })
    it('should handle $__conditionalAll and replace values', async () => {
      const query = { rawSql: '$__conditionalAll(foo, $fieldVal)', queryType: QueryType.SQL } as CHQuery
      const scopedVars = { fieldVal: { value: `'val1', 'val2'` } as ScopedVar<string> } as ScopedVars
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation((x) => x)
      const spyOnGetVars = jest.spyOn(templateSrvMock, 'getVariables').mockImplementation(() => [ scopedVars ])
      const val = createInstance({}).applyTemplateVariables(query, {})
      expect(spyOnReplace).toHaveBeenCalled()
      expect(spyOnGetVars).toHaveBeenCalled()
      expect(val).toEqual({ rawSql: `foo`, queryType: QueryType.SQL })
    })
  })

  describe('Tag Keys', () => {
    it('should Fetch Default Tags When No Second AdHoc Variable', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => '$clickhouse_adhoc_query')
      const ds = cloneDeep(mockDatasource)
      ds.settings.jsonData.defaultDatabase = undefined
      const frame = new ArrayDataFrame([ { name: 'foo', type: 'string', table: 'table' } ])
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [ frame ] }))

      const keys = await ds.getTagKeys()
      expect(spyOnReplace).toHaveBeenCalled()
      const expected = { rawSql: 'SELECT name, type, table FROM system.columns' }

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([ expect.objectContaining(expected) ]) })
      )

      expect(keys).toEqual([ { text: 'table.foo' } ])
    })

    it('should Fetch Tags With Default Database', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => '$clickhouse_adhoc_query')
      const frame = new ArrayDataFrame([ { name: 'foo', type: 'string', table: 'table' } ])
      const ds = cloneDeep(mockDatasource)
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [ frame ] }))

      const keys = await ds.getTagKeys()
      expect(spyOnReplace).toHaveBeenCalled()
      const expected = { rawSql: 'SELECT name, type, table FROM system.columns WHERE database IN (\'foo\')' }

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([ expect.objectContaining(expected) ]) })
      )

      expect(keys).toEqual([ { text: 'table.foo' } ])
    })

    it('should Fetch Tags From Query', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => 'select name from foo')
      const frame = new ArrayDataFrame([ { name: 'foo' } ])
      const ds = cloneDeep(mockDatasource)
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [ frame ] }))

      const keys = await ds.getTagKeys()
      expect(spyOnReplace).toHaveBeenCalled()
      const expected = { rawSql: 'select name from foo' }

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([ expect.objectContaining(expected) ]) })
      )

      expect(keys).toEqual([ { text: 'name' } ])
    })
    it('returns no tags when CH version is less than 22.7 ', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => 'select name from foo')
      const frame = new ArrayDataFrame([ { version: '21.9.342' } ])
      const ds = cloneDeep(mockDatasource)
      ds.adHocFiltersStatus = 2
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [ frame ] }))

      const keys = await ds.getTagKeys()
      expect(spyOnReplace).toHaveBeenCalled()

      expect(spyOnQuery).toHaveBeenCalled()

      expect(keys).toEqual({})
    })

    it('returns tags when CH version is greater than 22.7 ', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => 'select name from foo')
      const frameVer = new ArrayDataFrame([ { version: '23.2.212' } ])
      const frameData = new ArrayDataFrame([ { name: 'foo' } ])
      const ds = cloneDeep(mockDatasource)
      ds.adHocFiltersStatus = 2
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((request) => {
        return request.targets[0].rawSql === 'SELECT version()' ? of({ data: [ frameVer ] }) : of({ data: [ frameData ] })
      })

      const keys = await ds.getTagKeys()
      expect(spyOnReplace).toHaveBeenCalled()

      expect(spyOnQuery).toHaveBeenCalled()

      expect(keys).toEqual([ { text: 'name' } ])
    })
  })

  describe('Tag Values', () => {
    it('should Fetch Tag Values from Schema', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => '$clickhouse_adhoc_query')
      const ds = cloneDeep(mockDatasource)
      ds.settings.jsonData.defaultDatabase = undefined
      const frame = new ArrayDataFrame([ { bar: 'foo' } ])
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [ frame ] }))
      const values = await ds.getTagValues({ key: 'foo.bar' })
      expect(spyOnReplace).toHaveBeenCalled()
      const expected = { rawSql: 'select distinct bar from foo limit 1000' }

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([ expect.objectContaining(expected) ]) })
      )

      expect(values).toEqual([ { text: 'foo' } ])
    })

    it('should Fetch Tag Values from Query', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => 'select name from bar')
      const ds = cloneDeep(mockDatasource)
      const frame = new ArrayDataFrame([ { name: 'foo' } ])
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [ frame ] }))
      const values = await ds.getTagValues({ key: 'name' })
      expect(spyOnReplace).toHaveBeenCalled()
      const expected = { rawSql: 'select name from bar' }

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([ expect.objectContaining(expected) ]) })
      )

      expect(values).toEqual([ { text: 'foo' } ])
    })
  })

  describe('Conditional All', () => {
    it('should replace $__conditionalAll with 1=1 when all is selected', async () => {
      const rawSql = 'select stuff from table where $__conditionalAll(fieldVal in ($fieldVal), $fieldVal);'
      const val = createInstance({}).applyConditionalAll(rawSql, [
        { name: 'fieldVal', current: { value: '$__all' } } as any,
      ])
      expect(val).toEqual('select stuff from table where 1=1;')
    })
    it('should replace $__conditionalAll with arg when anything else is selected', async () => {
      const rawSql = 'select stuff from table where $__conditionalAll(fieldVal in ($fieldVal), $fieldVal);'
      const val = createInstance({}).applyConditionalAll(rawSql, [
        { name: 'fieldVal', current: { value: `'val1', 'val2'` } } as any,
      ])
      expect(val).toEqual(`select stuff from table where fieldVal in ($fieldVal);`)
    })
    it('should replace all $__conditionalAll', async () => {
      const rawSql =
        'select stuff from table where $__conditionalAll(fieldVal in ($fieldVal), $fieldVal) and $__conditionalAll(fieldVal in ($fieldVal2), $fieldVal2);'
      const val = createInstance({}).applyConditionalAll(rawSql, [
        { name: 'fieldVal', current: { value: `'val1', 'val2'` } } as any,
        { name: 'fieldVal2', current: { value: '$__all' } } as any,
      ])
      expect(val).toEqual(`select stuff from table where fieldVal in ($fieldVal) and 1=1;`)
    })
  })

  describe('fetchFieldsFull', () => {
    it('sends a correct query when database and table names are provided', async () => {
      const ds = cloneDeep(mockDatasource)
      const frame = new ArrayDataFrame([ { name: 'foo', type: 'string', table: 'table' } ])
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [ frame ] }))
      await ds.fetchFieldsFull('db_name', 'table_name')
      const expected = { rawSql: 'DESC TABLE db_name."table_name"' }

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([ expect.objectContaining(expected) ]) })
      )
    })

    it('sends a correct query when only table name is provided', async () => {
      const ds = cloneDeep(mockDatasource)
      const frame = new ArrayDataFrame([ { name: 'foo', type: 'string', table: 'table' } ])
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [ frame ] }))
      await ds.fetchFieldsFull('', 'table_name')
      const expected = { rawSql: 'DESC TABLE "table_name"' }

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([ expect.objectContaining(expected) ]) })
      )
    })

    it('sends a correct query when table name contains a dot', async () => {
      const ds = cloneDeep(mockDatasource)
      const frame = new ArrayDataFrame([ { name: 'foo', type: 'string', table: 'table' } ])
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_) => of({ data: [ frame ] }))

      await ds.fetchFieldsFull('', 'table.name')
      const expected = { rawSql: 'DESC TABLE "table.name"' }

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([ expect.objectContaining(expected) ]) })
      )
    })
  })

  describe('query', () => {
    it('filters out hidden queries', async () => {
      const instance = cloneDeep(mockDatasource)
      // Datasource inherits from DataSourceWithBackend
      const spy = jest
        .spyOn(DataSourceWithBackend.prototype, 'query')
        .mockImplementation((_request) => of({ data: [ toDataFrame([]) ] }))
      instance.query({
        targets: [ { refId: '1' }, { refId: '2', hide: false }, { refId: '3', hide: true } ] as DataQuery[],
        timezone: 'UTC',
      } as any)

      expect(spy).toHaveBeenCalledWith({
        targets: [
          { refId: '1', meta: { timezone: 'UTC' } },
          { refId: '2', hide: false, meta: { timezone: 'UTC' } },
        ],
        timezone: 'UTC',
      })
    })
  })
})
