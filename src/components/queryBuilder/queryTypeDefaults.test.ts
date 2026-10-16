import { newMockDatasource } from '__mocks__/datasource';
import {
  AggregateType,
  BuilderMode,
  ColumnHint,
  FilterOperator,
  QueryBuilderOptions,
  QueryType,
  TableColumn,
} from 'types/queryBuilder';
import { getQueryTypeChangeDefaults, guessMissingRoles } from './queryTypeDefaults';

const userFilter = {
  type: 'string',
  operator: FilterOperator.Equals,
  filterType: 'custom',
  key: 'a',
  condition: 'AND',
  value: 'x',
} as const;

const tableQuery = (overrides: Partial<QueryBuilderOptions> = {}): QueryBuilderOptions => ({
  database: 'db',
  table: 't',
  queryType: QueryType.Table,
  mode: BuilderMode.List,
  columns: [{ name: 'Body' }, { name: 'ts', hint: ColumnHint.Time }],
  filters: [{ ...userFilter }],
  orderBy: [],
  meta: {},
  ...overrides,
});

const column = (name: string, type: string): TableColumn => ({ name, type, picklistValues: [] });

describe('getQueryTypeChangeDefaults', () => {
  // Logs configured on db.t, the table of tableQuery().
  const logsDatasource = () => {
    const ds = newMockDatasource();
    ds.settings.jsonData.logs = { defaultDatabase: 'db', defaultTable: 't' };
    jest.spyOn(ds, 'getDefaultLogsColumns').mockReturnValue(
      new Map([
        [ColumnHint.Time, 'Timestamp'],
        [ColumnHint.LogMessage, 'Body'],
      ])
    );
    return ds;
  };

  it('fills only the missing roles and keeps everything else', () => {
    const next = getQueryTypeChangeDefaults(logsDatasource(), tableQuery(), QueryType.Logs);

    // The Time role is kept as set; the plain Body column takes the Message role.
    expect(next.columns).toEqual([
      { name: 'ts', hint: ColumnHint.Time },
      { name: 'Body', hint: ColumnHint.LogMessage },
    ]);
    expect(next).not.toHaveProperty('database');
    expect(next).not.toHaveProperty('table');
  });

  it('adds a time-range filter to existing filters', () => {
    const next = getQueryTypeChangeDefaults(logsDatasource(), tableQuery(), QueryType.TimeSeries);

    expect(next.filters).toEqual([
      expect.objectContaining({ operator: FilterOperator.WithInGrafanaTimeRange }),
      userFilter,
    ]);
  });

  it('adds the type default filters and ordering when the query has none', () => {
    const next = getQueryTypeChangeDefaults(logsDatasource(), tableQuery({ filters: [] }), QueryType.Logs);

    expect(next.filters?.length).toBeGreaterThan(1);
    expect(next.orderBy?.length).toBeGreaterThan(0);
  });

  it('applies the configured roles and OTel setting only on the configured table', () => {
    const ds = logsDatasource();
    jest.spyOn(ds, 'getLogsOtelVersion').mockReturnValue('latest');

    const next = getQueryTypeChangeDefaults(
      ds,
      tableQuery({ table: 'events', columns: [{ name: 'user' }] }),
      QueryType.Logs
    );

    expect(next.columns).toEqual([{ name: 'user' }]);
    expect(next.meta).toMatchObject({ otelEnabled: false, otelVersion: undefined });
  });

  it('adds no time-range filter to filters joined with OR', () => {
    const filters = [{ ...userFilter }, { ...userFilter, key: 'b', condition: 'OR' as const }];

    const next = getQueryTypeChangeDefaults(logsDatasource(), tableQuery({ filters }), QueryType.TimeSeries);

    expect(next.filters).toEqual(filters);
  });

  it('guesses missing roles by column name', () => {
    const allColumns = [
      column('trace_id', 'String'),
      column('span_id', 'String'),
      column('parent_span_id', 'String'),
      column('service_name', 'String'),
      column('operation_name', 'String'),
      column('timestamp', 'DateTime64(9)'),
      column('duration', 'UInt64'),
    ];

    const roles = guessMissingRoles(tableQuery({ columns: [{ name: 'a' }] }), QueryType.Traces, allColumns);

    expect(roles.map((c) => c.hint)).toEqual(
      expect.arrayContaining([
        ColumnHint.TraceId,
        ColumnHint.TraceSpanId,
        ColumnHint.TraceServiceName,
        ColumnHint.Time,
        ColumnHint.TraceDurationTime,
      ])
    );
  });

  describe('builder mode', () => {
    const count = [{ aggregateType: AggregateType.Count, column: '*' }];

    it('shows aggregates of a Table aggregate query in Time series', () => {
      const next = getQueryTypeChangeDefaults(
        logsDatasource(),
        tableQuery({ mode: BuilderMode.Aggregate, aggregates: count, groupBy: ['b'] }),
        QueryType.TimeSeries
      );

      expect(next.mode).toBe(BuilderMode.Trend);
      expect(next).not.toHaveProperty('aggregates');
    });

    it('drops inactive aggregates a Time series simple query would otherwise apply', () => {
      const next = getQueryTypeChangeDefaults(
        logsDatasource(),
        tableQuery({ mode: BuilderMode.List, aggregates: count, groupBy: ['b'] }),
        QueryType.TimeSeries
      );

      expect(next).toMatchObject({ mode: BuilderMode.Aggregate, aggregates: [], groupBy: [] });
    });

    it('keeps a group-by-only Table query grouping through Time series', () => {
      const next = getQueryTypeChangeDefaults(
        logsDatasource(),
        tableQuery({ mode: BuilderMode.Aggregate, groupBy: ['b'] }),
        QueryType.TimeSeries
      );

      expect(next.mode).toBe(BuilderMode.Trend);
      expect(next).not.toHaveProperty('groupBy');
    });

    it('selects the grouped columns instead of the time column for a Time series trend query in Table', () => {
      const next = getQueryTypeChangeDefaults(
        logsDatasource(),
        tableQuery({
          queryType: QueryType.TimeSeries,
          mode: BuilderMode.Trend,
          columns: [{ name: 'ts', hint: ColumnHint.Time }],
          aggregates: count,
          groupBy: ['service'],
        }),
        QueryType.Table
      );

      expect(next).toMatchObject({ mode: BuilderMode.Aggregate, columns: [{ name: 'service' }] });
    });

    it('maps a Time series simple query to Table list mode', () => {
      const next = getQueryTypeChangeDefaults(
        logsDatasource(),
        tableQuery({ queryType: QueryType.TimeSeries, mode: BuilderMode.Aggregate }),
        QueryType.Table
      );

      expect(next.mode).toBe(BuilderMode.List);
    });
  });

  describe('source', () => {
    const traceDatasource = () => {
      const ds = newMockDatasource(); // generic default: foo.bar
      ds.settings.jsonData.traces = { defaultDatabase: 'otel', defaultTable: 'otel_traces' };
      return ds;
    };

    it('moves a query on a default table to the target type default', () => {
      const next = getQueryTypeChangeDefaults(
        traceDatasource(),
        tableQuery({ database: 'foo', table: 'bar' }),
        QueryType.Traces
      );

      expect(next).toMatchObject({ database: 'otel', table: 'otel_traces' });
    });

    it('keeps a table that is not a default', () => {
      const next = getQueryTypeChangeDefaults(traceDatasource(), tableQuery(), QueryType.Traces);

      expect(next).not.toHaveProperty('database');
      expect(next).not.toHaveProperty('table');
    });
  });

  it('takes the OTel setting from the target signal when switching between logs and traces', () => {
    const ds = newMockDatasource();
    jest.spyOn(ds, 'getLogsOtelVersion').mockReturnValue(undefined);
    const options = tableQuery({ queryType: QueryType.Traces, meta: { otelEnabled: true, otelVersion: 'latest' } });

    const next = getQueryTypeChangeDefaults(ds, options, QueryType.Logs);

    expect(next.meta).toMatchObject({ otelEnabled: false, otelVersion: undefined });
  });

  it('keeps OTel settings already set when not switching signals', () => {
    const ds = newMockDatasource();
    ds.settings.jsonData.traces = { defaultDatabase: 'db', defaultTable: 't' };
    jest.spyOn(ds, 'getTraceOtelVersion').mockReturnValue('latest');

    const next = getQueryTypeChangeDefaults(ds, tableQuery({ meta: { otelEnabled: false } }), QueryType.Traces);

    expect(next.meta).toMatchObject({ otelEnabled: false, otelVersion: 'latest' });
  });

  it('returns nothing for a query with nothing configured yet', () => {
    const empty = { database: 'db', table: 't', queryType: QueryType.Table, columns: [], meta: {} };

    expect(getQueryTypeChangeDefaults(logsDatasource(), empty, QueryType.Logs)).toEqual({});
  });
});
