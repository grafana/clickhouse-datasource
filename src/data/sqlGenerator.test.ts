import { AggregateType, BuilderMode, ColumnHint, FilterOperator, OrderByDirection, QueryBuilderOptions, QueryType, SelectedColumn, TimeUnit } from 'types/queryBuilder';
import { _testExports, generateSql, getColumnByHint, getColumnIndexByHint, getColumnsByHints, isAggregateQuery } from './sqlGenerator';

describe('SQL Generator', () => {
  it('generates simple table query', () => {
    const opts: QueryBuilderOptions = {
      database: 'default',
      table: 'sample',
      queryType: QueryType.Table,
      columns: [
          { name: 'a', type: 'UInt64' },
          { name: 'b', type: 'String' },
          { name: 'c', type: 'String' },
      ],
      limit: 1000,
      filters: [
        {
          filterType: 'custom',
          key: 'b',
          type: 'String',
          condition: 'AND',
          operator: FilterOperator.IsNotNull
        }
      ],
      orderBy: []
    };

    const expectedSqlParts = [
      'SELECT a, b, c FROM "default"."sample"',
      'WHERE ( b IS NOT NULL ) LIMIT 1000'
    ];

    const sql = generateSql(opts);
    expect(sql).toEqual(expectedSqlParts.join(' '));
  });

  it('generates aggregate table query', () => {
    const opts: QueryBuilderOptions = {
      database: 'default',
      table: 'sample',
      queryType: QueryType.Table,
      mode: BuilderMode.Aggregate,
      columns: [
          { name: 'a', type: 'DateTime' },
          { name: 'b', type: 'String' },
          { name: 'c', type: 'String' },
      ],
      aggregates: [
        { aggregateType: AggregateType.Count, column: '*', alias: 'd' }
      ],
      limit: 1000,
      filters: [
        {
          filterType: 'custom',
          key: 'b',
          type: 'String',
          condition: 'AND',
          operator: FilterOperator.IsNotNull
        }
      ],
      groupBy: ['a'],
      orderBy: []
    };

    const expectedSqlParts = [
      'SELECT a, b, c, count(*) as d FROM "default"."sample"',
      'WHERE ( b IS NOT NULL ) GROUP BY a LIMIT 1000'
    ];

    const sql = generateSql(opts);
    expect(sql).toEqual(expectedSqlParts.join(' '));
  });

  it('generates logs query', () => {
    const opts: QueryBuilderOptions = {
      database: 'default',
      table: 'logs',
      queryType: QueryType.Logs,
      columns: [
          { name: 'log_ts', type: 'DateTime', hint: ColumnHint.Time },
          { name: 'log_level', type: 'String', hint: ColumnHint.LogLevel },
          { name: 'log_body', type: 'String', hint: ColumnHint.LogMessage },
      ],
      limit: 1000,
      filters: [
        {
          filterType: 'custom',
          type: 'datetime',
          key: '',
          condition: 'AND',
          hint: ColumnHint.Time,
          operator: FilterOperator.WithInGrafanaTimeRange
        },
        {
          filterType: 'custom',
          type: 'String',
          key: '',
          value: 'error',
          condition: 'AND',
          hint: ColumnHint.LogLevel,
          operator: FilterOperator.Equals
        }
      ],
      orderBy: [{ name: '', hint: ColumnHint.Time, dir: OrderByDirection.DESC }]
    };

    const expectedSqlParts = [
      'SELECT log_ts as "timestamp", log_body as "body", log_level as "level"',
      'FROM "default"."logs"',
      'WHERE ( timestamp >= $__fromTime AND timestamp <= $__toTime )',
      'AND ( level = \'error\' )',
      'ORDER BY timestamp DESC LIMIT 1000'
    ];

    const sql = generateSql(opts);
    expect(sql).toEqual(expectedSqlParts.join(' '));
  });

  it('generates simple time series query', () => {
    const opts: QueryBuilderOptions = {
      database: 'default',
      table: 'time_data',
      queryType: QueryType.TimeSeries,
      columns: [
          { name: 'time_field', type: 'DateTime', hint: ColumnHint.Time },
          { name: 'number_field', type: 'UInt64' },
      ],
      limit: 100,
      filters: [
        {
          filterType: 'custom',
          key: 'number_field',
          type: 'UInt64',
          condition: 'AND',
          operator: FilterOperator.GreaterThan,
          value: 0
        }
      ],
      orderBy: [{ name: '', hint: ColumnHint.Time, dir: OrderByDirection.ASC }]
    };
    const expectedSqlParts = [
      'SELECT time_field as "time", number_field',
      'FROM "default"."time_data" WHERE ( number_field > 0 )',
      'ORDER BY time ASC LIMIT 100'
    ];

    const sql = generateSql(opts);
    expect(sql).toEqual(expectedSqlParts.join(' '));
  });

  it('generates aggregate time series query', () => {
    const opts: QueryBuilderOptions = {
      database: 'default',
      table: 'time_data',
      queryType: QueryType.TimeSeries,
      columns: [
          { name: 'time_field', type: 'DateTime', hint: ColumnHint.Time },
          { name: 'number_field', type: 'UInt64' },
      ],
      limit: 100,
      aggregates: [{ aggregateType: AggregateType.Sum, column: 'number_field', alias: 'total' }],
      filters: [
        {
          filterType: 'custom',
          key: 'number_field',
          type: 'UInt64',
          condition: 'AND',
          operator: FilterOperator.GreaterThan,
          value: 0
        }
      ],
      orderBy: [{ name: '', hint: ColumnHint.Time, dir: OrderByDirection.ASC }]
    };
    const expectedSqlParts = [
      'SELECT time_field as "time", number_field, sum(number_field) as total',
      'FROM "default"."time_data" WHERE ( number_field > 0 )',
      'GROUP BY time ORDER BY time ASC LIMIT 100'
    ];

    const sql = generateSql(opts);
    expect(sql).toEqual(expectedSqlParts.join(' '));
  });

  it('generates trace ID query without OTel enabled', () => {
    const opts: QueryBuilderOptions = {
      database: 'default',
      table: 'otel_traces',
      queryType: QueryType.Traces,
      columns: [
        { name: 'TraceId', type: 'String', hint: ColumnHint.TraceId },
        { name: 'SpanId', type: 'String', hint: ColumnHint.TraceSpanId },
        { name: 'ParentSpanId', type: 'String', hint: ColumnHint.TraceParentSpanId },
        { name: 'ServiceName', type: 'LowCardinality(String)', hint: ColumnHint.TraceServiceName },
        { name: 'SpanName', type: 'LowCardinality(String)', hint: ColumnHint.TraceOperationName },
        { name: 'Timestamp', type: 'DateTime64(9)', hint: ColumnHint.Time },
        { name: 'Duration', type: 'Int64', hint: ColumnHint.TraceDurationTime },
        { name: 'SpanAttributes', type: 'Map(LowCardinality(String), String)', hint: ColumnHint.TraceTags },
        { name: 'ResourceAttributes', type: 'Map(LowCardinality(String), String)', hint: ColumnHint.TraceServiceTags },
        { name: 'StatusCode', type: 'LowCardinality(String)', hint: ColumnHint.TraceStatusCode },
      ],
      filters: [],
      meta: {
        minimized: true,
        otelEnabled: false,
        otelVersion: 'latest',
        traceDurationUnit: TimeUnit.Nanoseconds,
        isTraceIdMode: true,
        traceId: 'abcdefg'
      },
      limit: 1000,
      orderBy: []
    };
    const expectedSqlParts = [
      'SELECT "TraceId" as traceID, "SpanId" as spanID, "ParentSpanId" as parentSpanID,',
      '"ServiceName" as serviceName, "SpanName" as operationName, multiply(toUnixTimestamp64Nano("Timestamp"), 0.000001) as startTime,',
      'multiply("Duration", 0.000001) as duration,',
      `arrayMap(key -> map('key', key, 'value',"SpanAttributes"[key]),`,
      `mapKeys("SpanAttributes")) as tags,`,
      `arrayMap(key -> map('key', key, 'value',"ResourceAttributes"[key]), mapKeys("ResourceAttributes")) as serviceTags,`,
      `if("StatusCode" IN ('Error', 'STATUS_CODE_ERROR'), 2, 0) as statusCode`,
      `FROM "default"."otel_traces" WHERE traceID = 'abcdefg'`,
      'LIMIT 1000'
    ];

    const sql = generateSql(opts);
    expect(sql).toEqual(expectedSqlParts.join(' '));
  });

  it('generates trace ID query with OTel enabled', () => {
    const opts: QueryBuilderOptions = {
      database: 'default',
      table: 'otel_traces',
      queryType: QueryType.Traces,
      columns: [
        { name: 'TraceId', type: 'String', hint: ColumnHint.TraceId },
        { name: 'SpanId', type: 'String', hint: ColumnHint.TraceSpanId },
        { name: 'ParentSpanId', type: 'String', hint: ColumnHint.TraceParentSpanId },
        { name: 'ServiceName', type: 'LowCardinality(String)', hint: ColumnHint.TraceServiceName },
        { name: 'SpanName', type: 'LowCardinality(String)', hint: ColumnHint.TraceOperationName },
        { name: 'Timestamp', type: 'DateTime64(9)', hint: ColumnHint.Time },
        { name: 'Duration', type: 'Int64', hint: ColumnHint.TraceDurationTime },
        { name: 'SpanAttributes', type: 'Map(LowCardinality(String), String)', hint: ColumnHint.TraceTags },
        { name: 'ResourceAttributes', type: 'Map(LowCardinality(String), String)', hint: ColumnHint.TraceServiceTags },
        { name: 'StatusCode', type: 'LowCardinality(String)', hint: ColumnHint.TraceStatusCode },
      ],
      filters: [],
      meta: {
        minimized: true,
        otelEnabled: true,
        otelVersion: 'latest',
        traceDurationUnit: TimeUnit.Nanoseconds,
        isTraceIdMode: true,
        traceId: 'abcdefg'
      },
      limit: 1000,
      orderBy: []
    };
    const expectedSqlParts = [
      `WITH 'abcdefg' as trace_id, (SELECT min(Start) FROM "default"."otel_traces_trace_id_ts" WHERE TraceId = trace_id) as trace_start,`,
      `(SELECT max(End) + 1 FROM "default"."otel_traces_trace_id_ts" WHERE TraceId = trace_id) as trace_end`,
      'SELECT "TraceId" as traceID, "SpanId" as spanID, "ParentSpanId" as parentSpanID,',
      '"ServiceName" as serviceName, "SpanName" as operationName, multiply(toUnixTimestamp64Nano("Timestamp"), 0.000001) as startTime,',
      'multiply("Duration", 0.000001) as duration,',
      `arrayMap(key -> map('key', key, 'value',"SpanAttributes"[key]),`,
      `mapKeys("SpanAttributes")) as tags,`,
      `arrayMap(key -> map('key', key, 'value',"ResourceAttributes"[key]), mapKeys("ResourceAttributes")) as serviceTags,`,
      `if("StatusCode" IN ('Error', 'STATUS_CODE_ERROR'), 2, 0) as statusCode`,
      `FROM "default"."otel_traces" WHERE traceID = trace_id AND "Timestamp" >= trace_start AND "Timestamp" <= trace_end`,
      'LIMIT 1000'
    ];

    const sql = generateSql(opts);
    expect(sql).toEqual(expectedSqlParts.join(' '));
  });

  it('generates trace search query', () => {
    const opts: QueryBuilderOptions = {
      database: 'default',
      table: 'otel_traces',
      queryType: QueryType.Traces,
      columns: [
        { name: 'TraceId', type: 'String', hint: ColumnHint.TraceId },
        { name: 'SpanId', type: 'String', hint: ColumnHint.TraceSpanId },
        { name: 'ParentSpanId', type: 'String', hint: ColumnHint.TraceParentSpanId },
        { name: 'ServiceName', type: 'LowCardinality(String)', hint: ColumnHint.TraceServiceName },
        { name: 'SpanName', type: 'LowCardinality(String)', hint: ColumnHint.TraceOperationName },
        { name: 'Timestamp', type: 'DateTime64(9)', hint: ColumnHint.Time },
        { name: 'Duration', type: 'Int64', hint: ColumnHint.TraceDurationTime },
        { name: 'SpanAttributes', type: 'Map(LowCardinality(String), String)', hint: ColumnHint.TraceTags },
        { name: 'ResourceAttributes', type: 'Map(LowCardinality(String), String)', hint: ColumnHint.TraceServiceTags },
      ],
      filters: [
        {
          condition: 'AND',
          filterType: 'custom',
          hint: ColumnHint.Time,
          key: '',
          operator: FilterOperator.WithInGrafanaTimeRange,
          type: 'datetime'
        },
        {
          condition: 'AND',
          filterType: 'custom',
          hint: ColumnHint.TraceParentSpanId,
          key: '',
          operator: FilterOperator.IsEmpty,
          type: 'string',
          value: ''
        },
        {
          condition: 'AND',
          filterType: 'custom',
          hint: ColumnHint.TraceDurationTime,
          key: '',
          operator: FilterOperator.GreaterThan,
          type: 'UInt64',
          value: 0
        },
        {
          condition: 'AND',
          filterType: 'custom',
          hint: ColumnHint.TraceServiceName,
          key: '',
          operator: FilterOperator.IsAnything,
          type: 'string',
          value: ''
        }
      ],
      meta: {
        otelEnabled: true,
        otelVersion: 'latest',
        traceDurationUnit: TimeUnit.Nanoseconds
      },
      limit: 1000,
      orderBy: [
        { name: '', hint: ColumnHint.Time, dir: OrderByDirection.DESC },
        { name: '', hint: ColumnHint.TraceDurationTime, dir: OrderByDirection.DESC }
      ]
    };
    const expectedSqlParts = [
      'SELECT "TraceId" as traceID, "ServiceName" as serviceName, "SpanName" as operationName,',
      '"Timestamp" as startTime, multiply("Duration", 0.000001) as duration',
      'FROM "default"."otel_traces" WHERE ( Timestamp >= $__fromTime AND Timestamp <= $__toTime )',
      'AND ( ParentSpanId = \'\' ) AND ( Duration > 0 ) ORDER BY Timestamp DESC, Duration DESC LIMIT 1000'
    ];

    const sql = generateSql(opts);
    expect(sql).toEqual(expectedSqlParts.join(' '));
  });
});

describe('isAggregateQuery', () => {
  it('returns true for aggregate query', () => {
    const builderOptions = { aggregates: [{ column: 'foo', aggregateType: AggregateType.Count }] } as QueryBuilderOptions;
    expect(isAggregateQuery(builderOptions)).toEqual(true);
  });
  it('returns false for query without aggregates', () => {
    const builderOptions = {} as QueryBuilderOptions;
    expect(isAggregateQuery(builderOptions)).toEqual(false);
  });
});

describe('getColumnByHint', () => {
  it('returns a selected column when present', () => {
    const testColumn = { name: 'time', type: 'datetime', hint: ColumnHint.Time };
    const builderOptions = { columns: [testColumn] } as QueryBuilderOptions;
    expect(getColumnByHint(builderOptions, ColumnHint.Time)).toMatchObject(testColumn);
  });
  it('returns a undefined when column not present', () => {
    const testColumn = { name: 'time', type: 'datetime' };
    const builderOptions = { columns: [testColumn] } as QueryBuilderOptions;
    expect(getColumnByHint(builderOptions, ColumnHint.Time)).toBeUndefined();
  });
});

describe('getColumnIndexByHint', () => {
  it('returns a selected column index when present', () => {
    const testColumns = [{}, { name: 'time', type: 'datetime', hint: ColumnHint.Time }];
    const builderOptions = { columns: testColumns } as QueryBuilderOptions;
    expect(getColumnIndexByHint(builderOptions, ColumnHint.Time)).toEqual(1);
  });
  it('returns -1 when column not present', () => {
    const testColumn = { name: 'time', type: 'datetime' };
    const builderOptions = { columns: [testColumn] } as QueryBuilderOptions;
    expect(getColumnIndexByHint(builderOptions, ColumnHint.Time)).toEqual(-1);
  });
});

describe('getColumnsByHints', () => {
  it('returns selected columns when present', () => {
    const testColumns = [
      { name: 'time', type: 'DateTime', hint: ColumnHint.Time },
      { name: 'level', type: 'String', hint: ColumnHint.LogLevel },
    ];
    const builderOptions = { columns: testColumns } as QueryBuilderOptions;
    expect(getColumnsByHints(builderOptions, [ColumnHint.Time, ColumnHint.LogLevel])).toHaveLength(2);
  });
  it('returns empty array when columns not present', () => {
    const testColumn = { name: 'time', type: 'datetime' };
    const builderOptions = { columns: [testColumn] } as QueryBuilderOptions;
    expect(getColumnsByHints(builderOptions, [ColumnHint.Time])).toHaveLength(0);
  });
});

describe('getColumnIdentifier', () => {
  const cases: Array<{ input: SelectedColumn, expected: string }> = [
    { input: { name: '' }, expected: `` },
    { input: { name: ' ' }, expected: `" "` },
    { input: { name: 'test' }, expected: `test` },
    { input: { name: 'test with space' }, expected: `"test with space"` },
    { input: { name: 'test with alias', alias: 'a' }, expected: `"test with alias" as "a"` },
    { input: { name: 'test_with_alias', alias: 'b' }, expected: `test_with_alias as "b"` },
    { input: { name: '"test" as a', alias: '' }, expected: `"test" as a` },
  ];

  it.each(cases)('returns correct identifier (case %#)', (c) => {
    expect(_testExports.getColumnIdentifier(c.input)).toEqual(c.expected);
  });
});

describe('getTableIdentifier', () => {
  const cases: Array<{ input: { database: string, table: string }, expected: string }> = [
    { input: { database: '', table: '' }, expected: '' },
    { input: { database: 'database', table: '' }, expected: '"database"' },
    { input: { database: 'database', table: 'table' }, expected: '"database"."table"' },
    { input: { database: '', table: 'table' }, expected: '"table"' },
  ];

  it.each(cases)('returns correct identifier (case %#)', (c) => {
    expect(_testExports.getTableIdentifier(c.input.database, c.input.table)).toEqual(c.expected);
  });
});

describe('escapeIdentifier', () => {
  const cases: Array<{ input: string, expected: string }> = [
    { input: '', expected: '' },
    { input: ' ', expected: `" "` },
    { input: 'x', expected: `"x"` },
    { input: 'x x x', expected: `"x x x"` },
    { input: undefined as any as string, expected: `` },
  ];

  it.each(cases)('returns escaped identifier (case %#)', (c) => {
    expect(_testExports.escapeIdentifier(c.input)).toEqual(c.expected);
  });
});

describe('escapeValue', () => {
  const cases: Array<{ input: string, expected: string }> = [
    { input: ``, expected: `''` },
    { input: ` `, expected: `' '` },
    { input: `$variable`, expected: `$variable` },
    { input: `\${variable}`, expected: `\${variable}` },
    { input: `\${variable:singlequote}`, expected: `\${variable:singlequote}` },
    { input: `\${variable.key}`, expected: `\${variable.key}` },
    { input: `\${variable.key:singlequote}`, expected: `\${variable.key:singlequote}` },
    { input: `count(column)`, expected: `count(column)` },
    { input: `'custom expression'`, expected: `'custom expression'` },
    { input: `plain text`, expected: `'plain text'` },
    { input: `text`, expected: `'text'` },
    { input: `"column"`, expected: `"column"` },
    { input: `invalid(`, expected: `invalid(` },
    { input: `invalid)`, expected: `invalid)` },
    { input: `$()'" `, expected: `$()'" ` },
  ];

  it.each(cases)('returns escaped value (case %#)', (c) => {
    expect(_testExports.escapeValue(c.input)).toEqual(c.expected);
  });
});

describe('concatQueryParts', () => {
  it('concats query parts', () => {
    const parts = [
      'SELECT',
      '', // empty strings should be ignored
      ' ', // spaces allowed
      '*',
      'FROM',
      'test'
    ];
    const sql = _testExports.concatQueryParts(parts);
    const expectedSql = 'SELECT   * FROM test'; // 3 spaces expected before *
    expect(sql).toEqual(expectedSql);
  });
});

describe('getOrderBy', () => {
  it('returns empty order By', () => {
    const options = {} as QueryBuilderOptions;
    const sql = _testExports.getOrderBy(options);
    const expectedSql = '';
    expect(sql).toEqual(expectedSql);
  });

  it('returns regular order By', () => {
    const options = {
      orderBy: [
        { name: 'normal', dir: OrderByDirection.ASC },
        { name: 'order', dir: OrderByDirection.DESC }
      ]
    } as QueryBuilderOptions;
    const sql = _testExports.getOrderBy(options);
    const expectedSql = 'normal ASC, order DESC';
    expect(sql).toEqual(expectedSql);
  });

  it('returns hinted order By', () => {
    const options = {
      columns: [{ name: 'hinted', hint: ColumnHint.Time }],
      orderBy: [
        { name: '', hint: ColumnHint.Time, dir: OrderByDirection.ASC },
        { name: 'normal', dir: OrderByDirection.ASC },
        { name: 'order', dir: OrderByDirection.DESC }
      ]
    } as QueryBuilderOptions;
    const sql = _testExports.getOrderBy(options);
    const expectedSql = 'hinted ASC, normal ASC, order DESC';
    expect(sql).toEqual(expectedSql);
  });
});

describe('getLimit', () => {
  const cases: Array<{ input: number | undefined, expected: string }> = [
    { input: undefined, expected: '' },
    { input: -1, expected: '' },
    { input: 0, expected: '' },
    { input: 1, expected: 'LIMIT 1' },
    { input: 100, expected: 'LIMIT 100' },
    { input: 1000, expected: 'LIMIT 1000' },
  ];

  it.each(cases)('returns correct LIMIT clause (case %#)', (c) => {
    expect(_testExports.getLimit(c.input)).toEqual(c.expected);
  });
});

describe('is*Type', () => {
  it.each<{ input: string, expected: boolean }>([
    { input: 'String', expected: true },
    { input: 'Nullable(String)', expected: true },
    { input: 'LowCardinality(Nullable(String))', expected: true },
    { input: 'FixedString(1)', expected: true },
    { input: 'LowCardinality(Nullable(FixedString(1)))', expected: true },
    { input: 'LowCardinality(FixedString(1))', expected: true },
    { input: 'Nullable(FixedString(1))', expected: true },
    { input: 'Array(String)', expected: false },
  ])('$input isStringType $expected', (c) => {
    expect(_testExports.isStringType(c.input)).toEqual(c.expected);
  });
});

describe('getFilters', () => {
  it('returns empty filter array', () => {
    const options = {} as QueryBuilderOptions;
    const sql = _testExports.getFilters(options);
    const expectedSql = '';
    expect(sql).toEqual(expectedSql);
  });

  it('returns correct IN clause for escaped and unescaped values', () => {
    const options = {
      filters: [
        {
          condition: 'AND',
          filterType: 'custom',
          key: 'col',
          operator: FilterOperator.In,
          type: 'string',
          value: '1, (2), 3, some string, \'another string\', someFunction(123), "column reference"'.split(',')
        }
      ]
    } as QueryBuilderOptions;
    const sql = _testExports.getFilters(options);
    const expectedSql = `( col IN ('1', (2), '3', 'some string', 'another string', someFunction(123), "column reference") )`;
    expect(sql).toEqual(expectedSql);
  });

  it('returns complex filter array', () => {
    const options = {
      columns: [{ name: 'hinted', hint: ColumnHint.Time }],
      filters: [
        {
          condition: 'AND',
          filterType: 'custom',
          hint: ColumnHint.Time,
          key: '',
          operator: FilterOperator.WithInGrafanaTimeRange,
          type: 'datetime'
        },
        {
          condition: 'AND',
          filterType: 'custom',
          key: 'text',
          operator: FilterOperator.IsEmpty,
          type: 'string',
          value: ''
        },
        {
          condition: 'AND',
          filterType: 'custom',
          key: 'volume',
          operator: FilterOperator.GreaterThan,
          type: 'UInt64',
          value: 0
        },
        {
          condition: 'AND',
          filterType: 'custom',
          key: 'should_be_excluded_from_filters',
          operator: FilterOperator.IsAnything,
          type: 'string',
          value: ''
        }
      ]
    } as QueryBuilderOptions;
    const sql = _testExports.getFilters(options);
    const expectedSql = '( hinted >= $__fromTime AND hinted <= $__toTime ) AND ( text = \'\' ) AND ( volume > 0 )';
    expect(sql).toEqual(expectedSql);
  });
});
