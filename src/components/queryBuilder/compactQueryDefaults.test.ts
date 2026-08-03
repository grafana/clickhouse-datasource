import { Datasource } from 'data/CHDatasource';
import {
  appendAdditionalLogColumns,
  buildCompactQueryDefaults,
  isCompactQueryTypeMismatch,
  isDefaultCompactQuery,
  shouldBuildCompactQueryDefaults,
} from './compactQueryDefaults';
import {
  BuilderMode,
  ColumnHint,
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
    mockDs.shouldIncludeAllLogColumns = jest.fn(() => false);
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
  const makeDatasource = (opts: { includeAll?: boolean; additional?: string[] }): Datasource => {
    const ds = {} as Datasource;
    ds.shouldIncludeAllLogColumns = jest.fn(() => Boolean(opts.includeAll));
    ds.getAdditionalLogColumns = jest.fn(() => opts.additional ?? []);
    return ds;
  };
  const col = (name: string, type = 'String'): TableColumn => ({ name, type, picklistValues: [] });

  describe('include all columns', () => {
    it('adds plain scalar columns and skips collection, JSON, __-prefixed, and date/time columns', () => {
      const ds = makeDatasource({ includeAll: true });
      const allColumns = [
        col('ServiceName', 'LowCardinality(String)'),
        col('StatusCode', 'UInt16'),
        col('ResourceAttributes', 'Map(String, String)'),
        col('Tags', 'Array(String)'),
        col('Payload', 'JSON'),
        col('DynamicPayload', 'JSON(max_dynamic_paths=100)'),
        col('__internal', 'String'),
        col('Timestamp', 'DateTime64(9)'),
        col('EventDate', 'Date'),
      ];
      const columns: SelectedColumn[] = [];
      const included = new Set<string>();

      appendAdditionalLogColumns(ds, allColumns, columns, included);

      expect(columns.map((c) => c.name)).toEqual(['ServiceName', 'StatusCode']);
    });

    it('skips columns that are already selected', () => {
      const ds = makeDatasource({ includeAll: true });
      const allColumns = [col('ServiceName'), col('SpanId')];
      const columns: SelectedColumn[] = [{ name: 'ServiceName' }];
      const included = new Set<string>(['ServiceName']);

      appendAdditionalLogColumns(ds, allColumns, columns, included);

      expect(columns.map((c) => c.name)).toEqual(['ServiceName', 'SpanId']);
    });

    it('adds nothing when the option is off and no explicit list is configured', () => {
      const ds = makeDatasource({ includeAll: false });
      const columns: SelectedColumn[] = [];
      const included = new Set<string>();

      appendAdditionalLogColumns(ds, [col('ServiceName'), col('SpanId')], columns, included);

      expect(columns).toHaveLength(0);
    });
  });

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
