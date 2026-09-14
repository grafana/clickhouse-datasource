import { Datasource } from 'data/CHDatasource';
import {
  buildBuilderOptionsFromSchema,
  generateSchemaExplorerSql,
  getTimeColumnCandidates,
  resolveTimeColumn,
} from './schemaExplorer';
import { generateSql } from 'data/sqlGenerator';
import { BuilderMode, FilterOperator, QueryType, TableColumn } from 'types/queryBuilder';

const col = (name: string, type: string): TableColumn => ({ name, type, picklistValues: [] });

describe('getTimeColumnCandidates', () => {
  it('matches DateTime, DateTime64, Date and Date32', () => {
    const columns = [
      col('a', 'DateTime'),
      col('b', 'DateTime64(3)'),
      col('c', 'Date'),
      col('d', 'Date32'),
      col('e', 'String'),
    ];

    expect(getTimeColumnCandidates(columns)).toEqual([columns[0], columns[1], columns[2], columns[3]]);
  });

  it('matches Nullable and LowCardinality wrapped time types', () => {
    const columns = [col('a', 'Nullable(DateTime)'), col('b', 'LowCardinality(DateTime64(3))')];

    expect(getTimeColumnCandidates(columns)).toEqual(columns);
  });

  it('does not match unrelated types containing a substring match', () => {
    const columns = [col('a', 'String'), col('b', 'FixedString(16)')];

    expect(getTimeColumnCandidates(columns)).toEqual([]);
  });

  it('preserves input order', () => {
    const columns = [col('z', 'Date'), col('a', 'DateTime')];

    expect(getTimeColumnCandidates(columns)).toEqual(columns);
  });
});

describe('resolveTimeColumn', () => {
  const stubDatasource = (configured: string | undefined): Datasource =>
    ({
      getConfiguredTimeColumn: jest.fn().mockReturnValue(configured),
    }) as unknown as Datasource;

  it('uses the configured time column when it exists in columns', () => {
    const columns = [col('Timestamp', 'DateTime'), col('Body', 'String')];
    const ds = stubDatasource('Timestamp');

    expect(resolveTimeColumn(ds, 'default', 'otel_logs', columns)).toEqual('Timestamp');
  });

  it('ignores a configured time column that is missing from columns', () => {
    const columns = [col('Body', 'String')];
    const ds = stubDatasource('Timestamp');

    expect(resolveTimeColumn(ds, 'default', 'otel_logs', columns)).toBeUndefined();
  });

  it('accepts the configured time column when columns is empty', () => {
    const ds = stubDatasource('Timestamp');

    expect(resolveTimeColumn(ds, 'default', 'otel_logs', [])).toEqual('Timestamp');
  });

  it('falls back to a preferred candidate name when nothing is configured', () => {
    const columns = [col('created_at', 'DateTime'), col('timestamp', 'DateTime')];
    const ds = stubDatasource(undefined);

    expect(resolveTimeColumn(ds, 'default', 'my_table', columns)).toEqual('timestamp');
  });

  it('checks preference names in listed order, not column order', () => {
    const columns = [col('time', 'DateTime'), col('event_time', 'DateTime')];
    const ds = stubDatasource(undefined);

    expect(resolveTimeColumn(ds, 'default', 'my_table', columns)).toEqual('event_time');
  });

  it('falls back to the first candidate when no preferred name matches', () => {
    const columns = [col('foo', 'DateTime'), col('bar', 'Date')];
    const ds = stubDatasource(undefined);

    expect(resolveTimeColumn(ds, 'default', 'my_table', columns)).toEqual('foo');
  });

  it('returns undefined when there are no candidates', () => {
    const columns = [col('a', 'String')];
    const ds = stubDatasource(undefined);

    expect(resolveTimeColumn(ds, 'default', 'my_table', columns)).toBeUndefined();
  });
});

describe('generateSchemaExplorerSql', () => {
  it('generates SQL with columns, time filter and default limit', () => {
    const sql = generateSchemaExplorerSql({
      database: 'default',
      table: 'otel_logs',
      columns: ['Timestamp', 'Body'],
      timeColumn: 'Timestamp',
    });

    expect(sql).toEqual(
      'SELECT "Timestamp", "Body" FROM "default"."otel_logs" WHERE $__timeFilter("Timestamp") LIMIT 1000'
    );
  });

  it('uses SELECT * when columns is empty', () => {
    const sql = generateSchemaExplorerSql({ database: 'default', table: 'otel_logs', columns: [] });

    expect(sql).toEqual('SELECT * FROM "default"."otel_logs" LIMIT 1000');
  });

  it('omits WHERE when timeColumn is falsy', () => {
    const sql = generateSchemaExplorerSql({ database: 'default', table: 'otel_logs', columns: ['Body'] });

    expect(sql).toEqual('SELECT "Body" FROM "default"."otel_logs" LIMIT 1000');
  });

  it('omits LIMIT when limit is 0 or negative', () => {
    expect(generateSchemaExplorerSql({ database: 'default', table: 'otel_logs', columns: ['Body'], limit: 0 })).toEqual(
      'SELECT "Body" FROM "default"."otel_logs"'
    );

    expect(
      generateSchemaExplorerSql({ database: 'default', table: 'otel_logs', columns: ['Body'], limit: -1 })
    ).toEqual('SELECT "Body" FROM "default"."otel_logs"');
  });

  it('handles an empty database using getTableIdentifier', () => {
    const sql = generateSchemaExplorerSql({ database: '', table: 'otel_logs', columns: [] });

    expect(sql).toEqual('SELECT * FROM "otel_logs" LIMIT 1000');
  });
});

describe('buildBuilderOptionsFromSchema', () => {
  it('builds selected columns in order, filling type from the schema', () => {
    const columns = [col('Timestamp', 'DateTime'), col('Body', 'String')];

    const opts = buildBuilderOptionsFromSchema('default', 'otel_logs', columns, ['Body', 'Timestamp']);

    expect(opts).toEqual({
      database: 'default',
      table: 'otel_logs',
      queryType: QueryType.Table,
      mode: BuilderMode.List,
      limit: 1000,
      meta: {},
      columns: [
        { name: 'Body', type: 'String' },
        { name: 'Timestamp', type: 'DateTime' },
      ],
      filters: [],
    });
  });

  it('falls back to String type when a selected column is not found', () => {
    const opts = buildBuilderOptionsFromSchema('default', 'otel_logs', [], ['Unknown']);

    expect(opts.columns).toEqual([{ name: 'Unknown', type: 'String' }]);
  });

  it('selects all columns when no columns are selected', () => {
    const opts = buildBuilderOptionsFromSchema('default', 'otel_logs', [], []);

    expect(opts.columns).toEqual([{ name: '*' }]);
  });

  it('generates valid SELECT * SQL when no columns are selected', () => {
    const opts = buildBuilderOptionsFromSchema('default', 'otel_logs', [], []);

    const sql = generateSql(opts);

    expect(sql).toContain('SELECT *');
    expect(sql).not.toContain('SELECT FROM');
  });

  it('adds a dashboard time range filter on the given time column', () => {
    const opts = buildBuilderOptionsFromSchema('default', 'otel_logs', [], [], 'Timestamp');

    expect(opts.filters).toEqual([
      {
        filterType: 'custom',
        type: 'datetime',
        key: 'Timestamp',
        condition: 'AND',
        operator: FilterOperator.WithInGrafanaTimeRange,
      },
    ]);
  });

  it('has no filters when timeColumn is not given', () => {
    const opts = buildBuilderOptionsFromSchema('default', 'otel_logs', [], []);

    expect(opts.filters).toEqual([]);
  });

  it('generates SQL with the dashboard time range macros for the given time column', () => {
    const opts = buildBuilderOptionsFromSchema('default', 'otel_logs', [], [], 'Timestamp');

    const sql = generateSql(opts);

    expect(sql).toContain('$__fromTime');
    expect(sql).toContain('$__toTime');
  });
});
