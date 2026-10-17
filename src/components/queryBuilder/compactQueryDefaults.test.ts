import { Datasource } from 'data/CHDatasource';
import {
  appendAdditionalLogColumns,
  buildCompactQueryDefaults,
  convertCarriedOverQuery,
  getSingleTableLocation,
  isCompactQueryTypeMismatch,
  isDefaultCompactQuery,
  isQueryFromOtherSingleTableSource,
  isSameQueryOptions,
  shouldBuildCompactQueryDefaults,
  withDatasourceUid,
} from './compactQueryDefaults';
import {
  getDefaultLogsFilters,
  getDefaultLogsOrderBy,
  getDefaultTraceFilters,
  getDefaultTraceOrderBy,
} from './defaultQueryOptions';
import {
  BuilderMode,
  ColumnHint,
  Filter,
  FilterOperator,
  OrderByDirection,
  QueryBuilderOptions,
  QueryType,
  SelectedColumn,
  TableColumn,
} from 'types/queryBuilder';
import { SignalType } from 'types/config';
import otel from 'otel';

const defaultOptions: QueryBuilderOptions = {
  database: '',
  table: '',
  queryType: QueryType.Table,
  mode: BuilderMode.List,
  columns: [],
  filters: [],
};

const emptyMismatchedOptions: QueryBuilderOptions = {
  database: 'logs_db',
  table: 'logs_table',
  queryType: QueryType.Logs,
  mode: BuilderMode.List,
  columns: [],
  filters: [],
};

const authoredTimeSeriesOptions: QueryBuilderOptions = {
  database: 'metrics_db',
  table: 'requests',
  queryType: QueryType.TimeSeries,
  mode: BuilderMode.Trend,
  columns: [{ name: 'created_at', hint: ColumnHint.Time }, { name: 'requests_count' }],
  filters: [],
  orderBy: [{ name: 'created_at', dir: OrderByDirection.ASC }],
  limit: 100,
};

const authoredLogsOptions: QueryBuilderOptions = {
  database: 'otel_v2',
  table: 'otel_logs',
  queryType: QueryType.Logs,
  mode: BuilderMode.List,
  columns: [
    { name: 'Timestamp', hint: ColumnHint.Time },
    { name: 'Body', hint: ColumnHint.LogMessage },
  ],
  filters: [],
};

describe('isDefaultCompactQuery', () => {
  it('is true for a fresh default query', () => {
    expect(isDefaultCompactQuery(defaultOptions)).toBe(true);
  });

  it('is false for a query with user content', () => {
    expect(isDefaultCompactQuery(authoredTimeSeriesOptions)).toBe(false);
  });
});

describe('isCompactQueryTypeMismatch', () => {
  it('is true when the query type does not match the signal type', () => {
    expect(isCompactQueryTypeMismatch(authoredTimeSeriesOptions, 'logs')).toBe(true);
    expect(isCompactQueryTypeMismatch(authoredLogsOptions, 'traces')).toBe(true);
  });

  it('is false when the query type matches the signal type', () => {
    expect(isCompactQueryTypeMismatch(authoredLogsOptions, 'logs')).toBe(false);
  });
});

describe('shouldBuildCompactQueryDefaults', () => {
  const cases: Array<{
    name: string;
    builderOptions: QueryBuilderOptions;
    signalType: SignalType;
    expected: boolean;
  }> = [
    {
      name: 'builds defaults for a fresh default query',
      builderOptions: defaultOptions,
      signalType: 'logs',
      expected: true,
    },
    {
      name: 'builds defaults for a mismatched query without user content',
      builderOptions: emptyMismatchedOptions,
      signalType: 'traces',
      expected: true,
    },
    {
      name: 'preserves an authored query whose type does not match the signal type',
      builderOptions: authoredTimeSeriesOptions,
      signalType: 'logs',
      expected: false,
    },
    {
      name: 'preserves an authored query whose type matches the signal type',
      builderOptions: authoredLogsOptions,
      signalType: 'logs',
      expected: false,
    },
  ];

  it.each(cases)('$name', ({ builderOptions, signalType, expected }) => {
    expect(shouldBuildCompactQueryDefaults(builderOptions, signalType)).toBe(expected);
  });
});

describe('single-table location', () => {
  // A single-table data source for one signal, with only the fields the location lookup reads.
  const createSingleTableDatasource = (config: {
    uid?: string;
    logs?: { database?: string; table?: string };
    traces?: { database?: string; table?: string };
    defaultDatabase?: string;
    defaultTable?: string;
  }): Datasource => {
    const mockDs = { uid: config.uid ?? 'this-ds' } as Datasource;
    mockDs.getDefaultLogsDatabase = jest.fn(() => config.logs?.database);
    mockDs.getDefaultLogsTable = jest.fn(() => config.logs?.table);
    mockDs.getDefaultTraceDatabase = jest.fn(() => config.traces?.database);
    mockDs.getDefaultTraceTable = jest.fn(() => config.traces?.table);
    mockDs.getDefaultDatabase = jest.fn(() => config.defaultDatabase || '');
    mockDs.getDefaultTable = jest.fn(() => config.defaultTable);
    return mockDs;
  };

  const logsDs = createSingleTableDatasource({ logs: { database: 'otel_v2', table: 'otel_logs' } });
  const tracesDs = createSingleTableDatasource({ traces: { database: 'otel_v2', table: 'otel_traces' } });

  const compactTracesOptions: QueryBuilderOptions = {
    database: 'otel_v2',
    table: 'otel_traces',
    queryType: QueryType.Traces,
    columns: [{ name: 'TraceId', hint: ColumnHint.TraceId }],
    filters: [],
  };

  describe('getSingleTableLocation', () => {
    it('reads the signal config first', () => {
      expect(getSingleTableLocation(logsDs, 'logs')).toEqual({ database: 'otel_v2', table: 'otel_logs' });
      expect(getSingleTableLocation(tracesDs, 'traces')).toEqual({ database: 'otel_v2', table: 'otel_traces' });
    });

    it('falls back to the default database and table', () => {
      const ds = createSingleTableDatasource({ defaultDatabase: 'default', defaultTable: 'events' });

      expect(getSingleTableLocation(ds, 'logs')).toEqual({ database: 'default', table: 'events' });
    });

    it('returns an empty table when none is configured', () => {
      expect(getSingleTableLocation(createSingleTableDatasource({}), 'traces')).toEqual({ database: '', table: '' });
    });
  });

  describe('isQueryFromOtherSingleTableSource', () => {
    const cases: Array<{
      name: string;
      builderOptions: QueryBuilderOptions;
      datasource: Datasource;
      signalType: SignalType;
      expected: boolean;
    }> = [
      {
        name: 'is false for a query built for this data source',
        builderOptions: authoredLogsOptions,
        datasource: logsDs,
        signalType: 'logs',
        expected: false,
      },
      {
        name: 'is true for a logs query arriving at a traces data source',
        builderOptions: withDatasourceUid(authoredLogsOptions, 'other-ds'),
        datasource: tracesDs,
        signalType: 'traces',
        expected: true,
      },
      {
        name: 'is true for a traces query arriving at a logs data source',
        builderOptions: withDatasourceUid(compactTracesOptions, 'other-ds'),
        datasource: logsDs,
        signalType: 'logs',
        expected: true,
      },
      {
        name: 'is true for a logs query that reads another logs table',
        builderOptions: withDatasourceUid(authoredLogsOptions, 'other-ds'),
        datasource: createSingleTableDatasource({ logs: { database: 'otel_v2', table: 'app_logs' } }),
        signalType: 'logs',
        expected: true,
      },
      {
        name: 'is true for a logs query that reads the same table name in another database',
        builderOptions: withDatasourceUid(authoredLogsOptions, 'other-ds'),
        datasource: createSingleTableDatasource({ logs: { database: 'otel_staging', table: 'otel_logs' } }),
        signalType: 'logs',
        expected: true,
      },
      {
        name: 'is false for a query that records no data source, such as a panel opened in Explore, a history entry or a shared link',
        builderOptions: authoredLogsOptions,
        datasource: createSingleTableDatasource({ logs: { database: 'otel_v2', table: 'app_logs' } }),
        signalType: 'logs',
        expected: false,
      },
      {
        name: 'is false for a query recorded as this data source, even when it reads another table',
        builderOptions: withDatasourceUid(authoredLogsOptions, 'this-ds'),
        datasource: createSingleTableDatasource({ logs: { database: 'otel_v2', table: 'app_logs' } }),
        signalType: 'logs',
        expected: false,
      },
      {
        name: 'is false for a query from another data source that already fits this one',
        builderOptions: withDatasourceUid(authoredLogsOptions, 'other-ds'),
        datasource: logsDs,
        signalType: 'logs',
        expected: false,
      },
      {
        name: 'is false when the data source does not configure a table',
        builderOptions: compactTracesOptions,
        datasource: createSingleTableDatasource({}),
        signalType: 'logs',
        expected: false,
      },
      {
        name: 'is false for a time series query, which a single-table data source never builds',
        builderOptions: authoredTimeSeriesOptions,
        datasource: logsDs,
        signalType: 'logs',
        expected: false,
      },
      {
        name: 'is false for a fresh default query',
        builderOptions: defaultOptions,
        datasource: tracesDs,
        signalType: 'traces',
        expected: false,
      },
      {
        name: 'is false for a query opened from a trace link',
        builderOptions: {
          ...compactTracesOptions,
          meta: { minimized: true, isTraceIdMode: true, traceId: 'abc' },
        },
        datasource: logsDs,
        signalType: 'logs',
        expected: false,
      },
      {
        name: 'is false for a link query after the user expands it',
        builderOptions: { ...compactTracesOptions, meta: { minimized: false, isTraceIdMode: true } },
        datasource: logsDs,
        signalType: 'logs',
        expected: false,
      },
    ];

    it.each(cases)('$name', ({ builderOptions, datasource, signalType, expected }) => {
      expect(isQueryFromOtherSingleTableSource(builderOptions, datasource, signalType)).toBe(expected);
    });
  });

  describe('recorded owner', () => {
    it('records the data source and keeps the rest of the meta', () => {
      const options = withDatasourceUid({ ...authoredLogsOptions, meta: { otelEnabled: true } }, 'this-ds');

      expect(options.meta).toEqual({ otelEnabled: true, datasourceUid: 'this-ds' });
    });

    it('compares options without the recorded data source', () => {
      expect(isSameQueryOptions(withDatasourceUid(compactTracesOptions, 'this-ds'), compactTracesOptions)).toBe(true);
      expect(
        isSameQueryOptions(withDatasourceUid(compactTracesOptions, 'this-ds'), { ...compactTracesOptions, limit: 5 })
      ).toBe(false);
    });
  });
});

describe('convertCarriedOverQuery', () => {
  const columnsOf = (types: Record<string, string>): TableColumn[] =>
    Object.entries(types).map(([name, type]) => ({ name, type, picklistValues: [] }));

  // Column layouts of the OTel collector's logs and traces tables.
  const otelLogsColumns = columnsOf({
    Timestamp: 'DateTime64(9)',
    TraceId: 'String',
    SpanId: 'String',
    SeverityText: 'LowCardinality(String)',
    ServiceName: 'LowCardinality(String)',
    Body: 'String',
    ResourceAttributes: 'Map(LowCardinality(String), String)',
    LogAttributes: 'Map(LowCardinality(String), String)',
  });
  const otelTracesColumns = columnsOf({
    Timestamp: 'DateTime64(9)',
    TraceId: 'String',
    SpanId: 'String',
    ParentSpanId: 'String',
    SpanName: 'LowCardinality(String)',
    ServiceName: 'LowCardinality(String)',
    Duration: 'UInt64',
    StatusCode: 'LowCardinality(String)',
    ResourceAttributes: 'Map(String, String)',
    SpanAttributes: 'Map(String, String)',
  });

  const logsDefaults: QueryBuilderOptions = {
    database: 'otel',
    table: 'otel_logs',
    queryType: QueryType.Logs,
    mode: BuilderMode.List,
    columns: [
      { name: 'Timestamp', hint: ColumnHint.Time },
      { name: 'Body', hint: ColumnHint.LogMessage },
      { name: 'SeverityText', hint: ColumnHint.LogLevel },
      { name: 'TraceId', hint: ColumnHint.TraceId },
    ],
    filters: getDefaultLogsFilters(),
    orderBy: getDefaultLogsOrderBy(),
    limit: 1000,
    meta: { otelEnabled: true, otelVersion: 'latest' },
  };
  const tracesDefaults: QueryBuilderOptions = {
    database: 'otel',
    table: 'otel_traces',
    queryType: QueryType.Traces,
    columns: [
      { name: 'Timestamp', hint: ColumnHint.Time },
      { name: 'TraceId', hint: ColumnHint.TraceId },
      { name: 'ServiceName', hint: ColumnHint.TraceServiceName },
    ],
    filters: getDefaultTraceFilters(),
    orderBy: getDefaultTraceOrderBy(),
    limit: 1000,
    meta: { otelEnabled: true, otelVersion: 'latest' },
  };

  const columnFilter = (key: string, type: string, value: string, extra: Partial<Filter> = {}): Filter =>
    ({ filterType: 'custom', key, type, operator: FilterOperator.Equals, value, condition: 'AND', ...extra }) as Filter;

  const serviceFilter = columnFilter('ServiceName', 'LowCardinality(String)', 'checkout');
  const namespaceFilter = columnFilter('ResourceAttributes', 'Map(LowCardinality(String), String)', 'prod', {
    mapKey: 'k8s.namespace.name',
  });
  const severityFilter = columnFilter('SeverityText', 'LowCardinality(String)', 'ERROR');
  const logAttributeFilter = columnFilter('LogAttributes', 'Map(LowCardinality(String), String)', 'GET', {
    mapKey: 'http.method',
  });

  const carriedLogsQuery: QueryBuilderOptions = {
    ...logsDefaults,
    filters: [...getDefaultLogsFilters(), serviceFilter, namespaceFilter, severityFilter, logAttributeFilter],
    meta: { ...logsDefaults.meta, logMessageLike: 'timeout' },
  };

  it('keeps the filters on columns the traces table also has when converting logs to traces', () => {
    const converted = convertCarriedOverQuery(carriedLogsQuery, tracesDefaults, otelTracesColumns);

    expect(converted).toEqual({
      ...tracesDefaults,
      filters: [...getDefaultTraceFilters(), serviceFilter, namespaceFilter],
    });
  });

  it('keeps the filters on columns the logs table also has when converting traces to logs', () => {
    const carriedTracesQuery: QueryBuilderOptions = {
      ...tracesDefaults,
      filters: [
        ...getDefaultTraceFilters(),
        serviceFilter,
        columnFilter('SpanName', 'LowCardinality(String)', 'GET /cart'),
        columnFilter('StatusCode', 'LowCardinality(String)', 'Error'),
      ],
    };

    const converted = convertCarriedOverQuery(carriedTracesQuery, logsDefaults, otelLogsColumns);

    expect(converted).toEqual({ ...logsDefaults, filters: [...getDefaultLogsFilters(), serviceFilter] });
  });

  it('keeps every filter and the search text when all of them fit another logs table', () => {
    const editedLevelFilter = {
      ...getDefaultLogsFilters()[1],
      operator: FilterOperator.Equals,
      value: 'error',
    } as Filter;
    const carried: QueryBuilderOptions = {
      ...carriedLogsQuery,
      filters: [getDefaultLogsFilters()[0], editedLevelFilter, serviceFilter],
    };
    const otherLogsTable = { ...logsDefaults, table: 'app_logs' };

    const converted = convertCarriedOverQuery(carried, otherLogsTable, otelLogsColumns);

    expect(converted).toEqual({
      ...otherLogsTable,
      filters: carried.filters,
      meta: { ...otherLogsTable.meta, logMessageLike: 'timeout' },
    });
  });

  it('keeps the fitting filters and the search text when another logs table lacks some columns', () => {
    const tableWithoutLogAttributes = otelLogsColumns.filter((column) => column.name !== 'LogAttributes');

    const converted = convertCarriedOverQuery(carriedLogsQuery, logsDefaults, tableWithoutLogAttributes);

    expect(converted.filters).toEqual([...getDefaultLogsFilters(), serviceFilter, namespaceFilter, severityFilter]);
    expect(converted.meta?.logMessageLike).toBe('timeout');
  });

  it('drops a filter whose column has a different kind of type in the new table', () => {
    const jsonAttributesTable = columnsOf({ ServiceName: 'String', ResourceAttributes: 'JSON' });

    const converted = convertCarriedOverQuery(carriedLogsQuery, tracesDefaults, jsonAttributesTable);

    expect(converted.filters).toEqual([...getDefaultTraceFilters(), serviceFilter]);
  });

  it('matches column types through Nullable and LowCardinality wrappers', () => {
    const wrapped = columnFilter('ScopeVersion', 'LowCardinality(Nullable(String))', '1.2.0');
    const carried = { ...carriedLogsQuery, filters: [wrapped] };

    const converted = convertCarriedOverQuery(carried, tracesDefaults, columnsOf({ ScopeVersion: 'String' }));

    expect(converted.filters).toEqual([...getDefaultTraceFilters(), wrapped]);
  });

  it('keeps a trace ID role filter across signals only when the new defaults have a trace ID column', () => {
    const traceIdFilter = { ...columnFilter('', 'String', 'abc123'), hint: ColumnHint.TraceId } as Filter;
    const carried = { ...carriedLogsQuery, filters: [...getDefaultLogsFilters(), traceIdFilter] };
    const tracesWithoutTraceId = {
      ...tracesDefaults,
      columns: tracesDefaults.columns?.filter((column) => column.hint !== ColumnHint.TraceId),
    };

    expect(convertCarriedOverQuery(carried, tracesDefaults, otelTracesColumns).filters).toEqual([
      ...getDefaultTraceFilters(),
      traceIdFilter,
    ]);
    expect(convertCarriedOverQuery(carried, tracesWithoutTraceId, otelTracesColumns).filters).toEqual(
      getDefaultTraceFilters()
    );
  });

  it('carries no filters when some do not fit and the filters use OR', () => {
    const carried = {
      ...carriedLogsQuery,
      filters: [...getDefaultLogsFilters(), serviceFilter, { ...severityFilter, condition: 'OR' } as Filter],
    };

    const converted = convertCarriedOverQuery(carried, tracesDefaults, otelTracesColumns);

    expect(converted.filters).toEqual(getDefaultTraceFilters());
  });

  it('keeps OR filters as written when they all fit another table of the same signal', () => {
    const orFilters = [serviceFilter, { ...serviceFilter, value: 'cart', condition: 'OR' } as Filter];
    const carried = { ...carriedLogsQuery, filters: orFilters };

    const converted = convertCarriedOverQuery(carried, { ...logsDefaults, table: 'app_logs' }, otelLogsColumns);

    expect(converted.filters).toEqual(orFilters);
  });

  it('drops every column filter when the new table columns are unknown', () => {
    const converted = convertCarriedOverQuery(carriedLogsQuery, logsDefaults, []);

    expect(converted.filters).toEqual(getDefaultLogsFilters());
    expect(converted.meta?.logMessageLike).toBe('timeout');
  });
});

describe('buildCompactQueryDefaults', () => {
  // Mirrors Datasource.getDefaultLogsColumns for an OTel-enabled logs config.
  const createLogsDatasource = (otelVersion: string): Datasource => {
    const mockDs = {} as Datasource;
    mockDs.getDefaultLogsDatabase = jest.fn(() => 'otel');
    mockDs.getDefaultDatabase = jest.fn(() => 'default');
    mockDs.getDefaultLogsTable = jest.fn(() => 'otel_logs');
    mockDs.getDefaultTable = jest.fn(() => '');
    mockDs.getLogsOtelVersion = jest.fn(() => otelVersion);
    mockDs.getDefaultLogsColumns = jest.fn(
      () => otel.getVersion(otelVersion)?.logColumnMap || new Map<ColumnHint, string>()
    );
    mockDs.shouldSelectLogContextColumns = jest.fn(() => false);
    mockDs.getLogContextColumnNames = jest.fn(() => []);
    mockDs.getAdditionalLogColumns = jest.fn(() => []);
    return mockDs;
  };

  // otel_logs table created by clickhouseexporter before v0.151.0.
  const preV151ColumnNames = [
    'Timestamp',
    'TimestampTime',
    'TraceId',
    'SpanId',
    'SeverityText',
    'Body',
    'ResourceAttributes',
    'ScopeAttributes',
    'LogAttributes',
  ];

  // otel_logs table created by clickhouseexporter v0.151.0+, which dropped TimestampTime.
  const v151ColumnNames = preV151ColumnNames.filter((name) => name !== 'TimestampTime');

  const toColumns = (names: string[]): TableColumn[] =>
    names.map((name) => ({ name, type: 'String', picklistValues: [] }));
  const preV151Columns = toColumns(preV151ColumnNames);
  const v151Columns = toColumns(v151ColumnNames);

  it('resolves the pre-v0.151.0 log schema when otel version is "latest" and the table has TimestampTime', () => {
    const options = buildCompactQueryDefaults(createLogsDatasource('latest'), 'logs', '', preV151Columns);

    expect(options.columns).toContainEqual({ name: 'TimestampTime', hint: ColumnHint.FilterTime });
    expect(options.columns).toContainEqual({ name: 'Timestamp', hint: ColumnHint.Time });
  });

  it('resolves the latest log schema when otel version is "latest" and the table has no TimestampTime', () => {
    const options = buildCompactQueryDefaults(createLogsDatasource('latest'), 'logs', '', v151Columns);

    expect(options.columns).toContainEqual({ name: 'Timestamp', hint: ColumnHint.Time });
    expect(options.columns?.some((column) => column.hint === ColumnHint.FilterTime)).toBe(false);
  });

  it('keeps the static latest log schema when otel version is "latest" and no columns are available', () => {
    const options = buildCompactQueryDefaults(createLogsDatasource('latest'), 'logs', '', []);

    expect(options.columns).toContainEqual({ name: 'Timestamp', hint: ColumnHint.Time });
    expect(options.columns?.some((column) => column.hint === ColumnHint.FilterTime)).toBe(false);
  });

  it('bypasses detection when an explicit otel version is pinned', () => {
    const pinnedLatest = createLogsDatasource('1.30.0');
    const pinnedOlder = createLogsDatasource('1.29.0');

    // Pinned 1.30.0 keeps its FilterTime-less map even though the table has TimestampTime.
    const pinnedLatestOptions = buildCompactQueryDefaults(pinnedLatest, 'logs', '', preV151Columns);
    expect(pinnedLatestOptions.columns?.some((column) => column.hint === ColumnHint.FilterTime)).toBe(false);
    expect(pinnedLatest.getDefaultLogsColumns).toHaveBeenCalled();

    // Pinned 1.29.0 keeps its TimestampTime mapping even though the table lacks the column.
    const pinnedOlderOptions = buildCompactQueryDefaults(pinnedOlder, 'logs', '', v151Columns);
    expect(pinnedOlderOptions.columns).toContainEqual({ name: 'TimestampTime', hint: ColumnHint.FilterTime });
  });

  it('keeps the configured meta values when detection resolves an older schema', () => {
    const options = buildCompactQueryDefaults(createLogsDatasource('latest'), 'logs', '', preV151Columns);

    expect(options.meta?.otelEnabled).toBe(true);
    expect(options.meta?.otelVersion).toBe('latest');
  });
});

describe('appendAdditionalLogColumns', () => {
  const makeDatasource = (opts: { additional?: string[] }): Datasource => {
    const ds = {} as Datasource;
    ds.getAdditionalLogColumns = jest.fn(() => opts.additional ?? []);
    return ds;
  };

  describe('additional columns (explicit list)', () => {
    it('appends the configured columns in order', () => {
      const ds = makeDatasource({ additional: ['method', 'status'] });
      const columns: SelectedColumn[] = [];
      const included = new Set<string>();

      appendAdditionalLogColumns(ds, [], columns, included);

      expect(columns.map((c) => c.name)).toEqual(['method', 'status']);
    });

    it('skips an already-selected column and a map key whose base column is already selected', () => {
      const ds = makeDatasource({ additional: ['method', "ResourceAttributes['k8s.pod']"] });
      const columns: SelectedColumn[] = [{ name: 'method' }, { name: 'ResourceAttributes' }];
      const included = new Set<string>(['method', 'ResourceAttributes']);

      appendAdditionalLogColumns(ds, [], columns, included);

      // method is already present; the map key dedupes against its base ResourceAttributes column
      expect(columns.map((c) => c.name)).toEqual(['method', 'ResourceAttributes']);
    });
  });
});
