import { BuilderMetricFieldAggregation, BuilderMode, FilterOperator, OrderByDirection } from 'types';
import { getQueryOptionsFromSql, getSQLFromQueryOptions, isDateType, isNumberType } from './utils';

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

describe('Utils: getSQLFromQueryOptions and getQueryOptionsFromSql', () => {
  testCondition('handles a table without a database', 'SELECT name FROM "foo"', {
    mode: BuilderMode.List,
    table: 'foo',
    fields: ['name'],
  });

  testCondition('handles a database and a table', 'SELECT name FROM db."foo"', {
    mode: BuilderMode.List,
    database: 'db',
    table: 'foo',
    fields: ['name'],
  });

  testCondition('handles a database and a table with a dot', 'SELECT name FROM db."foo.bar"', {
    mode: BuilderMode.List,
    database: 'db',
    table: 'foo.bar',
    fields: ['name'],
  });

  testCondition('handles 2 fields', 'SELECT field1, field2 FROM db."foo"', {
    mode: BuilderMode.List,
    database: 'db',
    table: 'foo',
    fields: ['field1', 'field2'],
  });

  testCondition('handles a limit', 'SELECT field1, field2 FROM db."foo" LIMIT 20', {
    mode: BuilderMode.List,
    database: 'db',
    table: 'foo',
    fields: ['field1', 'field2'],
    limit: 20,
  });

  testCondition(
    'handles empty orderBy array',
    'SELECT field1, field2 FROM db."foo" LIMIT 20',
    {
      mode: BuilderMode.List,
      database: 'db',
      table: 'foo',
      fields: ['field1', 'field2'],
      orderBy: [],
      limit: 20,
    },
    false
  );

  testCondition('handles order by', 'SELECT field1, field2 FROM db."foo" ORDER BY field1 ASC LIMIT 20', {
    mode: BuilderMode.List,
    database: 'db',
    table: 'foo',
    fields: ['field1', 'field2'],
    orderBy: [{ name: 'field1', dir: OrderByDirection.ASC }],
    limit: 20,
  });

  testCondition(
    'handles no select',
    'SELECT  FROM db',
    {
      mode: BuilderMode.Aggregate,
      database: 'db',
      table: '',
      fields: [],
      metrics: [],
    },
    false
  );

  testCondition('handles aggregation function', 'SELECT sum(field1) FROM db."foo"', {
    mode: BuilderMode.Aggregate,
    database: 'db',
    table: 'foo',
    fields: [],
    metrics: [{ field: 'field1', aggregation: BuilderMetricFieldAggregation.Sum }],
  });

  testCondition('handles aggregation with alias', 'SELECT sum(field1) total_records FROM db."foo"', {
    mode: BuilderMode.Aggregate,
    database: 'db',
    table: 'foo',
    fields: [],
    metrics: [{ field: 'field1', aggregation: BuilderMetricFieldAggregation.Sum, alias: 'total_records' }],
  });

  testCondition(
    'handles 2 aggregations',
    'SELECT sum(field1) total_records, count(field2) total_records2 FROM db."foo"',
    {
      mode: BuilderMode.Aggregate,
      table: 'foo',
      database: 'db',
      fields: [],
      metrics: [
        { field: 'field1', aggregation: BuilderMetricFieldAggregation.Sum, alias: 'total_records' },
        { field: 'field2', aggregation: BuilderMetricFieldAggregation.Count, alias: 'total_records2' },
      ],
    }
  );

  testCondition(
    'handles aggregation with groupBy',
    'SELECT field3, sum(field1) total_records, count(field2) total_records2 FROM db."foo" GROUP BY field3',
    {
      mode: BuilderMode.Aggregate,
      table: 'foo',
      database: 'db',
      fields: [],
      metrics: [
        { field: 'field1', aggregation: BuilderMetricFieldAggregation.Sum, alias: 'total_records' },
        { field: 'field2', aggregation: BuilderMetricFieldAggregation.Count, alias: 'total_records2' },
      ],
      groupBy: ['field3'],
    },
    false
  );

  testCondition(
    'handles aggregation with groupBy with fields having group by value',
    'SELECT field3, sum(field1) total_records, count(field2) total_records2 FROM db."foo" GROUP BY field3',
    {
      mode: BuilderMode.Aggregate,
      table: 'foo',
      database: 'db',
      fields: ['field3'],
      metrics: [
        { field: 'field1', aggregation: BuilderMetricFieldAggregation.Sum, alias: 'total_records' },
        { field: 'field2', aggregation: BuilderMetricFieldAggregation.Count, alias: 'total_records2' },
      ],
      groupBy: ['field3'],
    }
  );

  testCondition(
    'handles aggregation with group by and order by',
    'SELECT StageName, Type, count(Id) count_of, sum(Amount) FROM db."foo" GROUP BY StageName, Type ORDER BY count(Id) DESC, StageName ASC',
    {
      mode: BuilderMode.Aggregate,
      database: 'db',
      table: 'foo',
      fields: [],
      metrics: [
        { field: 'Id', aggregation: BuilderMetricFieldAggregation.Count, alias: 'count_of' },
        { field: 'Amount', aggregation: BuilderMetricFieldAggregation.Sum },
      ],
      groupBy: ['StageName', 'Type'],
      orderBy: [
        { name: 'count(Id)', dir: OrderByDirection.DESC },
        { name: 'StageName', dir: OrderByDirection.ASC },
      ],
    },
    false
  );

  testCondition(
    'handles aggregation with a IN filter',
    `SELECT count(id) FROM db."foo" WHERE   ( stagename IN ('Deal Won', 'Deal Lost' ) )`,
    {
      mode: BuilderMode.Aggregate,
      database: 'db',
      table: 'foo',
      fields: [],
      metrics: [{ field: 'id', aggregation: BuilderMetricFieldAggregation.Count }],
      filters: [
        {
          key: 'stagename',
          operator: FilterOperator.In,
          value: ['Deal Won', 'Deal Lost'],
          type: 'string',
        },
      ],
    }
  );

  testCondition(
    'handles aggregation with a NOT IN filter',
    `SELECT count(id) FROM db."foo" WHERE   ( stagename NOT IN ('Deal Won', 'Deal Lost' ) )`,
    {
      mode: BuilderMode.Aggregate,
      database: 'db',
      table: 'foo',
      fields: [],
      metrics: [{ field: 'id', aggregation: BuilderMetricFieldAggregation.Count }],
      filters: [
        {
          key: 'stagename',
          operator: FilterOperator.NotIn,
          value: ['Deal Won', 'Deal Lost'],
          type: 'string',
        },
      ],
    }
  );

  testCondition(
    'handles aggregation with datetime filter',
    `SELECT count(id) FROM db."foo" WHERE   ( createddate  >= $__fromTime AND createddate <= $__toTime )`,
    {
      mode: BuilderMode.Aggregate,
      database: 'db',
      table: 'foo',
      fields: [],
      metrics: [{ field: 'id', aggregation: BuilderMetricFieldAggregation.Count }],
      filters: [
        {
          key: 'createddate',
          operator: FilterOperator.WithInGrafanaTimeRange,
          type: 'datetime',
        },
      ],
    }
  );

  testCondition(
    'handles aggregation with date filter',
    `SELECT count(id) FROM db."foo" WHERE   (  NOT ( closedate  >= $__fromTime AND closedate <= $__toTime ) )`,
    {
      mode: BuilderMode.Aggregate,
      database: 'db',
      table: 'foo',
      fields: [],
      metrics: [{ field: 'id', aggregation: BuilderMetricFieldAggregation.Count }],
      filters: [
        {
          key: 'closedate',
          operator: FilterOperator.OutsideGrafanaTimeRange,
          type: 'datetime',
        },
      ],
    }
  );

  testCondition(
    'handles timeseries function with "timeFieldType: DateType"',
    'SELECT $__timeInterval(time) as time FROM db."foo" WHERE $__timeFilter(time) GROUP BY time ORDER BY time ASC',
    {
      mode: BuilderMode.Trend,
      database: 'db',
      table: 'foo',
      fields: [],
      timeField: 'time',
      timeFieldType: 'datetime',
      metrics: [],
      filters: [],
    },
    false
  );

  testCondition(
    'handles timeseries function with "timeFieldType: DateType" with a filter',
    'SELECT $__timeInterval(time) as time FROM db."foo" WHERE $__timeFilter(time) AND   ( base IS NOT NULL ) GROUP BY time ORDER BY time ASC',
    {
      mode: BuilderMode.Trend,
      database: 'db',
      table: 'foo',
      fields: [],
      timeField: 'time',
      timeFieldType: 'datetime',
      metrics: [],
      filters: [
        {
          condition: 'AND',
          filterType: 'custom',
          key: 'base',
          operator: 'IS NOT NULL',
          type: 'LowCardinality(String)',
          value: 'GBP',
        },
      ],
    },
    false
  );

  it('timeseries function throws if "timeFieldType" not a DateType', () => {
    expect(() =>
      getSQLFromQueryOptions({
        mode: BuilderMode.Trend,
        database: 'db',
        table: 'foo',
        fields: [],
        timeField: 'time',
        timeFieldType: 'boolean',
        metrics: [],
        filters: [],
      })
    ).toThrowErrorMatchingInlineSnapshot('"timeFieldType is expected to be valid Date type."');
  });
});

function testCondition(name: string, sql: string, builder: any, testQueryOptionsFromSql = true) {
  it(name, () => {
    expect(getSQLFromQueryOptions(builder)).toBe(sql);
    if (testQueryOptionsFromSql) {
      expect(getQueryOptionsFromSql(sql)).toEqual(builder);
    }
  });
}
