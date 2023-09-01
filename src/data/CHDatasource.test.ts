import {
  ArrayDataFrame,
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
import { CHBuilderQuery, CHQuery, CHSqlQuery, EditorType, QueryType } from 'types/sql';
import { BuilderMode, SqlBuilderOptionsList } from 'types/queryBuilder';
import { cloneDeep } from 'lodash';
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
  });

  describe('Tag Keys', () => {
    it('should Fetch Default Tags When No Second AdHoc Variable', async () => {
      const spyOnReplace = jest.spyOn(templateSrvMock, 'replace').mockImplementation(() => '$clickhouse_adhoc_query');
      const ds = cloneDeep(mockDatasource);
      ds.settings.jsonData.defaultDatabase = undefined;
      const frame = new ArrayDataFrame([{ name: 'foo', type: 'string', table: 'table' }]);
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
      const frame = new ArrayDataFrame([{ name: 'foo', type: 'string', table: 'table' }]);
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
      const frame = new ArrayDataFrame([{ name: 'foo' }]);
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
      const frame = new ArrayDataFrame([{ version: '21.9.342' }]);
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
      const frameVer = new ArrayDataFrame([{ version: '23.2.212' }]);
      const frameData = new ArrayDataFrame([{ name: 'foo' }]);
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
      const frame = new ArrayDataFrame([{ bar: 'foo' }]);
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
      const frame = new ArrayDataFrame([{ name: 'foo' }]);
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

  describe('fetchFieldsFull', () => {
    it('sends a correct query when database and table names are provided', async () => {
      const ds = cloneDeep(mockDatasource);
      const frame = new ArrayDataFrame([{ name: 'foo', type: 'string', table: 'table' }]);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));
      await ds.fetchFieldsFull('db_name', 'table_name');
      const expected = { rawSql: 'DESC TABLE "db_name"."table_name"' };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );
    });

    it('sends a correct query when only table name is provided', async () => {
      const ds = cloneDeep(mockDatasource);
      const frame = new ArrayDataFrame([{ name: 'foo', type: 'string', table: 'table' }]);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_request) => of({ data: [frame] }));
      await ds.fetchFieldsFull('', 'table_name');
      const expected = { rawSql: 'DESC TABLE "table_name"' };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );
    });

    it('sends a correct query when table name contains a dot', async () => {
      const ds = cloneDeep(mockDatasource);
      const frame = new ArrayDataFrame([{ name: 'foo', type: 'string', table: 'table' }]);
      const spyOnQuery = jest.spyOn(ds, 'query').mockImplementation((_) => of({ data: [frame] }));

      await ds.fetchFieldsFull('', 'table.name');
      const expected = { rawSql: 'DESC TABLE "table.name"' };

      expect(spyOnQuery).toHaveBeenCalledWith(
        expect.objectContaining({ targets: expect.arrayContaining([expect.objectContaining(expected)]) })
      );
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
      refId: '42',
      editorType: EditorType.Builder,
      queryType: QueryType.Logs,
      database: 'system',
      table: 'numbers',
      rawSql: 'SELECT * FROM system.numbers LIMIT 1',
      builderOptions: {
        mode: BuilderMode.List,
        database: 'default',
        table: 'logs',
        timeField: 'created_at',
        logLevelField: 'level',
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
        [QueryType.Table, QueryType.Logs, QueryType.TimeSeries, QueryType.Traces].forEach(queryType => {
          expect(
            datasource.getSupplementaryLogsVolumeQuery(request, {
              ...query,
              queryType,
            })
          ).toBeUndefined();
        });
        [BuilderMode.Aggregate, BuilderMode.Trend].forEach((mode) => {
          expect(
            datasource.getSupplementaryLogsVolumeQuery(request, {
              ...query,
              builderOptions: { mode } as any,
            })
          ).toBeUndefined();
        });
        expect(
          datasource.getSupplementaryLogsVolumeQuery(request, {
            ...query,
            editorType: EditorType.SQL,
          })
        ).toBeUndefined();
        expect(
          datasource.getSupplementaryLogsVolumeQuery(request, {
            ...query,
            builderOptions: {
              ...query.builderOptions,
              database: undefined,
            } as SqlBuilderOptionsList,
          })
        ).toBeUndefined();
        expect(
          datasource.getSupplementaryLogsVolumeQuery(request, {
            ...query,
            builderOptions: {
              ...query.builderOptions,
              table: undefined,
            } as SqlBuilderOptionsList,
          })
        ).toBeUndefined();
        expect(
          datasource.getSupplementaryLogsVolumeQuery(request, {
            ...query,
            builderOptions: {
              ...query.builderOptions,
              timeField: undefined,
            } as SqlBuilderOptionsList,
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
            logLevelField: undefined,
          } as SqlBuilderOptionsList,
        });
        expect(result?.rawSql).toEqual(
          'SELECT toStartOfInterval("created_at", INTERVAL 1 DAY) AS time, count(*) logs ' +
            'FROM "default"."logs" ' +
            'GROUP BY toStartOfInterval("created_at", INTERVAL 1 DAY) AS time ' +
            'ORDER BY time ASC'
        );
      });

      it('should render a sophisticated log volume query when log level field is set', async () => {
        jest
          .spyOn(logs, 'getTimeFieldRoundingClause')
          .mockReturnValue('toStartOfInterval("created_at", INTERVAL 1 DAY)');
        const result = datasource.getSupplementaryLogsVolumeQuery(request, query);
        expect(result?.rawSql).toEqual(
          `SELECT sum(toString("level") IN ('critical','fatal','crit','alert','emerg','CRITICAL','FATAL','CRIT','ALERT','EMERG','Critical','Fatal','Crit','Alert','Emerg')) AS critical, ` +
            `sum(toString("level") IN ('error','err','eror','ERROR','ERR','EROR','Error','Err','Eror')) AS error, ` +
            `sum(toString("level") IN ('warn','warning','WARN','WARNING','Warn','Warning')) AS warn, ` +
            `sum(toString("level") IN ('info','information','informational','INFO','INFORMATION','INFORMATIONAL','Info','Information','Informational')) AS info, ` +
            `sum(toString("level") IN ('debug','dbug','DEBUG','DBUG','Debug','Dbug')) AS debug, ` +
            `sum(toString("level") IN ('trace','TRACE','Trace')) AS trace, ` +
            `sum(toString("level") IN ('unknown','UNKNOWN','Unknown')) AS unknown, ` +
            `toStartOfInterval("created_at", INTERVAL 1 DAY) AS time ` +
            `FROM "default"."logs" ` +
            `GROUP BY toStartOfInterval("created_at", INTERVAL 1 DAY) AS time ` +
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
