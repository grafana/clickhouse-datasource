import { ColumnHint, QueryBuilderOptions, QueryType, TimeUnit } from 'types/queryBuilder';
import {
  applyTraceSearchFieldConfig,
  columnLabelToPlaceholder,
  dataFrameHasLogLabelWithName,
  getBuilderOptions,
  isBuilderOptionsRunnable,
  labelsFieldName,
  transformQueryResponseWithTraceAndLogLinks,
  transformTraceTagFields,
  tryApplyColumnHints,
} from './utils';
import { newMockDatasource } from '__mocks__/datasource';
import { CoreApp, DataFrame, DataQueryRequest, DataQueryResponse, Field, FieldType } from '@grafana/data';
import { CHBuilderQuery, CHQuery, EditorType } from 'types/sql';
import { Datasource } from './CHDatasource';
import otel from 'otel';

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

describe('getBuilderOptions', () => {
  const builderOptions: QueryBuilderOptions = {
    database: 'default',
    table: 'test',
    queryType: QueryType.Table,
  };

  it('returns top-level builderOptions for a builder query', () => {
    const query: CHQuery = {
      refId: 'A',
      editorType: EditorType.Builder,
      rawSql: '',
      pluginVersion: '',
      builderOptions,
    };
    expect(getBuilderOptions(query)).toBe(builderOptions);
  });

  it('returns the stashed meta.builderOptions for a raw-SQL query', () => {
    const query: CHQuery = {
      refId: 'A',
      editorType: EditorType.SQL,
      rawSql: 'SELECT 1',
      pluginVersion: '',
      meta: { builderOptions },
    };
    expect(getBuilderOptions(query)).toBe(builderOptions);
  });

  it('returns undefined for a raw-SQL query with no builderOptions', () => {
    const query: CHQuery = {
      refId: 'A',
      editorType: EditorType.SQL,
      rawSql: 'SELECT 1',
      pluginVersion: '',
    };
    expect(getBuilderOptions(query)).toBeUndefined();
  });

  it('returns undefined when the query is undefined', () => {
    expect(getBuilderOptions(undefined)).toBeUndefined();
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

describe('applyTraceSearchFieldConfig', () => {
  const buildTraceSearchRequestResponse = (
    fields: Field[],
    builderOptions: Partial<QueryBuilderOptions> = {}
  ): [DataQueryRequest<CHQuery>, DataQueryResponse] => {
    const inputQuery: CHBuilderQuery = {
      refId: 'A',
      editorType: EditorType.Builder,
      builderOptions: {
        database: 'default',
        table: 'otel_traces',
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

    const data: DataFrame[] = [
      {
        fields,
        length: 1,
        refId: 'A',
      },
    ];
    const response: DataQueryResponse = { data };

    return [request, response];
  };

  it('applies field configs to trace search result fields', () => {
    const fields: Field[] = [
      { name: 'traceID', type: FieldType.string, config: {}, values: [] },
      { name: 'serviceName', type: FieldType.string, config: {}, values: [] },
      { name: 'operationName', type: FieldType.string, config: {}, values: [] },
      { name: 'startTime', type: FieldType.time, config: {}, values: [] },
      { name: 'duration', type: FieldType.number, config: {}, values: [] },
    ];

    const [request, response] = buildTraceSearchRequestResponse(fields);
    applyTraceSearchFieldConfig(request, response);

    expect(response.data[0].fields[4].config.unit).toBe('ms');
    expect(response.data[0].fields[4].config.displayName).toBe('Duration');
    expect(response.data[0].fields[0].config.displayName).toBe('Trace ID');
    expect(response.data[0].fields[1].config.displayName).toBe('Service Name');
    expect(response.data[0].fields[2].config.displayName).toBe('Operation Name');
    expect(response.data[0].fields[3].config.displayName).toBe('Start Time');
  });

  it('does not apply field configs to trace ID mode queries', () => {
    const fields: Field[] = [{ name: 'duration', type: FieldType.number, config: {}, values: [] }];

    const [request, response] = buildTraceSearchRequestResponse(fields, {
      meta: { isTraceIdMode: true, traceId: 'abc123' },
    });
    applyTraceSearchFieldConfig(request, response);

    expect(response.data[0].fields[0].config.unit).toBeUndefined();
  });

  it('does not apply field configs to non-trace queries', () => {
    const fields: Field[] = [{ name: 'duration', type: FieldType.number, config: {}, values: [] }];

    const [request, response] = buildTraceSearchRequestResponse(fields, {
      queryType: QueryType.Table,
    });
    applyTraceSearchFieldConfig(request, response);

    expect(response.data[0].fields[0].config.unit).toBeUndefined();
  });

  it('preserves existing field config properties', () => {
    const fields: Field[] = [{ name: 'duration', type: FieldType.number, config: { decimals: 2 }, values: [] }];

    const [request, response] = buildTraceSearchRequestResponse(fields);
    applyTraceSearchFieldConfig(request, response);

    expect(response.data[0].fields[0].config.unit).toBe('ms');
    expect(response.data[0].fields[0].config.decimals).toBe(2);
  });

  it('does not modify fields that have no matching config', () => {
    const fields: Field[] = [{ name: 'customColumn', type: FieldType.string, config: {}, values: [] }];

    const [request, response] = buildTraceSearchRequestResponse(fields);
    applyTraceSearchFieldConfig(request, response);

    expect(response.data[0].fields[0].config).toEqual({});
  });
});

describe('transformQueryResponseWithTraceAndLogLinks', () => {
  const configureOtelLogs = (datasource: Datasource) => {
    datasource.settings.jsonData.logs = {
      defaultDatabase: 'otel',
      defaultTable: 'otel_logs',
      otelEnabled: true,
      otelVersion: 'latest',
    };
  };

  const configureOtelTraces = (datasource: Datasource) => {
    datasource.settings.jsonData.traces = {
      defaultDatabase: 'otel',
      defaultTable: 'otel_traces',
      otelEnabled: true,
      otelVersion: 'latest',
      durationUnit: TimeUnit.Nanoseconds,
    };
  };

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
    configureOtelLogs(mockDatasource);
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
    const out = await transformQueryResponseWithTraceAndLogLinks(mockDatasource, request, response);

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
    configureOtelTraces(mockDatasource);
    jest.spyOn(mockDatasource, 'fetchColumns').mockResolvedValue([]);
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
    const out = await transformQueryResponseWithTraceAndLogLinks(mockDatasource, request, response);

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
    jest.spyOn(mockDatasource, 'getDefaultLogsTable').mockReturnValue('logs');
    jest.spyOn(mockDatasource, 'getDefaultLogsColumns').mockReturnValue(new Map([[ColumnHint.TraceId, 'TraceId']]));

    const builderOptions: Partial<QueryBuilderOptions> = {
      queryType: QueryType.Traces,
      columns: [{ name: 'a' }],
    };

    const [request, response] = buildTestRequestResponse(builderOptions);
    const out = await transformQueryResponseWithTraceAndLogLinks(mockDatasource, request, response);

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

  it('does not crash on a raw-SQL query with a trace_id column and no trace/table defaults (issue repro)', async () => {
    const mockDatasource = newMockDatasource();
    // Reproduce the customer environment: raw SQL, no trace defaults, and no default table,
    // so the trace-link transform takes the "create from defaults" branch with empty db/table.
    jest.spyOn(mockDatasource, 'getDefaultTraceDatabase').mockReturnValue('');
    jest.spyOn(mockDatasource, 'getDefaultTraceTable').mockReturnValue('');
    jest.spyOn(mockDatasource, 'getDefaultDatabase').mockReturnValue('');
    jest.spyOn(mockDatasource, 'getDefaultTable').mockReturnValue('');

    const sqlQuery: CHQuery = {
      refId: 'A',
      editorType: EditorType.SQL,
      rawSql: 'SELECT trace_id FROM some_table',
      pluginVersion: '',
    };

    const request: DataQueryRequest<CHQuery> = {
      requestId: '',
      interval: '',
      intervalMs: 0,
      range: {} as any,
      scopedVars: {} as any,
      targets: [sqlQuery],
      timezone: '',
      app: CoreApp.Explore,
      startTime: 0,
    };

    const response: DataQueryResponse = {
      data: [
        {
          refId: 'A',
          length: 1,
          fields: [{ name: 'trace_id', type: FieldType.string, config: {}, values: ['abc123'] }],
        } as DataFrame,
      ],
    };

    const out = await transformQueryResponseWithTraceAndLogLinks(mockDatasource, request, response);
    expect(out.data[0].fields[0].config.links ?? []).toHaveLength(0);
  });

  it('embeds a serializable datasource ref (not the live instance) in trace/log link queries', async () => {
    // The live Datasource instance contains a circular reference (datasource.variables.datasource
    // === datasource, added with CustomVariableSupport). Embedding the instance in a data link's
    // internal query makes Grafana's link scanner (getStringsFromObject) recurse infinitely on
    // older Grafana, throwing "Maximum call stack size exceeded". The link must carry a plain
    // { uid, type } ref instead.
    const mockDatasource = newMockDatasource();
    configureOtelLogs(mockDatasource);
    configureOtelTraces(mockDatasource);
    jest.spyOn(mockDatasource, 'fetchColumns').mockResolvedValue([]);

    const [request, response] = buildTestRequestResponse({
      queryType: QueryType.Traces,
      columns: [{ name: 'a' }],
    });
    const out = await transformQueryResponseWithTraceAndLogLinks(mockDatasource, request, response);

    const links = out?.data[0]?.fields[0]?.config?.links ?? [];
    const viewTrace = links.find((l) => l.title === 'View trace');
    const viewLogs = links.find((l) => l.title === 'View logs');
    expect(viewTrace).toBeDefined();
    expect(viewLogs).toBeDefined();

    for (const link of [viewTrace!, viewLogs!]) {
      const embedded = (link.internal!.query as CHBuilderQuery).datasource;
      // Must be a plain ref, not the live instance (which is circular).
      expect(embedded).not.toBe(mockDatasource);
      expect(embedded).toEqual({ uid: 'clickhouse_ds', type: 'grafana-clickhouse-datasource' });
      // The whole internal query must be JSON-serializable (no circular references reach Grafana).
      expect(() => JSON.stringify(link.internal!.query)).not.toThrow();
    }
  });

  describe('trace ID link rawSql pre-generation', () => {
    const newOtelMockDatasource = (): Datasource => {
      const ds = newMockDatasource();
      (ds as any).settings = {
        ...((ds as any).settings || {}),
        jsonData: {
          ...(((ds as any).settings || {}).jsonData || {}),
          defaultDatabase: 'otel',
          traces: {
            defaultDatabase: 'otel',
            defaultTable: 'otel_traces',
            otelEnabled: true,
            otelVersion: 'latest',
            durationUnit: TimeUnit.Nanoseconds,
          },
        },
      };
      return ds;
    };

    it('trace→trace link queries the datasource for companion existence (not the stale meta value)', async () => {
      // The original query has hasTraceTimestampTable: false in its meta, but
      // the datasource cache resolves true — the link should use the fresh value.
      const mockDatasource = newOtelMockDatasource();
      jest.spyOn(mockDatasource, 'fetchColumns').mockResolvedValue([]);
      jest.spyOn(mockDatasource, 'hasTraceTimestampTable').mockResolvedValue(true);
      const otelConfig = otel.getVersion('latest')!;
      const columns = Array.from(otelConfig.traceColumnMap, ([hint, name]) => ({ name, hint }));

      const builderOptions: Partial<QueryBuilderOptions> = {
        database: 'otel',
        table: 'otel_traces',
        queryType: QueryType.Traces,
        columns,
        meta: {
          otelEnabled: true,
          otelVersion: 'latest',
          traceDurationUnit: TimeUnit.Nanoseconds,
          hasTraceTimestampTable: false, // stale / not yet set by editor
        },
      };

      const [request, response] = buildTestRequestResponse(builderOptions);
      const out = await transformQueryResponseWithTraceAndLogLinks(mockDatasource, request, response);

      const links = out?.data[0]?.fields[0]?.config?.links;
      const viewTraceLink = links?.find((link: any) => link.title === 'View trace');
      const traceQuery = viewTraceLink?.internal?.query as CHBuilderQuery;

      expect(traceQuery.rawSql).toContain('otel_traces_trace_id_ts');
      expect(traceQuery.rawSql).toContain('trace_start');
      expect(traceQuery.rawSql).toContain('trace_end');
      expect(traceQuery.builderOptions.meta?.hasTraceTimestampTable).toBe(true);
    });

    it('trace→trace link auto-detects JSON tag columns via fetchColumns', async () => {
      const mockDatasource = newOtelMockDatasource();
      // fetchColumns reports SpanAttributes and ResourceAttributes as JSON type
      jest.spyOn(mockDatasource, 'fetchColumns').mockResolvedValue([
        { name: 'SpanAttributes', type: 'JSON', hint: ColumnHint.TraceTags },
        { name: 'ResourceAttributes', type: 'JSON', hint: ColumnHint.TraceServiceTags },
      ] as any);
      const otelConfig = otel.getVersion('latest')!;
      // columns do NOT have type:'JSON' pre-set (simulating saved query / OTel already enabled on mount)
      const columns = Array.from(otelConfig.traceColumnMap, ([hint, name]) => ({ name, hint }));

      const builderOptions: Partial<QueryBuilderOptions> = {
        database: 'otel',
        table: 'otel_traces',
        queryType: QueryType.Traces,
        columns,
        meta: { otelEnabled: true, otelVersion: 'latest' },
      };

      const [request, response] = buildTestRequestResponse(builderOptions);
      const out = await transformQueryResponseWithTraceAndLogLinks(mockDatasource, request, response);

      const traceQuery = out?.data[0]?.fields[0]?.config?.links?.find((link: any) => link.title === 'View trace')
        ?.internal?.query as CHBuilderQuery;

      expect(traceQuery.rawSql).toContain('"SpanAttributes" as tags');
      expect(traceQuery.rawSql).not.toContain('JSONAllPaths("SpanAttributes")');
      expect(traceQuery.rawSql).not.toContain('mapKeys("SpanAttributes")');
      expect(traceQuery.builderOptions.meta?.tagsAreJSON).toBe(true);
    });

    it('live fetchColumns result overrides stale meta.tagsAreJSON when schema is Map-typed', async () => {
      // Regression guard for the stale meta fallback bug:
      // If fetchColumns returns Map-typed columns but meta.tagsAreJSON is saved as true
      // (from a prior JSON-schema table), effectiveTagsAreJSON must be false so the
      // SQL generator uses mapKeys() rather than JSON-path SQL.
      const mockDatasource = newOtelMockDatasource();
      // fetchColumns returns Map-typed columns (no JSON)
      jest.spyOn(mockDatasource, 'fetchColumns').mockResolvedValue([
        { name: 'SpanAttributes', type: 'Map(String,String)', label: 'SpanAttributes', picklistValues: [] },
        { name: 'ResourceAttributes', type: 'Map(String,String)', label: 'ResourceAttributes', picklistValues: [] },
      ]);
      const otelConfig = otel.getVersion('latest')!;
      const columns = Array.from(otelConfig.traceColumnMap, ([hint, name]) => ({ name, hint }));

      const builderOptions: Partial<QueryBuilderOptions> = {
        database: 'otel',
        table: 'otel_traces',
        queryType: QueryType.Traces,
        columns,
        // Stale saved meta: was true from when the table used JSON columns
        meta: { otelEnabled: true, otelVersion: 'latest', tagsAreJSON: true },
      };

      const [request, response] = buildTestRequestResponse(builderOptions);
      const out = await transformQueryResponseWithTraceAndLogLinks(mockDatasource, request, response);

      const traceQuery = out?.data[0]?.fields[0]?.config?.links?.find((link: any) => link.title === 'View trace')
        ?.internal?.query as CHBuilderQuery;

      // Live schema wins: Map SQL, not JSON-path SQL
      expect(traceQuery.builderOptions.meta?.tagsAreJSON).toBe(false);
      expect(traceQuery.rawSql).toContain('mapKeys');
      expect(traceQuery.rawSql).not.toContain('"SpanAttributes" as tags');
    });

    it('logs→trace link with OTel ships optimized rawSql on first click when the companion table exists', async () => {
      // Confirms the #1705 behavior is preserved: the very first View Trace
      // click after a fresh page load uses the _trace_id_ts optimization,
      // because hasTraceTimestampTable is awaited before rawSql is generated.
      const mockDatasource = newOtelMockDatasource();
      jest.spyOn(mockDatasource, 'fetchColumns').mockResolvedValue([]);
      jest.spyOn(mockDatasource, 'hasTraceTimestampTable').mockResolvedValue(true);

      const builderOptions: Partial<QueryBuilderOptions> = {
        queryType: QueryType.Logs,
      };

      const [request, response] = buildTestRequestResponse(builderOptions);
      const out = await transformQueryResponseWithTraceAndLogLinks(mockDatasource, request, response);

      const links = out?.data[0]?.fields[0]?.config?.links;
      const viewTraceLink = links?.find((link: any) => link.title === 'View trace');
      const traceQuery = viewTraceLink?.internal?.query as CHBuilderQuery;

      expect(traceQuery.builderOptions.meta?.otelEnabled).toBe(true);
      expect(traceQuery.builderOptions.meta?.hasTraceTimestampTable).toBe(true);
      expect(traceQuery.rawSql).toContain('otel_traces_trace_id_ts');
      expect(traceQuery.rawSql).toContain('trace_start');
      expect(traceQuery.rawSql).toContain('trace_end');
    });

    it('sets format on the trace ID link query so Grafana picks the trace panel', async () => {
      // Without `format: 3` the sqlds backend tags the response as TimeSeries and
      // Grafana shows "Data is missing a time field" on first click, because the
      // editor's setAllOptions hasn't run yet to set format.
      const mockDatasource = newOtelMockDatasource();
      jest.spyOn(mockDatasource, 'hasTraceTimestampTable').mockResolvedValue(false);

      const [request, response] = buildTestRequestResponse({ queryType: QueryType.Logs });
      const out = await transformQueryResponseWithTraceAndLogLinks(mockDatasource, request, response);

      const links = out?.data[0]?.fields[0]?.config?.links;
      const viewTraceLink = links?.find((link: any) => link.title === 'View trace');
      const viewLogsLink = links?.find((link: any) => link.title === 'View logs');
      const traceQuery = viewTraceLink?.internal?.query as CHBuilderQuery;
      const logsQuery = viewLogsLink?.internal?.query as CHBuilderQuery;

      expect(traceQuery.format).toBe(3); // Trace
      expect(logsQuery.format).toBe(2); // Logs
    });

    it('logs→trace link with OTel ships unoptimized rawSql when the companion table is missing (#1842)', async () => {
      // Regression guard for grafana/clickhouse-datasource#1842: when OTel is
      // configured but the companion `_trace_id_ts` table does not exist, the
      // optimistic pre-#1842 code shipped the optimized SQL and the query
      // failed on first click with "Unknown table expression identifier".
      const mockDatasource = newOtelMockDatasource();
      jest.spyOn(mockDatasource, 'hasTraceTimestampTable').mockResolvedValue(false);

      const builderOptions: Partial<QueryBuilderOptions> = {
        queryType: QueryType.Logs,
      };

      const [request, response] = buildTestRequestResponse(builderOptions);
      const out = await transformQueryResponseWithTraceAndLogLinks(mockDatasource, request, response);

      const links = out?.data[0]?.fields[0]?.config?.links;
      const viewTraceLink = links?.find((link: any) => link.title === 'View trace');
      const traceQuery = viewTraceLink?.internal?.query as CHBuilderQuery;

      expect(traceQuery.builderOptions.meta?.otelEnabled).toBe(true);
      expect(traceQuery.builderOptions.meta?.hasTraceTimestampTable).toBe(false);
      expect(traceQuery.rawSql).not.toBe('');
      expect(traceQuery.rawSql).not.toContain('trace_id_ts');
    });

    it('table→trace link with OTel ships unoptimized rawSql when the companion table is missing (#1842 reproduction)', async () => {
      const mockDatasource = newOtelMockDatasource();
      jest.spyOn(mockDatasource, 'hasTraceTimestampTable').mockResolvedValue(false);

      const builderOptions: Partial<QueryBuilderOptions> = {
        queryType: QueryType.Table,
      };

      const [request, response] = buildTestRequestResponse(builderOptions);
      const out = await transformQueryResponseWithTraceAndLogLinks(mockDatasource, request, response);

      const links = out?.data[0]?.fields[0]?.config?.links;
      const viewTraceLink = links?.find((link: any) => link.title === 'View trace');
      const traceQuery = viewTraceLink?.internal?.query as CHBuilderQuery;

      expect(traceQuery.builderOptions.meta?.hasTraceTimestampTable).toBe(false);
      expect(traceQuery.rawSql).not.toBe('');
      expect(traceQuery.rawSql).not.toContain('trace_id_ts');
    });

    it('logs→trace link without OTel generates rawSql without _trace_id_ts optimization', async () => {
      const mockDatasource = newMockDatasource();
      mockDatasource.settings.jsonData.traces = {
        defaultDatabase: 'otel',
        defaultTable: 'otel_traces',
        traceIdColumn: 'TraceId',
        startTimeColumn: 'Timestamp',
        durationColumn: 'Duration',
        durationUnit: TimeUnit.Nanoseconds,
      };
      jest.spyOn(mockDatasource, 'fetchColumns').mockResolvedValue([]);

      const builderOptions: Partial<QueryBuilderOptions> = {
        queryType: QueryType.Logs,
      };

      const [request, response] = buildTestRequestResponse(builderOptions);
      const out = await transformQueryResponseWithTraceAndLogLinks(mockDatasource, request, response);

      const links = out?.data[0]?.fields[0]?.config?.links;
      const viewTraceLink = links?.find((link: any) => link.title === 'View trace');
      const traceQuery = viewTraceLink?.internal?.query as CHBuilderQuery;

      expect(traceQuery.rawSql).not.toBe('');
      expect(traceQuery.rawSql).not.toContain('trace_id_ts');
      expect(traceQuery.builderOptions.meta?.hasTraceTimestampTable).toBeFalsy();
    });

    it('trace→trace link generates unoptimized rawSql when companion does not exist', async () => {
      const mockDatasource = newOtelMockDatasource();
      jest.spyOn(mockDatasource, 'fetchColumns').mockResolvedValue([]);
      jest.spyOn(mockDatasource, 'hasTraceTimestampTable').mockResolvedValue(false);
      const otelConfig = otel.getVersion('latest')!;
      const columns = Array.from(otelConfig.traceColumnMap, ([hint, name]) => ({ name, hint }));

      const builderOptions: Partial<QueryBuilderOptions> = {
        database: 'otel',
        table: 'otel_traces',
        queryType: QueryType.Traces,
        columns,
        meta: {
          otelEnabled: true,
          otelVersion: 'latest',
          traceDurationUnit: TimeUnit.Nanoseconds,
          hasTraceTimestampTable: true, // stale meta — should be overridden by datasource
        },
      };

      const [request, response] = buildTestRequestResponse(builderOptions);
      const out = await transformQueryResponseWithTraceAndLogLinks(mockDatasource, request, response);

      const links = out?.data[0]?.fields[0]?.config?.links;
      const viewTraceLink = links?.find((link: any) => link.title === 'View trace');
      const traceQuery = viewTraceLink?.internal?.query as CHBuilderQuery;

      expect(traceQuery.rawSql).not.toBe('');
      expect(traceQuery.rawSql).not.toContain('trace_id_ts');
      expect(traceQuery.builderOptions.meta?.hasTraceTimestampTable).toBe(false);
    });
  });

  it('does not inject "View trace" link when showTraceLinks is false', async () => {
    const mockDatasource = newMockDatasource();
    configureOtelLogs(mockDatasource);
    mockDatasource.settings.jsonData.traces = { showTraceLinks: false };

    const builderOptions: Partial<QueryBuilderOptions> = {
      queryType: QueryType.Traces,
      columns: [{ name: 'a' }],
    };

    const [request, response] = buildTestRequestResponse(builderOptions);
    const out = await transformQueryResponseWithTraceAndLogLinks(mockDatasource, request, response);

    const links = out?.data[0]?.fields[0]?.config?.links;
    expect(links).toBeDefined();
    expect(links?.find((link: any) => link.title === 'View trace')).toBeUndefined();
    expect(links?.find((link: any) => link.title === 'View logs')).toBeDefined();
  });

  it('does not inject "View logs" link when showLogLinks is false', async () => {
    const mockDatasource = newMockDatasource();
    mockDatasource.settings.jsonData.logs = { showLogLinks: false };

    const builderOptions: Partial<QueryBuilderOptions> = {
      queryType: QueryType.Traces,
      columns: [{ name: 'a' }],
    };

    const [request, response] = buildTestRequestResponse(builderOptions);
    const out = await transformQueryResponseWithTraceAndLogLinks(mockDatasource, request, response);

    const links = out?.data[0]?.fields[0]?.config?.links;
    expect(links).toBeDefined();
    expect(links?.find((link: any) => link.title === 'View trace')).toBeDefined();
    expect(links?.find((link: any) => link.title === 'View logs')).toBeUndefined();
  });

  it('does not inject "View trace" for a logs-only single-table datasource', async () => {
    const mockDatasource = newMockDatasource();
    mockDatasource.settings.jsonData.configMode = 'single-table';
    mockDatasource.settings.jsonData.signalType = 'logs';
    configureOtelLogs(mockDatasource);

    const builderOptions: Partial<QueryBuilderOptions> = {
      queryType: QueryType.Logs,
    };

    const [request, response] = buildTestRequestResponse(builderOptions);
    const out = await transformQueryResponseWithTraceAndLogLinks(mockDatasource, request, response);

    const links = out?.data[0]?.fields[0]?.config?.links;
    expect(links?.find((link: any) => link.title === 'View trace')).toBeUndefined();
    expect(links?.find((link: any) => link.title === 'View logs')).toBeDefined();
  });

  it('does not inject "View logs" for a traces-only single-table datasource', async () => {
    const mockDatasource = newMockDatasource();
    mockDatasource.settings.jsonData.configMode = 'single-table';
    mockDatasource.settings.jsonData.signalType = 'traces';
    configureOtelTraces(mockDatasource);

    const builderOptions: Partial<QueryBuilderOptions> = {
      queryType: QueryType.Traces,
      columns: [{ name: 'TraceId', hint: ColumnHint.TraceId }],
    };

    const [request, response] = buildTestRequestResponse(builderOptions);
    const out = await transformQueryResponseWithTraceAndLogLinks(mockDatasource, request, response);

    const links = out?.data[0]?.fields[0]?.config?.links;
    expect(links?.find((link: any) => link.title === 'View trace')).toBeDefined();
    expect(links?.find((link: any) => link.title === 'View logs')).toBeUndefined();
  });
});

describe('transformTraceTagFields', () => {
  const makeRawSqlRequest = (): DataQueryRequest<CHQuery> => ({
    requestId: '',
    interval: '',
    intervalMs: 0,
    range: {} as any,
    scopedVars: {} as any,
    targets: [
      {
        refId: 'A',
        editorType: EditorType.SQL,
        pluginVersion: '',
        rawSql: '',
      } as CHQuery,
    ],
    timezone: '',
    app: CoreApp.Explore,
    startTime: 0,
  });

  const makeBuilderTraceRequest = (): DataQueryRequest<CHQuery> => ({
    requestId: '',
    interval: '',
    intervalMs: 0,
    range: {} as any,
    scopedVars: {} as any,
    targets: [
      {
        refId: 'A',
        editorType: EditorType.Builder,
        builderOptions: { database: '', table: '', queryType: QueryType.Traces, meta: { tagsAreJSON: true } },
        pluginVersion: '',
        rawSql: '',
      } as CHBuilderQuery,
    ],
    timezone: '',
    app: CoreApp.Explore,
    startTime: 0,
  });

  const makeResponse = (tagsValue: unknown, serviceTagsValue: unknown): DataQueryResponse => ({
    data: [
      {
        refId: 'A',
        fields: [
          { name: 'tags', values: [tagsValue], type: FieldType.other, config: {} } as Field,
          { name: 'serviceTags', values: [serviceTagsValue], type: FieldType.other, config: {} } as Field,
          { name: 'traceID', values: ['abc'], type: FieldType.string, config: {} } as Field,
        ],
        length: 1,
      } as DataFrame,
    ],
  });

  it('converts a plain JSON object to [{key,value}] array (raw SQL)', () => {
    const res = makeResponse({ 'http.method': 'GET', 'db.system': 'redis' }, { 'service.name': 'api' });
    transformTraceTagFields(makeRawSqlRequest(), res);
    expect(res.data[0].fields[0].values).toEqual([
      [
        { key: 'http.method', value: 'GET' },
        { key: 'db.system', value: 'redis' },
      ],
    ]);
    expect(res.data[0].fields[1].values).toEqual([[{ key: 'service.name', value: 'api' }]]);
  });

  it('leaves an already-correct [{key,value}] array untouched (raw SQL)', () => {
    const existing = [{ key: 'http.method', value: 'GET' }];
    const res = makeResponse(existing, []);
    transformTraceTagFields(makeRawSqlRequest(), res);
    expect(res.data[0].fields[0].values).toEqual([existing]);
  });

  it('leaves null values untouched (raw SQL)', () => {
    const res = makeResponse(null, null);
    transformTraceTagFields(makeRawSqlRequest(), res);
    expect(res.data[0].fields[0].values).toEqual([null]);
  });

  it('does not touch unrelated fields (raw SQL)', () => {
    const res = makeResponse({}, {});
    transformTraceTagFields(makeRawSqlRequest(), res);
    const traceField = res.data[0].fields.find((f: Field) => f.name === 'traceID');
    expect(traceField?.values).toEqual(['abc']);
  });

  it('stringifies non-string values (raw SQL)', () => {
    const res = makeResponse({ count: 42 }, {});
    transformTraceTagFields(makeRawSqlRequest(), res);
    expect(res.data[0].fields[0].values).toEqual([[{ key: 'count', value: '42' }]]);
  });

  it('flattens nested objects returned by ClickHouse JSON type (raw SQL)', () => {
    // ClickHouse JSON type interprets "http.method" as a nested path and returns
    // {"http":{"method":"GET","status_code":"200"}} instead of {"http.method":"GET"}.
    const nested = {
      http: { method: 'GET', status_code: '200' },
      service: { name: 'api' },
    };
    const res = makeResponse(nested, { deployment: { environment: 'prod' } });
    transformTraceTagFields(makeRawSqlRequest(), res);
    expect(res.data[0].fields[0].values).toEqual([
      [
        { key: 'http.method', value: 'GET' },
        { key: 'http.status_code', value: '200' },
        { key: 'service.name', value: 'api' },
      ],
    ]);
    expect(res.data[0].fields[1].values).toEqual([[{ key: 'deployment.environment', value: 'prod' }]]);
  });

  it('transforms plain objects from Map columns the same as JSON columns (auto-detects from values)', () => {
    const res = makeResponse({ 'http.method': 'GET' }, {});
    transformTraceTagFields(makeRawSqlRequest(), res);
    expect(res.data[0].fields[0].values).toEqual([[{ key: 'http.method', value: 'GET' }]]);
  });

  it('transforms builder query frames when tags are raw JSON objects (JSON-type columns)', () => {
    // JSON-type tag columns now return the raw column; the transform handles the conversion
    // for both builder and raw SQL queries. Already-correct [{key,value}] arrays (from
    // Map-type columns) are left untouched by the Array.isArray check inside the transform.
    const nested = { http: { method: 'GET' } };
    const res = makeResponse(nested, {});
    transformTraceTagFields(makeBuilderTraceRequest(), res);
    expect(res.data[0].fields[0].values).toEqual([[{ key: 'http.method', value: 'GET' }]]);
  });

  it('leaves already-correct [{key,value}] arrays untouched for builder queries (Map-type columns)', () => {
    const existing = [{ key: 'http.method', value: 'GET' }];
    const res = makeResponse(existing, []);
    transformTraceTagFields(makeBuilderTraceRequest(), res);
    expect(res.data[0].fields[0].values).toEqual([existing]);
  });
});

describe('dataFrameHasLogLabelWithName', () => {
  it('should return false for undefined dataframe', () => {
    expect(dataFrameHasLogLabelWithName(undefined, 'testLabel')).toBe(false);
  });

  it('should return false for dataframe with no fields', () => {
    const frame: DataFrame = { fields: [] } as any as DataFrame;
    expect(dataFrameHasLogLabelWithName(frame, 'testLabel')).toBe(false);
  });

  it('should return false when log labels field is not present', () => {
    const frame: DataFrame = {
      fields: [{ name: 'otherField', values: [{}] }],
    } as any as DataFrame;
    expect(dataFrameHasLogLabelWithName(frame, 'testLabel')).toBe(false);
  });

  it('should return false when log labels field has no values', () => {
    const frame: DataFrame = {
      fields: [{ name: labelsFieldName, values: [] }],
    } as any as DataFrame;
    expect(dataFrameHasLogLabelWithName(frame, 'testLabel')).toBe(false);
  });

  it('should return false when log labels field value is null', () => {
    const frame: DataFrame = {
      fields: [{ name: labelsFieldName, values: [null] }],
    } as any as DataFrame;
    expect(dataFrameHasLogLabelWithName(frame, 'testLabel')).toBe(false);
  });

  it('should return true when log label with given name exists', () => {
    const frame: DataFrame = {
      fields: [
        {
          name: labelsFieldName,
          values: [{ testLabel: 'value', otherLabel: 'otherValue' }],
        },
      ],
    } as any as DataFrame;
    expect(dataFrameHasLogLabelWithName(frame, 'testLabel')).toBe(true);
  });

  it('should return false when log label with given name does not exist', () => {
    const frame: DataFrame = {
      fields: [
        {
          name: labelsFieldName,
          values: [{ otherLabel: 'value' }],
        },
      ],
    } as any as DataFrame;
    expect(dataFrameHasLogLabelWithName(frame, 'testLabel')).toBe(false);
  });
});
