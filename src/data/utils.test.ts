import { QueryBuilderOptions, QueryType } from "types/queryBuilder";
import { columnLabelToPlaceholder, isBuilderOptionsRunnable, transformQueryResponseWithTraceAndLogLinks } from "./utils";
import { newMockDatasource } from "__mocks__/datasource";
import { CoreApp, DataFrame, DataQueryRequest, DataQueryResponse, Field, FieldType } from "@grafana/data";
import { CHBuilderQuery, CHQuery, EditorType } from "types/sql";

describe('isBuilderOptionsRunnable', () => {
  it('should return false for empty builder options', () => {
    const opts: QueryBuilderOptions = {
      database: 'default',
      table: 'test',
      queryType: QueryType.Table
    };

    const runnable = isBuilderOptionsRunnable(opts);
    expect(runnable).toBe(false);
  });

  it('should return true for valid builder options', () => {
    const opts: QueryBuilderOptions = {
      database: 'default',
      table: 'test',
      queryType: QueryType.Table,
      columns: [
        { name: 'valid_column' }
      ]
    };

    const runnable = isBuilderOptionsRunnable(opts);
    expect(runnable).toBe(true);
  });
});

describe('columnLabelToPlaceholder', () => {
  it('converts to lowercase and removes multiple spaces', () => {
    const expected = 'expected_test_output';
    const actual = columnLabelToPlaceholder('Expected TEST output');
    expect(actual).toEqual(expected);
  });
});

describe('transformQueryResponseWithTraceAndLogLinks', () => {
  const buildTestRequestResponse = (builderOptions: Partial<QueryBuilderOptions>): [DataQueryRequest<CHQuery>, DataQueryResponse] => {
    const inputQuery: CHBuilderQuery = {
      refId: 'A',
      editorType: EditorType.Builder,
      builderOptions: {
        database: '',
        table: '',
        queryType: QueryType.Traces,
        ...builderOptions
      },
      pluginVersion: '',
      rawSql: ''
    };

    const request: DataQueryRequest<CHQuery> = {
      requestId: '',
      interval: '',
      intervalMs: 0,
      range: {} as any,
      scopedVars: {} as any,
      targets: [inputQuery],
      timezone: '',
      app: CoreApp.Explore,
      startTime: 0
    };

    const field: Field = {
      name: 'traceID',
      type: FieldType.string,
      config: {},
      values: []
    }
    const data: DataFrame[] = [{
      fields: [field],
      length: 1,
      refId: 'A'
    }];
    const response: DataQueryResponse = { data };

    return [request, response];
  };

  it('inserts links into trace query. Copy trace columns, default log columns.', async () => {
    const mockDatasource = newMockDatasource();
    const getDefaultTraceDatabase = jest.spyOn(mockDatasource, 'getDefaultTraceDatabase');
    const getDefaultTraceTable = jest.spyOn(mockDatasource, 'getDefaultTraceTable');
    const getDefaultTraceColumns = jest.spyOn(mockDatasource, 'getDefaultTraceColumns');
    const getDefaultLogsDatabase = jest.spyOn(mockDatasource, 'getDefaultLogsDatabase');
    const getDefaultLogsTable = jest.spyOn(mockDatasource, 'getDefaultLogsTable');
    const getDefaultLogsColumns = jest.spyOn(mockDatasource, 'getDefaultLogsColumns');

    const builderOptions: Partial<QueryBuilderOptions> = {
      queryType: QueryType.Traces,
      columns: [{ name: 'a' }]
    };

    const [request, response] = buildTestRequestResponse(builderOptions);
    const out = transformQueryResponseWithTraceAndLogLinks(mockDatasource, request, response);

    const links = out?.data[0]?.fields[0]?.config?.links;
    expect(links).not.toBeUndefined();
    expect(links).toHaveLength(2);
    expect(getDefaultTraceDatabase).not.toHaveBeenCalled();
    expect(getDefaultTraceTable).not.toHaveBeenCalled();
    expect(getDefaultTraceColumns).not.toHaveBeenCalled();
    expect(getDefaultLogsDatabase).toHaveBeenCalled();
    expect(getDefaultLogsTable).toHaveBeenCalled();
    expect(getDefaultLogsColumns).toHaveBeenCalled();
  });

  it('inserts links into logs query. Copy logs columns, default trace columns.', async () => {
    const mockDatasource = newMockDatasource();
    const getDefaultTraceDatabase = jest.spyOn(mockDatasource, 'getDefaultTraceDatabase');
    const getDefaultTraceTable = jest.spyOn(mockDatasource, 'getDefaultTraceTable');
    const getDefaultTraceColumns = jest.spyOn(mockDatasource, 'getDefaultTraceColumns');
    const getDefaultLogsDatabase = jest.spyOn(mockDatasource, 'getDefaultLogsDatabase');
    const getDefaultLogsTable = jest.spyOn(mockDatasource, 'getDefaultLogsTable');
    const getDefaultLogsColumns = jest.spyOn(mockDatasource, 'getDefaultLogsColumns');

    const builderOptions: Partial<QueryBuilderOptions> = {
      queryType: QueryType.Logs
    };
    
    const [request, response] = buildTestRequestResponse(builderOptions);
    const out = transformQueryResponseWithTraceAndLogLinks(mockDatasource, request, response);

    const links = out?.data[0]?.fields[0]?.config?.links;
    expect(links).not.toBeUndefined();
    expect(links).toHaveLength(2);
    expect(getDefaultTraceDatabase).toHaveBeenCalled();
    expect(getDefaultTraceTable).toHaveBeenCalled();
    expect(getDefaultTraceColumns).toHaveBeenCalled();
    expect(getDefaultLogsDatabase).not.toHaveBeenCalled();
    expect(getDefaultLogsTable).not.toHaveBeenCalled();
    expect(getDefaultLogsColumns).not.toHaveBeenCalled();
  });
});
