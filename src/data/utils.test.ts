import { ColumnHint, QueryBuilderOptions, QueryType } from 'types/queryBuilder';
import {
  appendWhereColumnsToSelect,
  columnLabelToPlaceholder,
  dataFrameHasLogLabelWithName,
  extractColumnsFromSql,
  extractTableFromSql,
  isBuilderOptionsRunnable,
  transformQueryResponseWithTraceAndLogLinks,
  tryApplyColumnHints,
} from './utils';
import { newMockDatasource } from '__mocks__/datasource';
import { CoreApp, DataFrame, DataQueryRequest, DataQueryResponse, Field, FieldType } from '@grafana/data';
import { CHBuilderQuery, CHQuery, EditorType } from 'types/sql';
import { logColumnHintsToAlias } from './sqlGenerator';

describe('isBuilderOptionsRunnable', () => {
  it('should return false for empty builder options', () => {
    const opts: QueryBuilderOptions = {
      database: 'default',
      table: 'test',
      queryType: QueryType.Table,
    };

    const runnable = isBuilderOptionsRunnable(opts);
    expect(runnable).toBe(false);
  });

  it('should return true for valid builder options', () => {
    const opts: QueryBuilderOptions = {
      database: 'default',
      table: 'test',
      queryType: QueryType.Table,
      columns: [{ name: 'valid_column' }],
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
    const columns = [{ name: 'time', alias: undefined, hint: ColumnHint.TraceServiceName }];

    tryApplyColumnHints(columns);

    expect(columns[0].hint).toEqual(ColumnHint.TraceServiceName);
  });

  it('applies hints by column name according to hint map, ignoring case', () => {
    const columns = [
      { name: 'Super_Custom_Timestamp', alias: undefined, hint: undefined },
      { name: 'LogLevel', alias: undefined, hint: undefined },
    ];
    const hintMap: Map<ColumnHint, string> = new Map([
      [ColumnHint.Time, 'super_custom_timestamp'],
      [ColumnHint.LogLevel, 'LogLevel'],
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
      [ColumnHint.Time, 'super_custom_timestamp'],
      [ColumnHint.LogLevel, 'LogLevel'],
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
  const buildTestRequestResponse = (
    builderOptions: Partial<QueryBuilderOptions>
  ): [DataQueryRequest<CHQuery>, DataQueryResponse] => {
    const inputQuery: CHBuilderQuery = {
      refId: 'A',
      editorType: EditorType.Builder,
      builderOptions: {
        database: '',
        table: '',
        queryType: QueryType.Traces,
        ...builderOptions,
      },
      pluginVersion: '',
      rawSql: '',
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
      startTime: 0,
    };

    const field: Field = {
      name: 'traceID',
      type: FieldType.string,
      config: {},
      values: [],
    };
    const data: DataFrame[] = [
      {
        fields: [field],
        length: 1,
        refId: 'A',
      },
    ];
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
      columns: [{ name: 'a' }],
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
    const getDefaultTraceEventsColumnPrefix = jest.spyOn(mockDatasource, 'getDefaultTraceEventsColumnPrefix');
    const getDefaultTraceLinksColumnPrefix = jest.spyOn(mockDatasource, 'getDefaultTraceLinksColumnPrefix');

    const builderOptions: Partial<QueryBuilderOptions> = {
      queryType: QueryType.Logs,
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
    // getDefaultLogsColumns is now called to get traceIdColumnName for correlation
    expect(getDefaultLogsColumns).toHaveBeenCalled();
    expect(getDefaultTraceEventsColumnPrefix).toHaveBeenCalled();
    expect(getDefaultTraceLinksColumnPrefix).toHaveBeenCalled();
  });

  it('includes TraceId filter in View logs link query using configured column', async () => {
    const mockDatasource = newMockDatasource();
    // Mock that TraceId is configured
    jest.spyOn(mockDatasource, 'getDefaultLogsColumns').mockReturnValue(new Map([[ColumnHint.TraceId, 'TraceId']]));

    const builderOptions: Partial<QueryBuilderOptions> = {
      queryType: QueryType.Traces,
      columns: [{ name: 'a' }],
    };

    const [request, response] = buildTestRequestResponse(builderOptions);
    const out = transformQueryResponseWithTraceAndLogLinks(mockDatasource, request, response);

    const links = out?.data[0]?.fields[0]?.config?.links;
    const viewLogsLink = links?.find((link: any) => link.title === 'View logs');

    const logsQuery = viewLogsLink?.internal?.query as CHBuilderQuery;
    expect(logsQuery.builderOptions.columns).toBeDefined();

    // TraceId column should be in the columns array
    const traceIdColumn = logsQuery.builderOptions.columns?.find((c) => c.hint === ColumnHint.TraceId);
    expect(traceIdColumn).toBeDefined();
    expect(traceIdColumn?.name).toBe('TraceId');

    // Filter should have the TraceId hint and column name as key
    const traceIdFilter = logsQuery.builderOptions.filters?.find((f) => (f as any).hint === ColumnHint.TraceId) as any;
    expect(traceIdFilter).toBeDefined();
    expect(traceIdFilter.key).toBe('TraceId');
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

describe('extractTableFromSql', () => {
  it('should extract table from simple query', () => {
    expect(extractTableFromSql('SELECT * FROM logs')).toEqual({ database: undefined, table: 'logs' });
  });

  it('should extract database and table', () => {
    expect(extractTableFromSql('SELECT * FROM default.logs')).toEqual({ database: 'default', table: 'logs' });
  });

  it('should handle quoted identifiers', () => {
    expect(extractTableFromSql('SELECT * FROM "my_db"."my_table"')).toEqual({ database: 'my_db', table: 'my_table' });
    expect(extractTableFromSql("SELECT * FROM 'db'.'table'")).toEqual({ database: 'db', table: 'table' });
    expect(extractTableFromSql('SELECT * FROM `db`.`table`')).toEqual({ database: 'db', table: 'table' });
  });

  it('should handle case insensitive FROM', () => {
    expect(extractTableFromSql('select * from LOGS')).toEqual({ database: undefined, table: 'LOGS' });
    expect(extractTableFromSql('SELECT * from db.logs')).toEqual({ database: 'db', table: 'logs' });
  });

  it('should return null for invalid queries', () => {
    expect(extractTableFromSql('INSERT INTO logs VALUES (1)')).toBeNull();
    expect(extractTableFromSql('SELECT 1')).toBeNull();
  });
});

describe('extractColumnsFromSql', () => {
  it('should extract single column', () => {
    const result = extractColumnsFromSql('SELECT message FROM logs');
    expect(result).toEqual(new Set(['message']));
  });

  it('should extract multiple columns', () => {
    const result = extractColumnsFromSql('SELECT timestamp, level, message FROM logs');
    expect(result).toEqual(new Set(['timestamp', 'level', 'message']));
  });

  it('should return empty set for SELECT *', () => {
    const result = extractColumnsFromSql('SELECT * FROM logs');
    expect(result).toEqual(new Set());
  });

  it('should handle column aliases', () => {
    const result = extractColumnsFromSql('SELECT timestamp AS ts, message FROM logs');
    expect(result).toEqual(new Set(['timestamp', 'message']));
  });

  it('should handle quoted column names', () => {
    const result = extractColumnsFromSql('SELECT "timestamp", `level` FROM logs');
    expect(result).toEqual(new Set(['timestamp', 'level']));
  });

  it('should return empty set for invalid queries', () => {
    const result = extractColumnsFromSql('INSERT INTO logs VALUES (1)');
    expect(result).toEqual(new Set());
  });

  it('should include WHERE clause columns', () => {
    const result = extractColumnsFromSql("SELECT timestamp, message FROM logs WHERE service = 'auth'");
    expect(result).toEqual(new Set(['timestamp', 'message', 'service']));
  });

  it('should include columns from complex WHERE conditions', () => {
    const result = extractColumnsFromSql("SELECT ts FROM logs WHERE level IN ('info', 'warn') AND region = 'us-east'");
    expect(result).toEqual(new Set(['ts', 'level', 'region']));
  });

  it('should include WHERE columns with SELECT *', () => {
    const result = extractColumnsFromSql("SELECT * FROM logs WHERE status = 'active'");
    expect(result).toEqual(new Set(['status']));
  });

  it('should extract columns from functions in WHERE', () => {
    const result = extractColumnsFromSql("SELECT a FROM t WHERE lower(name) = 'test'");
    expect(result).toEqual(new Set(['a', 'name']));
  });
});

describe('appendWhereColumnsToSelect', () => {
  it('should add WHERE column to SELECT', () => {
    const sql = "SELECT timestamp, message FROM logs WHERE service = 'auth'";
    const result = appendWhereColumnsToSelect(sql);
    expect(result).toBe("SELECT timestamp, message, service FROM logs WHERE service = 'auth'");
  });

  it('should add multiple WHERE columns', () => {
    const sql = "SELECT ts FROM logs WHERE level = 'error' AND region = 'us'";
    const result = appendWhereColumnsToSelect(sql);
    expect(result).toContain('level');
    expect(result).toContain('region');
  });

  it('should not duplicate columns already in SELECT', () => {
    const sql = "SELECT timestamp, service FROM logs WHERE service = 'auth'";
    const result = appendWhereColumnsToSelect(sql);
    // service should not be added again
    expect(result).toBe("SELECT timestamp, service FROM logs WHERE service = 'auth'");
  });

  it('should skip aggregate queries', () => {
    const sql = "SELECT count() FROM logs WHERE service = 'auth'";
    const result = appendWhereColumnsToSelect(sql);
    expect(result).toBe(sql); // unchanged
  });

  it('should skip GROUP BY queries', () => {
    const sql = "SELECT service, count() FROM logs WHERE level = 'error' GROUP BY service";
    const result = appendWhereColumnsToSelect(sql);
    expect(result).toBe(sql); // unchanged
  });

  it('should skip SELECT * queries', () => {
    const sql = "SELECT * FROM logs WHERE service = 'auth'";
    const result = appendWhereColumnsToSelect(sql);
    expect(result).toBe(sql); // unchanged (all columns already selected)
  });

  it('should handle queries without WHERE clause', () => {
    const sql = 'SELECT timestamp, message FROM logs';
    const result = appendWhereColumnsToSelect(sql);
    expect(result).toBe(sql); // unchanged
  });

  it('should handle complex WHERE conditions', () => {
    const sql = "SELECT a FROM t WHERE b = 1 AND c IN ('x', 'y') OR d > 10";
    const result = appendWhereColumnsToSelect(sql);
    expect(result).toContain('b');
    expect(result).toContain('c');
    expect(result).toContain('d');
  });
});
