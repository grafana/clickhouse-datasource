import { BuilderMetricFieldAggregation, BuilderMode, FilterOperator, OrderByDirection } from 'types';
import { getSQLFromQueryOptions as convert } from './utils';

describe('Utils', () => {
  it('getSQLFromQueryOptions', () => {
    expect(convert({ mode: BuilderMode.List, database: 'db', table: '', fields: ['name'] })).toBe(
      'SELECT name FROM db'
    );
    expect(convert({ mode: BuilderMode.List, database: 'db', table: 'foo', fields: ['name'] })).toBe(
      'SELECT name FROM db.foo'
    );
    expect(convert({ mode: BuilderMode.List, database: 'db', table: 'foo', fields: ['field1', 'field2'] })).toBe(
      'SELECT field1, field2 FROM db.foo'
    );
    expect(
      convert({ mode: BuilderMode.List, database: 'db', table: 'foo', fields: ['field1', 'field2'], limit: 20 })
    ).toBe('SELECT field1, field2 FROM db.foo LIMIT 20');
    expect(
      convert({
        mode: BuilderMode.List,
        database: 'db',
        table: 'foo',
        fields: ['field1', 'field2'],
        orderBy: [],
        limit: 20,
      })
    ).toBe('SELECT field1, field2 FROM db.foo LIMIT 20');
    expect(
      convert({
        mode: BuilderMode.List,
        database: 'db',
        table: 'foo',
        fields: ['field1', 'field2'],
        orderBy: [{ name: 'field1', dir: OrderByDirection.ASC }],
        limit: 20,
      })
    ).toBe('SELECT field1, field2 FROM db.foo ORDER BY field1 ASC LIMIT 20');
    expect(convert({ mode: BuilderMode.Aggregate, database: 'db', table: '', fields: [], metrics: [] })).toBe(
      'SELECT  FROM db'
    );
    expect(convert({ mode: BuilderMode.Aggregate, database: 'db', table: 'foo', fields: [], metrics: [] })).toBe(
      'SELECT  FROM db.foo'
    );
    expect(
      convert({
        mode: BuilderMode.Aggregate,
        database: 'db',
        table: 'foo',
        fields: [],
        metrics: [{ field: 'field1', aggregation: BuilderMetricFieldAggregation.Sum }],
      })
    ).toBe('SELECT sum(field1) FROM db.foo');
    expect(
      convert({
        mode: BuilderMode.Aggregate,
        database: 'db',
        table: 'foo',
        fields: [],
        metrics: [{ field: 'field1', aggregation: BuilderMetricFieldAggregation.Sum, alias: 'total_records' }],
      })
    ).toBe('SELECT sum(field1) total_records FROM db.foo');
    expect(
      convert({
        mode: BuilderMode.Aggregate,
        table: 'foo',
        database: 'db',
        fields: [],
        metrics: [
          { field: 'field1', aggregation: BuilderMetricFieldAggregation.Sum, alias: 'total_records' },
          { field: 'field2', aggregation: BuilderMetricFieldAggregation.Count, alias: 'total_records2' },
        ],
      })
    ).toBe('SELECT sum(field1) total_records, count(field2) total_records2 FROM db.foo');
    expect(
      convert({
        mode: BuilderMode.Aggregate,
        table: 'foo',
        database: 'db',
        fields: [],
        metrics: [
          { field: 'field1', aggregation: BuilderMetricFieldAggregation.Sum, alias: 'total_records' },
          { field: 'field2', aggregation: BuilderMetricFieldAggregation.Count, alias: 'total_records2' },
        ],
        groupBy: [],
      })
    ).toBe('SELECT sum(field1) total_records, count(field2) total_records2 FROM db.foo');
    expect(
      convert({
        mode: BuilderMode.Aggregate,
        table: 'foo',
        database: 'db',
        fields: [],
        metrics: [
          { field: 'field1', aggregation: BuilderMetricFieldAggregation.Sum, alias: 'total_records' },
          { field: 'field2', aggregation: BuilderMetricFieldAggregation.Count, alias: 'total_records2' },
        ],
        groupBy: ['field3'],
      })
    ).toBe('SELECT field3, sum(field1) total_records, count(field2) total_records2 FROM db.foo GROUP BY field3');
    expect(
      convert({
        mode: BuilderMode.Aggregate,
        database: 'db',
        table: 'foo',
        fields: [],
        metrics: [
          { field: 'Id', aggregation: BuilderMetricFieldAggregation.Count, alias: 'count_of' },
          { field: 'Amount', aggregation: BuilderMetricFieldAggregation.Sum },
        ],
        groupBy: ['StageName', 'Type'],
      })
    ).toBe('SELECT StageName, Type, count(Id) count_of, sum(Amount) FROM db.foo GROUP BY StageName, Type');
    expect(
      convert({
        mode: BuilderMode.Aggregate,
        database: 'db',
        table: 'foo',
        fields: [],
        metrics: [
          { field: 'Id', aggregation: BuilderMetricFieldAggregation.Count, alias: 'count_of' },
          { field: 'Amount', aggregation: BuilderMetricFieldAggregation.Sum },
        ],
        groupBy: ['StageName', 'Type'],
        orderBy: [{ name: 'count(Id)', dir: OrderByDirection.DESC }],
      })
    ).toBe(
      'SELECT StageName, Type, count(Id) count_of, sum(Amount) FROM db.foo GROUP BY StageName, Type ORDER BY count(Id) DESC'
    );
    expect(
      convert({
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
      })
    ).toBe(
      'SELECT StageName, Type, count(Id) count_of, sum(Amount) FROM db.foo GROUP BY StageName, Type ORDER BY count(Id) DESC, StageName ASC'
    );
    expect(
      convert({
        mode: BuilderMode.Aggregate,
        database: 'db',
        table: 'foo',
        fields: [],
        metrics: [{ field: 'Id', aggregation: BuilderMetricFieldAggregation.Count }],
      })
    ).toBe('SELECT count(Id) FROM db.foo');
    expect(
      convert({
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
      })
    ).toBe(`SELECT count(Id) FROM db.foo WHERE   ( StageName IN ('Deal Won', 'Deal Lost' ) )`);
    expect(
      convert({
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
      })
    ).toBe(`SELECT count(Id) FROM db.foo WHERE   ( StageName NOT IN ('Deal Won', 'Deal Lost' ) )`);
    expect(
      convert({
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
      })
    ).toBe(`SELECT count(Id) FROM db.foo WHERE   ( CreatedDate  >= \${__from:date} AND CreatedDate <= \${__to:date} )`);
    expect(
      convert({
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
      })
    ).toBe(
      `SELECT count(Id) FROM db.foo WHERE   (  NOT ( CloseDate  >= \${__from:date:YYYY-MM-DD} AND CloseDate <= \${__to:date:YYYY-MM-DD} ) )`
    );
  });
});
