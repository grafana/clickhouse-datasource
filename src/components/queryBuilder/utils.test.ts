import { generateSql } from 'data/sqlGenerator';
import { getQueryOptionsFromSql, isDateTimeType, isDateType, isNumberType } from './utils';
import {
  AggregateType,
  BuilderMode,
  ColumnHint,
  DateFilterWithoutValue,
  FilterOperator,
  MultiFilter,
  OrderByDirection,
  QueryBuilderOptions,
  QueryType,
} from 'types/queryBuilder';
import { Datasource } from 'data/CHDatasource';
import otel from 'otel';

describe('isDateType', () => {
  it('returns true for Date type', () => {
    expect(isDateType('Date')).toBe(true);
    expect(isDateType('date')).toBe(true);
  });
  it('returns true for Nullable(Date) type', () => {
    expect(isDateType('Nullable(Date)')).toBe(true);
  });

  it('returns true for Date32 type', () => {
    expect(isDateType('Date32')).toBe(true);
    expect(isDateType('date32')).toBe(true);
  });
  it('returns true for Nullable(Date) type', () => {
    expect(isDateType('Nullable(Date32)')).toBe(true);
  });

  it('returns true for Datetime type', () => {
    expect(isDateType('Datetime')).toBe(true);
    expect(isDateType('datetime')).toBe(true);
    expect(isDateType("DateTime('Asia/Istanbul')")).toBe(true);
  });
  it('returns true for Nullable(Date) type', () => {
    expect(isDateType("Nullable(DateTime('Asia/Istanbul'))")).toBe(true);
  });

  it('returns true for Datetime64 type', () => {
    expect(isDateType('Datetime64(3)')).toBe(true);
    expect(isDateType('datetime64(3)')).toBe(true);
    expect(isDateType("Datetime64(3, 'Asia/Istanbul')")).toBe(true);
  });
  it('returns true for Nullable(Date) type', () => {
    expect(isDateType("Nullable(Datetime64(3, 'Asia/Istanbul'))")).toBe(true);
  });

  it('returns false for other types', () => {
    expect(isDateType('boolean')).toBe(false);
    expect(isDateType('Boolean')).toBe(false);
  });
});

describe('isDateTimeType', () => {
  it('returns true for DateTime type', () => {
    expect(isDateTimeType('DateTime')).toBe(true);
    expect(isDateTimeType('datetime')).toBe(true);
  });
  it('returns true for Nullable(DateTime) type', () => {
    expect(isDateTimeType('Nullable(DateTime)')).toBe(true);
  });
  it('returns true for DateTime64 type', () => {
    expect(isDateTimeType('DateTime64(3)')).toBe(true);
    expect(isDateTimeType('datetime64(3)')).toBe(true);
    expect(isDateTimeType("Datetime64(3, 'Asia/Istanbul')")).toBe(true);
  });
  it('returns true for Nullable(DateTime64(3)) type', () => {
    expect(isDateTimeType('Nullable(DateTime64(3))')).toBe(true);
    expect(isDateTimeType("Nullable(DateTime64(3, 'Asia/Istanbul'))")).toBe(true);
  });
  it('returns false for Date type', () => {
    expect(isDateTimeType('Date')).toBe(false);
    expect(isDateTimeType('date')).toBe(false);
    expect(isDateTimeType('Date32')).toBe(false);
    expect(isDateTimeType('date32')).toBe(false);
  });
  it('returns false for Nullable(Date) type', () => {
    expect(isDateTimeType('Nullable(Date)')).toBe(false);
    expect(isDateTimeType('Nullable(Date32)')).toBe(false);
    expect(isDateTimeType('nullable(date)')).toBe(false);
    expect(isDateTimeType('nullable(date32)')).toBe(false);
  });
  it('returns false for other types', () => {
    expect(isDateTimeType('boolean')).toBe(false);
    expect(isDateTimeType('String')).toBe(false);
  });
});

describe('isNumberType', () => {
  it('returns true for UInt* types', () => {
    expect(isNumberType('UInt8')).toBe(true);
    expect(isNumberType('UInt16')).toBe(true);
    expect(isNumberType('UInt32')).toBe(true);
    expect(isNumberType('UInt64')).toBe(true);
    expect(isNumberType('UInt128')).toBe(true);
    expect(isNumberType('UInt256')).toBe(true);
  });

  it('returns true for Int* types', () => {
    expect(isNumberType('Int8')).toBe(true);
    expect(isNumberType('Int16')).toBe(true);
    expect(isNumberType('Int32')).toBe(true);
    expect(isNumberType('Int64')).toBe(true);
    expect(isNumberType('Int128')).toBe(true);
    expect(isNumberType('Int256')).toBe(true);
  });

  it('returns true for Float types', () => {
    expect(isNumberType('Float32')).toBe(true);
    expect(isNumberType('Float64')).toBe(true);
  });

  it('returns true for Decimal types', () => {
    expect(isNumberType('Decimal(1,2)')).toBe(true);
    expect(isNumberType('Decimal32(3)')).toBe(true);
    expect(isNumberType('Decimal64(3)')).toBe(true);
    expect(isNumberType('Decimal128(3)')).toBe(true);
    expect(isNumberType('Decimal256(3)')).toBe(true);
  });

  it('returns false for other types', () => {
    expect(isNumberType('boolean')).toBe(false);
    expect(isNumberType('datetime')).toBe(false);
    expect(isNumberType('Nullable')).toBe(false);
  });
});

describe('getQueryOptionsFromSql', () => {
  testCondition('handles a table without a database', 'SELECT name FROM "foo"', {
    queryType: QueryType.Table,
    mode: BuilderMode.List,
    database: '',
    table: 'foo',
    columns: [{ name: 'name', alias: undefined }],
    aggregates: [],
  });

  testCondition('handles a database with a special character', 'SELECT name FROM "foo-bar"."buzz"', {
    queryType: QueryType.Table,
    mode: BuilderMode.List,
    database: 'foo-bar',
    table: 'buzz',
    columns: [{ name: 'name', alias: undefined }],
    aggregates: [],
  });

  testCondition('handles a database and a table', 'SELECT name FROM "db"."foo"', {
    queryType: QueryType.Table,
    mode: BuilderMode.List,
    database: 'db',
    table: 'foo',
    columns: [{ name: 'name', alias: undefined }],
    aggregates: [],
  });

  testCondition('handles a database and a table with a dot', 'SELECT name FROM "db"."foo.bar"', {
    queryType: QueryType.Table,
    mode: BuilderMode.List,
    database: 'db',
    table: 'foo.bar',
    columns: [{ name: 'name', alias: undefined }],
    aggregates: [],
  });

  testCondition('handles 2 columns', 'SELECT field1, field2 FROM "db"."foo"', {
    queryType: QueryType.Table,
    mode: BuilderMode.List,
    database: 'db',
    table: 'foo',
    columns: [
      { name: 'field1', alias: undefined },
      { name: 'field2', alias: undefined },
    ],
    aggregates: [],
  });

  testCondition('handles a limit', 'SELECT field1, field2 FROM "db"."foo" LIMIT 20', {
    queryType: QueryType.Table,
    mode: BuilderMode.List,
    database: 'db',
    table: 'foo',
    columns: [
      { name: 'field1', alias: undefined },
      { name: 'field2', alias: undefined },
    ],
    aggregates: [],
    limit: 20,
  });

  testCondition(
    'handles empty orderBy array',
    'SELECT field1, field2 FROM "db"."foo" LIMIT 20',
    {
      queryType: QueryType.Table,
      mode: BuilderMode.List,
      database: 'db',
      table: 'foo',
      columns: [
        { name: 'field1', alias: undefined },
        { name: 'field2', alias: undefined },
      ],
      aggregates: [],
      orderBy: [],
      limit: 20,
    },
    false
  );

  testCondition('handles order by', 'SELECT field1, field2 FROM "db"."foo" ORDER BY field1 ASC LIMIT 20', {
    queryType: QueryType.Table,
    mode: BuilderMode.List,
    database: 'db',
    table: 'foo',
    columns: [
      { name: 'field1', alias: undefined },
      { name: 'field2', alias: undefined },
    ],
    aggregates: [],
    orderBy: [{ name: 'field1', dir: OrderByDirection.ASC }],
    limit: 20,
  });

  testCondition(
    'handles no select',
    'SELECT FROM "db"',
    {
      queryType: QueryType.Table,
      mode: BuilderMode.Aggregate,
      database: 'db',
      table: '',
      columns: [],
      aggregates: [],
    },
    false
  );

  testCondition(
    'does not escape * field',
    'SELECT * FROM "db"',
    {
      queryType: QueryType.Table,
      mode: BuilderMode.Aggregate,
      database: 'db',
      table: '',
      columns: [{ name: '*' }],
      aggregates: [],
      limit: undefined,
    },
    false
  );

  testCondition('handles aggregation function', 'SELECT sum(field1) FROM "db"."foo"', {
    queryType: QueryType.Table,
    mode: BuilderMode.Aggregate,
    database: 'db',
    table: 'foo',
    columns: [],
    aggregates: [{ column: 'field1', aggregateType: AggregateType.Sum, alias: undefined }],
    limit: undefined,
  });

  testCondition('handles aggregation with alias', 'SELECT sum(field1) as total_records FROM "db"."foo"', {
    queryType: QueryType.Table,
    mode: BuilderMode.Aggregate,
    database: 'db',
    table: 'foo',
    columns: [],
    aggregates: [{ column: 'field1', aggregateType: AggregateType.Sum, alias: 'total_records' }],
    limit: undefined,
  });

  testCondition(
    'handles 2 aggregations',
    'SELECT sum(field1) as total_records, count(field2) as total_records2 FROM "db"."foo"',
    {
      queryType: QueryType.Table,
      mode: BuilderMode.Aggregate,
      table: 'foo',
      database: 'db',
      columns: [],
      aggregates: [
        { column: 'field1', aggregateType: AggregateType.Sum, alias: 'total_records' },
        { column: 'field2', aggregateType: AggregateType.Count, alias: 'total_records2' },
      ],
      limit: undefined,
    }
  );

  testCondition(
    'handles aggregation with groupBy',
    'SELECT sum(field1) as total_records, count(field2) as total_records2 FROM "db"."foo" GROUP BY field3',
    {
      database: 'db',
      table: 'foo',
      queryType: QueryType.Table,
      mode: BuilderMode.Aggregate,
      columns: [],
      aggregates: [
        { column: 'field1', aggregateType: AggregateType.Sum, alias: 'total_records' },
        { column: 'field2', aggregateType: AggregateType.Count, alias: 'total_records2' },
      ],
      groupBy: ['field3'],
    },
    false
  );

  testCondition(
    'handles aggregation with groupBy with columns having group by value',
    'SELECT field3, sum(field1) as total_records, count(field2) as total_records2 FROM "db"."foo" GROUP BY field3',
    {
      queryType: QueryType.Table,
      mode: BuilderMode.Aggregate,
      table: 'foo',
      database: 'db',
      columns: [{ name: 'field3' }],
      aggregates: [
        { column: 'field1', aggregateType: AggregateType.Sum, alias: 'total_records' },
        { column: 'field2', aggregateType: AggregateType.Count, alias: 'total_records2' },
      ],
      groupBy: ['field3'],
      limit: undefined,
    }
  );

  testCondition(
    'handles aggregation with group by and order by',
    'SELECT StageName, Type, count(Id) as count_of, sum(Amount) FROM "db"."foo" GROUP BY StageName, Type ORDER BY count_of DESC, StageName ASC',
    {
      mode: BuilderMode.Aggregate,
      database: 'db',
      table: 'foo',
      queryType: QueryType.Table,
      columns: [{ name: 'StageName' }, { name: 'Type' }],
      aggregates: [
        { column: 'Id', aggregateType: AggregateType.Count, alias: 'count_of' },
        { column: 'Amount', aggregateType: AggregateType.Sum, alias: undefined },
      ],
      groupBy: ['StageName', 'Type'],
      orderBy: [
        { name: 'count_of', dir: OrderByDirection.DESC },
        { name: 'StageName', dir: OrderByDirection.ASC },
      ],
    },
    false
  );

  testCondition(
    'handles aggregation with a IN filter',
    `SELECT count(id) FROM "db"."foo" WHERE ( stagename IN ('Deal Won', 'Deal Lost') )`,
    {
      queryType: QueryType.Table,
      mode: BuilderMode.Aggregate,
      database: 'db',
      table: 'foo',
      columns: [],
      aggregates: [{ column: 'id', aggregateType: AggregateType.Count, alias: undefined }],
      filters: [
        {
          key: 'stagename',
          operator: FilterOperator.In,
          value: ['Deal Won', 'Deal Lost'],
          type: 'string',
        } as MultiFilter,
      ],
    }
  );

  testCondition(
    'handles aggregation with a NOT IN filter',
    `SELECT count(id) FROM "db"."foo" WHERE ( stagename NOT IN ('Deal Won', 'Deal Lost') )`,
    {
      queryType: QueryType.Table,
      mode: BuilderMode.Aggregate,
      database: 'db',
      table: 'foo',
      columns: [],
      aggregates: [{ column: 'id', aggregateType: AggregateType.Count, alias: undefined }],
      filters: [
        {
          key: 'stagename',
          operator: FilterOperator.NotIn,
          value: ['Deal Won', 'Deal Lost'],
          type: 'string',
        } as MultiFilter,
      ],
      limit: undefined,
    }
  );

  testCondition(
    'handles aggregation with datetime filter',
    `SELECT count(id) FROM "db"."foo" WHERE ( createddate >= $__fromTime AND createddate <= $__toTime )`,
    {
      queryType: QueryType.Table,
      mode: BuilderMode.Aggregate,
      database: 'db',
      table: 'foo',
      columns: [],
      aggregates: [{ column: 'id', aggregateType: AggregateType.Count, alias: undefined }],
      filters: [
        {
          key: 'createddate',
          operator: FilterOperator.WithInGrafanaTimeRange,
          type: 'datetime',
        } as DateFilterWithoutValue,
      ],
      limit: undefined,
    }
  );

  testCondition(
    'handles aggregation with date filter',
    `SELECT count(id) FROM "db"."foo" WHERE ( NOT ( closedate >= $__fromTime AND closedate <= $__toTime ) )`,
    {
      queryType: QueryType.Table,
      mode: BuilderMode.Aggregate,
      database: 'db',
      table: 'foo',
      columns: [],
      aggregates: [{ column: 'id', aggregateType: AggregateType.Count, alias: undefined }],
      filters: [
        {
          key: 'closedate',
          operator: FilterOperator.OutsideGrafanaTimeRange,
          type: 'datetime',
        } as DateFilterWithoutValue,
      ],
      limit: undefined,
    }
  );

  testCondition(
    'handles timeseries function with "timeFieldType: DateType"',
    'SELECT $__timeInterval(time) as "time" FROM "db"."foo" GROUP BY time',
    {
      queryType: QueryType.TimeSeries,
      mode: BuilderMode.Trend,
      database: 'db',
      table: 'foo',
      columns: [{ name: 'time', type: 'datetime', hint: ColumnHint.Time }],
      aggregates: [],
      filters: [],
    },
    false
  );

  testCondition(
    'handles timeseries function with "timeFieldType: DateType" with a filter',
    'SELECT $__timeInterval(time) as "time" FROM "db"."foo" WHERE ( base IS NOT NULL ) GROUP BY time',
    {
      queryType: QueryType.TimeSeries,
      mode: BuilderMode.Trend,
      database: 'db',
      table: 'foo',
      columns: [{ name: 'time', type: 'datetime', hint: ColumnHint.Time }],
      aggregates: [],
      filters: [
        {
          condition: 'AND',
          filterType: 'custom',
          key: 'base',
          operator: FilterOperator.IsNotNull,
          type: 'LowCardinality(String)',
        },
      ],
    },
    false
  );

  testCondition(
    'handles parsing a column with a complex name with spaces and capital characters',
    'SELECT "Complex Name" FROM "db"."foo"',
    {
      queryType: QueryType.Table,
      mode: BuilderMode.List,
      database: 'db',
      table: 'foo',
      columns: [{ name: 'Complex Name', alias: undefined }],
      aggregates: [],
    }
  );

  it('matches input query type', () => {
    const sql = 'SELECT test FROM "db"."foo"';
    const expectedOptions: QueryBuilderOptions = {
      queryType: QueryType.Logs,
      mode: BuilderMode.List,
      database: 'db',
      table: 'foo',
      columns: [{ name: 'test', alias: undefined }],
      aggregates: [],
    };

    expect(getQueryOptionsFromSql(sql, QueryType.Logs)).toEqual(expectedOptions);
  });

  it('matches column hints with Grafana query aliases', () => {
    const sql = 'SELECT a as body, b as level FROM "db"."foo"';
    const expectedOptions: QueryBuilderOptions = {
      queryType: QueryType.Logs,
      mode: BuilderMode.List,
      database: 'db',
      table: 'foo',
      columns: [
        { name: 'a', alias: 'body', hint: ColumnHint.LogMessage },
        { name: 'b', alias: 'level', hint: ColumnHint.LogLevel },
      ],
      aggregates: [],
      limit: undefined,
    };

    expect(getQueryOptionsFromSql(sql, QueryType.Logs)).toEqual(expectedOptions);
  });

  it('matches column hints with OTel log column names', () => {
    const mockDs = {} as Datasource;
    mockDs.getDefaultLogsColumns = jest.fn(() => otel.getLatestVersion().logColumnMap);

    const sql = 'SELECT "Timestamp", "SeverityText" FROM "db"."foo"';
    const expectedOptions: QueryBuilderOptions = {
      queryType: QueryType.Logs,
      mode: BuilderMode.List,
      database: 'db',
      table: 'foo',
      columns: [
        { name: 'Timestamp', alias: undefined, hint: ColumnHint.Time },
        { name: 'SeverityText', alias: undefined, hint: ColumnHint.LogLevel },
      ],
      aggregates: [],
      limit: undefined,
    };

    expect(getQueryOptionsFromSql(sql, QueryType.Logs, mockDs)).toEqual(expectedOptions);
  });

  it('matches column hints with datasource log column names', () => {
    const mockDs = {} as Datasource;
    mockDs.getDefaultLogsColumns = jest.fn(
      () =>
        new Map([
          [ColumnHint.Time, 'SpecialTimestamp'],
          [ColumnHint.LogMessage, 'LogBody'],
        ])
    );

    const sql = 'SELECT "SpecialTimestamp", "LogBody" FROM "db"."foo"';
    const expectedOptions: QueryBuilderOptions = {
      queryType: QueryType.Logs,
      mode: BuilderMode.List,
      database: 'db',
      table: 'foo',
      columns: [
        { name: 'SpecialTimestamp', alias: undefined, hint: ColumnHint.Time },
        { name: 'LogBody', alias: undefined, hint: ColumnHint.LogMessage },
      ],
      aggregates: [],
      limit: undefined,
    };

    expect(getQueryOptionsFromSql(sql, QueryType.Logs, mockDs)).toEqual(expectedOptions);
  });

  it('matches column hints with OTel trace column names', () => {
    const mockDs = {} as Datasource;
    mockDs.getDefaultTraceColumns = jest.fn(() => otel.getLatestVersion().traceColumnMap);

    const sql = 'SELECT "StartTime", "ServiceName" FROM "db"."foo"';
    const expectedOptions: QueryBuilderOptions = {
      queryType: QueryType.Traces,
      mode: BuilderMode.List,
      database: 'db',
      table: 'foo',
      columns: [
        { name: 'StartTime', alias: undefined, hint: ColumnHint.Time },
        { name: 'ServiceName', alias: undefined, hint: ColumnHint.TraceServiceName },
      ],
      aggregates: [],
      limit: undefined,
    };

    expect(getQueryOptionsFromSql(sql, QueryType.Traces, mockDs)).toEqual(expectedOptions);
  });

  it('matches column hints with datasource trace column names', () => {
    const mockDs = {} as Datasource;
    mockDs.getDefaultTraceColumns = jest.fn(
      () =>
        new Map([
          [ColumnHint.Time, 'SpecialTimestamp'],
          [ColumnHint.TraceId, 'CustomTraceID'],
        ])
    );

    const sql = 'SELECT "SpecialTimestamp", "CustomTraceID" FROM "db"."foo"';
    const expectedOptions: QueryBuilderOptions = {
      queryType: QueryType.Traces,
      mode: BuilderMode.List,
      database: 'db',
      table: 'foo',
      columns: [
        { name: 'SpecialTimestamp', alias: undefined, hint: ColumnHint.Time },
        { name: 'CustomTraceID', alias: undefined, hint: ColumnHint.TraceId },
      ],
      aggregates: [],
      limit: undefined,
    };

    expect(getQueryOptionsFromSql(sql, QueryType.Traces, mockDs)).toEqual(expectedOptions);
  });

  it('Handles brackets and Grafana macros/variables', () => {
    const sql = `
      /* \${__variable} \${__variable.key} */
      SELECT
        *,
        \$__timeInterval(timestamp),
        '{"a": 1, "b": { "c": 2, "d": [1, 2, 3] }}'::json as bracketTest
      FROM default.table
      WHERE $__timeFilter(timestamp)
      AND col != \${variable}
      AND col != \${variable.key}
      AND col != \${variable.key:singlequote}
      AND col != '\${variable}'
      AND col != '\${__variable}'
      AND col != ('\${__variable.key}')
      AND col != \${variable:singlequote}
    `;

    const builderOptions = getQueryOptionsFromSql(sql);
    expect(builderOptions).not.toBeUndefined();
    expect(typeof builderOptions).not.toBe('string');
  });
});

function testCondition(name: string, sql: string, builder: QueryBuilderOptions, testQueryOptionsFromSql = true) {
  it(name, () => {
    expect(generateSql(builder)).toBe(sql);
    if (testQueryOptionsFromSql) {
      expect(getQueryOptionsFromSql(sql)).toEqual(builder);
    }
  });
}
