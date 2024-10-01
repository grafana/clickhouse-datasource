import { ColumnHint, QueryBuilderOptions, QueryType } from "types/queryBuilder";
import { columnLabelToPlaceholder, dataFrameHasLogLabelWithName, isBuilderOptionsRunnable, transformQueryResponseWithTraceAndLogLinks, tryApplyColumnHints } from "./utils";
import { newMockDatasource } from "__mocks__/datasource";
import { CoreApp, DataFrame, DataQueryRequest, DataQueryResponse, Field, FieldType } from "@grafana/data";
import { CHBuilderQuery, CHQuery, EditorType } from "types/sql";
import { logColumnHintsToAlias } from "./sqlGenerator";

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

describe('tryApplyColumnHints', () => {
  it('does not apply hints when queryType and hint map are not provided', () => {
    const columns = [
      { name: 'a', alias: undefined, hint: undefined },
      { name: 'b', alias: undefined, hint: undefined },
    ];

    tryApplyColumnHints(columns);

    expect(columns[0].hint).toBeUndefined();
    expect(columns[1].hint).toBeUndefined();
  });

  it('applies time hint to columns that contain "time"', () => {
    const columns = [
      { name: 'Timestamp', alias: undefined, hint: undefined },
      { name: 'log_timestamp', alias: undefined, hint: undefined },
    ];

    tryApplyColumnHints(columns);

    expect(columns[0].hint).toEqual(ColumnHint.Time);
    expect(columns[1].hint).toEqual(ColumnHint.Time);
  });

  it('does not apply hints to column with existing hint', () => {
    const columns = [
      { name: 'time', alias: undefined, hint: ColumnHint.TraceServiceName },
    ];

    tryApplyColumnHints(columns);

    expect(columns[0].hint).toEqual(ColumnHint.TraceServiceName);
  });

  it('applies hints by column name according to hint map, ignoring case', () => {
    const columns = [
      { name: 'Super_Custom_Timestamp', alias: undefined, hint: undefined },
      { name: 'LogLevel', alias: undefined, hint: undefined },
    ];
    const hintMap: Map<ColumnHint, string> = new Map([
      [ColumnHint.Time, "super_custom_timestamp"],
      [ColumnHint.LogLevel, "LogLevel"]
    ]);

    tryApplyColumnHints(columns, hintMap);

    expect(columns[0].hint).toEqual(ColumnHint.Time);
    expect(columns[1].hint).toEqual(ColumnHint.LogLevel);
  });

  it('applies hints by column alias according to hint map, ignoring case', () => {
    const columns = [
      { name: 'other name', alias: 'Super_Custom_Timestamp', hint: undefined },
      { name: 'other name', alias: 'LogLevel', hint: undefined },
    ];
    const hintMap: Map<ColumnHint, string> = new Map([
      [ColumnHint.Time, "super_custom_timestamp"],
      [ColumnHint.LogLevel, "LogLevel"]
    ]);

    tryApplyColumnHints(columns, hintMap);

    expect(columns[0].hint).toEqual(ColumnHint.Time);
    expect(columns[1].hint).toEqual(ColumnHint.LogLevel);
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


describe('dataFrameHasLogLabelWithName', () => {
  const logLabelsFieldName = logColumnHintsToAlias.get(ColumnHint.LogLabels);

  it('should return false for undefined dataframe', () => {
    expect(dataFrameHasLogLabelWithName(undefined, 'testLabel')).toBe(false);
  });

  it('should return false for dataframe with no fields', () => {
    const frame: DataFrame = { fields: [] } as any as DataFrame;
    expect(dataFrameHasLogLabelWithName(frame, 'testLabel')).toBe(false);
  });

  it('should return false when log labels field is not present', () => {
    const frame: DataFrame = {
      fields: [{ name: 'otherField', values: { get: jest.fn(), length: 1 } }],
    } as any as DataFrame;
    expect(dataFrameHasLogLabelWithName(frame, 'testLabel')).toBe(false);
  });

  it('should return false when log labels field has no values', () => {
    const frame: DataFrame = {
      fields: [{ name: logLabelsFieldName, values: { get: jest.fn(), length: 0 } }],
    } as any as DataFrame;
    expect(dataFrameHasLogLabelWithName(frame, 'testLabel')).toBe(false);
  });

  it('should return false when log labels field value is null', () => {
    const frame: DataFrame = {
      fields: [{ name: logLabelsFieldName, values: { get: () => null, length: 1 } }],
    } as any as DataFrame;
    expect(dataFrameHasLogLabelWithName(frame, 'testLabel')).toBe(false);
  });

  it('should return true when log label with given name exists', () => {
    const frame: DataFrame = {
      fields: [
        {
          name: logLabelsFieldName,
          values: { get: () => ({ testLabel: 'value', otherLabel: 'otherValue' }), length: 1 },
        },
      ],
    } as any as DataFrame;
    expect(dataFrameHasLogLabelWithName(frame, 'testLabel')).toBe(true);
  });

  it('should return false when log label with given name does not exist', () => {
    const frame: DataFrame = {
      fields: [
        {
          name: logLabelsFieldName,
          values: { get: () => ({ otherLabel: 'value' }), length: 1 },
        },
      ],
    } as any as DataFrame;
    expect(dataFrameHasLogLabelWithName(frame, 'testLabel')).toBe(false);
  });
});
