import { BuilderMetricFieldAggregation, BuilderMode, FilterOperator, OrderByDirection } from 'types';
import { getQueryOptionsFromSql, getSQLFromQueryOptions } from './utils';

describe('Utils: getSQLFromQueryOptions and getQueryOptionsFromSql', () => {
  testCondition('handles a table without a database', 'SELECT name FROM table', {
    mode: BuilderMode.List,
    database: '',
    table: 'table',
    fields: ['name'],
  });

  testCondition('handles a database and a table', 'SELECT name FROM db.foo', {
    mode: BuilderMode.List,
    database: 'db',
    table: 'foo',
    fields: ['name'],
  });

  testCondition('handles 2 fields', 'SELECT field1, field2 FROM db.foo', {
    mode: BuilderMode.List,
    database: 'db',
    table: 'foo',
    fields: ['field1', 'field2'],
  });

  testCondition('handles a limit', 'SELECT field1, field2 FROM db.foo LIMIT 20', {
    mode: BuilderMode.List,
    database: 'db',
    table: 'foo',
    fields: ['field1', 'field2'],
    limit: 20,
  });

  testCondition(
    'handles empty orderBy array',
    'SELECT field1, field2 FROM db.foo LIMIT 20',
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

  testCondition('handles order by', 'SELECT field1, field2 FROM db.foo ORDER BY field1 ASC LIMIT 20', {
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

  testCondition('handles aggregation function', 'SELECT sum(field1) FROM db.foo', {
    mode: BuilderMode.Aggregate,
    database: 'db',
    table: 'foo',
    fields: [],
    metrics: [{ field: 'field1', aggregation: BuilderMetricFieldAggregation.Sum }],
  });

  testCondition('handles aggregation with alias', 'SELECT sum(field1) total_records FROM db.foo', {
    mode: BuilderMode.Aggregate,
    database: 'db',
    table: 'foo',
    fields: [],
    metrics: [{ field: 'field1', aggregation: BuilderMetricFieldAggregation.Sum, alias: 'total_records' }],
  });

  testCondition(
    'handles 2 aggregations',
    'SELECT sum(field1) total_records, count(field2) total_records2 FROM db.foo',
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
    'SELECT field3, sum(field1) total_records, count(field2) total_records2 FROM db.foo GROUP BY field3',
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
    'SELECT field3, sum(field1) total_records, count(field2) total_records2 FROM db.foo GROUP BY field3',
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
    'SELECT StageName, Type, count(Id) count_of, sum(Amount) FROM db.foo GROUP BY StageName, Type ORDER BY count(Id) DESC, StageName ASC',
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
    `SELECT count(Id) FROM db.foo WHERE   ( StageName IN ('Deal Won', 'Deal Lost' ) )`,
    {
      mode: BuilderMode.Aggregate,
      database: 'db',
      table: 'foo',
      fields: [],
      metrics: [{ field: 'Id', aggregation: BuilderMetricFieldAggregation.Count }],
      filters: [
        {
          filterType: 'custom',
          key: 'StageName',
          operator: FilterOperator.In,
          value: ['Deal Won', 'Deal Lost'],
          type: 'string',
          condition: 'AND',
        },
      ],
    }
  );

  testCondition(
    'handles aggregation with a NOT IN filter',
    `SELECT count(Id) FROM db.foo WHERE   ( StageName NOT IN ('Deal Won', 'Deal Lost' ) )`,
    {
      mode: BuilderMode.Aggregate,
      database: 'db',
      table: 'foo',
      fields: [],
      metrics: [{ field: 'Id', aggregation: BuilderMetricFieldAggregation.Count }],
      filters: [
        {
          filterType: 'custom',
          key: 'StageName',
          operator: FilterOperator.NotIn,
          value: ['Deal Won', 'Deal Lost'],
          type: 'string',
          condition: 'AND',
        },
      ],
    }
  );

  testCondition(
    'handles aggregation with datetime filter',
    `SELECT count(Id) FROM db.foo WHERE   ( CreatedDate  >= \${__from:date} AND CreatedDate <= \${__to:date} )`,
    {
      mode: BuilderMode.Aggregate,
      database: 'db',
      table: 'foo',
      fields: [],
      metrics: [{ field: 'Id', aggregation: BuilderMetricFieldAggregation.Count }],
      filters: [
        {
          filterType: 'custom',
          key: 'CreatedDate',
          operator: FilterOperator.WithInGrafanaTimeRange,
          type: 'datetime',
          value: '',
          condition: 'AND',
        },
      ],
    }
  );

  testCondition(
    'handles aggregation with date filter',
    `SELECT count(Id) FROM db.foo WHERE   (  NOT ( CloseDate  >= \${__from:date:YYYY-MM-DD} AND CloseDate <= \${__to:date:YYYY-MM-DD} ) )`,
    {
      mode: BuilderMode.Aggregate,
      database: 'db',
      table: 'foo',
      fields: [],
      metrics: [{ field: 'Id', aggregation: BuilderMetricFieldAggregation.Count }],
      filters: [
        {
          filterType: 'custom',
          key: 'CloseDate',
          operator: FilterOperator.OutsideGrafanaTimeRange,
          type: 'date',
          value: '',
          condition: 'AND',
        },
      ],
    }
  );
});

function testCondition(name: string, sql: string, builder: any, testQueryOptionsFromSql = true) {
  it(name, () => {
    expect(getSQLFromQueryOptions(builder)).toBe(sql);
    if (testQueryOptionsFromSql) {
      expect(getQueryOptionsFromSql(sql)).toEqual(builder);
    }
  });
}
