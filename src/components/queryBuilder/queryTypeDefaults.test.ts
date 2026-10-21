import { newMockDatasource } from '__mocks__/datasource';
import {
  AggregateType,
  BuilderMode,
  ColumnHint,
  Filter,
  FilterOperator,
  OrderByDirection,
  QueryBuilderOptions,
  QueryType,
  TableColumn,
} from 'types/queryBuilder';
import { getQueryTypeChangeDefaults } from './queryTypeDefaults';
import { guessMissingRoles } from './roleColumns';
import {
  getDefaultLogsFilters,
  getDefaultLogsOrderBy,
  getDefaultTraceFilters,
  getDefaultTraceOrderBy,
} from './defaultQueryOptions';
import { buildDefaultLogsColumns } from './views/logsQueryBuilderHooks';
import { getDefaultTimeSeriesFilters, getDefaultTimeSeriesOrderBy } from './views/timeSeriesQueryBuilderHooks';
import { generateSql } from 'data/sqlGenerator';
import { isBuilderOptionsRunnable } from 'data/utils';

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

    it('moves a query on a default table to the target type default, keeping only its limit', () => {
      const options = tableQuery({
        database: 'foo',
        table: 'bar',
        columns: [{ name: 'user_id' }, { name: 'action' }],
        orderBy: [{ name: 'user_id', dir: OrderByDirection.ASC }],
        aggregates: [{ aggregateType: AggregateType.Count, column: 'user_id' }],
        groupBy: ['action'],
        limit: 250,
      });

      const next = getQueryTypeChangeDefaults(traceDatasource(), options, QueryType.Traces);

      // Nothing of foo.bar's columns is carried over to otel_traces.
      expect(next).toEqual({
        database: 'otel',
        table: 'otel_traces',
        columns: [],
        filters: [],
        orderBy: [],
        aggregates: [],
        groupBy: [],
      });
      // So the Traces builder mounts it as a new query and applies its full defaults.
      expect(isBuilderOptionsRunnable({ ...options, ...next })).toBe(false);
      expect({ ...options, ...next }.limit).toBe(250);
    });

    it('moves an OTel Traces query to Logs without any trace column left in the SQL', () => {
      const ds = newMockDatasource();
      ds.settings.jsonData.logs = {
        defaultDatabase: 'otel',
        defaultTable: 'otel_logs',
        otelEnabled: true,
        otelVersion: 'latest',
      };
      ds.settings.jsonData.traces = {
        defaultDatabase: 'otel',
        defaultTable: 'otel_traces',
        otelEnabled: true,
        otelVersion: 'latest',
      };
      // A new Traces query, as the Traces builder sets it up.
      const traces: QueryBuilderOptions = {
        database: 'otel',
        table: 'otel_traces',
        queryType: QueryType.Traces,
        columns: Array.from(ds.getDefaultTraceColumns(), ([hint, name]) => ({ name, hint })),
        filters: getDefaultTraceFilters(),
        orderBy: getDefaultTraceOrderBy(),
        limit: 1000,
        meta: { otelEnabled: true, otelVersion: 'latest' },
      };

      const moved = { ...traces, ...getQueryTypeChangeDefaults(ds, traces, QueryType.Logs), queryType: QueryType.Logs };
      expect(moved).toMatchObject({ database: 'otel', table: 'otel_logs' });
      expect(isBuilderOptionsRunnable(moved)).toBe(false);

      // The Logs builder then applies its new-query defaults (useLogDefaultsOnMount, useDefaultFilters).
      const sql = generateSql({
        ...moved,
        columns: buildDefaultLogsColumns(ds),
        filters: getDefaultLogsFilters(),
        orderBy: getDefaultLogsOrderBy(),
        meta: { ...moved.meta, otelEnabled: true, otelVersion: 'latest' },
      });

      expect(sql).toContain('"otel"."otel_logs"');
      for (const traceColumn of ['ParentSpanId', 'Duration', 'SpanName', 'SpanId']) {
        expect(sql).not.toContain(traceColumn);
      }
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

  it('adds the log context and extra default columns on the configured logs table', () => {
    const ds = logsDatasource();
    ds.settings.jsonData.logs = {
      ...ds.settings.jsonData.logs,
      selectContextColumns: true,
      contextColumns: ['Host', 'LogAttributes', "LogAttributes['pod']"],
    };

    const next = getQueryTypeChangeDefaults(ds, tableQuery({ columns: [{ name: 'Host' }] }), QueryType.Logs);

    // Host is already selected; the Map key is covered by its Map column, so it is not added twice.
    expect(next.columns).toEqual([
      { name: 'Host' },
      { name: 'Timestamp', hint: ColumnHint.Time },
      { name: 'Body', hint: ColumnHint.LogMessage },
      { name: 'LogAttributes' },
    ]);
  });

  it('keeps Trend aggregates through a round trip by Logs', () => {
    const ds = newMockDatasource();
    const trend = tableQuery({
      queryType: QueryType.TimeSeries,
      mode: BuilderMode.Trend,
      aggregates: [{ aggregateType: AggregateType.Count, column: '*' }],
      groupBy: ['ServiceName'],
    });

    const logs = { ...trend, ...getQueryTypeChangeDefaults(ds, trend, QueryType.Logs), queryType: QueryType.Logs };
    const back = getQueryTypeChangeDefaults(ds, logs, QueryType.TimeSeries);

    expect(back.mode).toBe(BuilderMode.Trend);
    expect(back).not.toHaveProperty('aggregates');
    expect(back).not.toHaveProperty('groupBy');
    expect({ ...logs, ...back }.aggregates).toEqual(trend.aggregates);
  });

  it('leaves the trace default filters and ordering behind on a picked table switched to Logs', () => {
    // A datasource without a logs default: the picked otel_traces table stays.
    const ds = newMockDatasource();
    const traces: QueryBuilderOptions = {
      database: 'otel',
      table: 'otel_traces',
      queryType: QueryType.Traces,
      columns: [
        { name: 'TraceId', hint: ColumnHint.TraceId },
        { name: 'ParentSpanId', hint: ColumnHint.TraceParentSpanId },
        { name: 'Duration', hint: ColumnHint.TraceDurationTime },
        { name: 'Timestamp', hint: ColumnHint.Time },
      ],
      filters: [...getDefaultTraceFilters(), { ...userFilter, key: 'SpanKind', value: 'Server' }],
      orderBy: getDefaultTraceOrderBy(),
      limit: 1000,
      meta: {},
    };

    const next = getQueryTypeChangeDefaults(ds, traces, QueryType.Logs);
    const sql = generateSql({ ...traces, ...next, queryType: QueryType.Logs });

    expect(next).not.toHaveProperty('table');
    expect(sql).toContain('"otel"."otel_traces"');
    expect(sql).not.toContain('ParentSpanId');
    expect(sql).not.toContain('Duration');
    // A filter set on a column, and the time range, stay.
    expect(sql).toContain("SpanKind = 'Server'");
    expect(next.filters?.[0]).toMatchObject({ operator: FilterOperator.WithInGrafanaTimeRange });
    // The role columns stay, unseen, for the way back to Traces.
    expect(next.columns).toEqual(
      expect.arrayContaining([{ name: 'ParentSpanId', hint: ColumnHint.TraceParentSpanId }])
    );
  });

  it('restores the trace defaults on the way back from Logs', () => {
    const ds = newMockDatasource();
    const traces = tableQuery({
      table: 'otel_traces',
      queryType: QueryType.Traces,
      filters: getDefaultTraceFilters(),
      orderBy: getDefaultTraceOrderBy(),
    });

    const logs = { ...traces, ...getQueryTypeChangeDefaults(ds, traces, QueryType.Logs), queryType: QueryType.Logs };
    const back = getQueryTypeChangeDefaults(ds, logs, QueryType.Traces);

    expect(back.filters).toEqual(getDefaultTraceFilters());
    expect(back.orderBy).toEqual(getDefaultTraceOrderBy());
  });

  it('leaves the trace defaults behind on a Time series round trip through Traces', () => {
    const ds = newMockDatasource();
    const series = tableQuery({
      table: 'otel_traces',
      queryType: QueryType.TimeSeries,
      mode: BuilderMode.Trend,
      aggregates: [{ aggregateType: AggregateType.Count, column: '*' }],
      filters: getDefaultTimeSeriesFilters(),
      orderBy: getDefaultTimeSeriesOrderBy(),
    });

    const traces = {
      ...series,
      ...getQueryTypeChangeDefaults(ds, series, QueryType.Traces),
      queryType: QueryType.Traces,
    };
    expect(traces.filters?.some((f) => f.hint === ColumnHint.TraceParentSpanId)).toBe(true);
    const back = getQueryTypeChangeDefaults(ds, traces, QueryType.TimeSeries);

    expect(back.filters).toEqual(getDefaultTimeSeriesFilters());
    expect(back.orderBy).toEqual(getDefaultTimeSeriesOrderBy());
  });

  it('leaves the role columns but the time behind going to Time series, which would chart them', () => {
    const traces = tableQuery({
      queryType: QueryType.Traces,
      columns: [
        { name: 'Timestamp', hint: ColumnHint.Time },
        { name: 'TraceId', hint: ColumnHint.TraceId },
        { name: 'Duration', hint: ColumnHint.TraceDurationTime },
        { name: 'bytes' },
      ],
    });

    const next = getQueryTypeChangeDefaults(newMockDatasource(), traces, QueryType.TimeSeries);

    expect(next.columns).toEqual([{ name: 'Timestamp', hint: ColumnHint.Time }, { name: 'bytes' }]);
    // Table lists them as columns, so it keeps them.
    expect(getQueryTypeChangeDefaults(newMockDatasource(), traces, QueryType.Table).columns).toEqual(traces.columns);
  });

  it('keeps a trace filter the user edited when leaving Traces', () => {
    const edited: Filter[] = getDefaultTraceFilters().map((f) =>
      f.hint === ColumnHint.TraceServiceName ? ({ ...f, operator: FilterOperator.Equals, value: 'api' } as Filter) : f
    );
    const traces = tableQuery({ queryType: QueryType.Traces, filters: edited });

    const next = getQueryTypeChangeDefaults(newMockDatasource(), traces, QueryType.Logs);

    expect(next.filters?.map((f) => f.hint)).toEqual([ColumnHint.Time, ColumnHint.TraceServiceName]);
  });

  it('keeps edited role filters and ordering applying in Time series, on the column itself', () => {
    const ds = newMockDatasource();
    const levelError: Filter = {
      type: 'string',
      operator: FilterOperator.Equals,
      filterType: 'custom',
      key: '',
      hint: ColumnHint.LogLevel,
      condition: 'AND',
      value: 'error',
    };
    const logs = tableQuery({
      queryType: QueryType.Logs,
      columns: [
        { name: 'Timestamp', type: 'DateTime64(9)', hint: ColumnHint.Time },
        { name: 'SeverityText', type: 'LowCardinality(String)', hint: ColumnHint.LogLevel },
        { name: 'Body', type: 'String', hint: ColumnHint.LogMessage },
      ],
      filters: [getDefaultLogsFilters()[0], levelError],
      orderBy: getDefaultLogsOrderBy(),
    });

    const next = getQueryTypeChangeDefaults(ds, logs, QueryType.TimeSeries);
    const sql = generateSql({ ...logs, ...next, queryType: QueryType.TimeSeries });

    expect(next.filters).toContainEqual({
      ...levelError,
      hint: undefined,
      key: 'SeverityText',
      type: 'LowCardinality(String)',
    } as Filter);
    expect(sql).toContain("SeverityText = 'error'");
    expect(sql).not.toContain('Body');
  });

  it('keeps an edited Service Name filter and a flipped Duration ordering from Traces in Time series', () => {
    const ds = newMockDatasource();
    const filters: Filter[] = getDefaultTraceFilters().map((f) =>
      f.hint === ColumnHint.TraceServiceName ? ({ ...f, operator: FilterOperator.Equals, value: 'api' } as Filter) : f
    );
    const orderBy = getDefaultTraceOrderBy().map((o) =>
      o.hint === ColumnHint.TraceDurationTime ? { ...o, dir: OrderByDirection.ASC, default: undefined } : o
    );
    const traces = tableQuery({
      queryType: QueryType.Traces,
      columns: [
        { name: 'Timestamp', type: 'DateTime64(9)', hint: ColumnHint.Time },
        { name: 'ServiceName', type: 'LowCardinality(String)', hint: ColumnHint.TraceServiceName },
        { name: 'Duration', type: 'Int64', hint: ColumnHint.TraceDurationTime },
      ],
      filters,
      orderBy,
    });

    const next = getQueryTypeChangeDefaults(ds, traces, QueryType.TimeSeries);
    const sql = generateSql({ ...traces, ...next, queryType: QueryType.TimeSeries });

    expect(sql).toContain("ServiceName = 'api'");
    expect(sql).toMatch(/ORDER BY .*Duration ASC/);
    // The untouched trace defaults are still left behind.
    expect(sql).not.toContain('ParentSpanId');
    expect(sql).not.toContain('Duration > 0');
  });

  it('keeps a default ordering whose direction the user flipped', () => {
    // OrderByEditor clears `default` on an edit.
    const flipped = getDefaultLogsOrderBy().map((o) => ({ ...o, dir: OrderByDirection.ASC, default: undefined }));
    const logs = tableQuery({ queryType: QueryType.Logs, orderBy: flipped });

    expect(getQueryTypeChangeDefaults(newMockDatasource(), logs, QueryType.TimeSeries).orderBy).toEqual(flipped);
    expect(getQueryTypeChangeDefaults(newMockDatasource(), logs, QueryType.Traces).orderBy).toEqual(flipped);
  });

  it('keeps ordering and filters of its own over the type defaults', () => {
    const ordered = tableQuery({ orderBy: [{ name: 'Body', dir: OrderByDirection.ASC }] });

    const next = getQueryTypeChangeDefaults(newMockDatasource(), ordered, QueryType.Traces);

    expect(next.orderBy).toEqual([{ name: 'Body', dir: OrderByDirection.ASC }]);
    expect(next.filters).toEqual([
      expect.objectContaining({ operator: FilterOperator.WithInGrafanaTimeRange }),
      userFilter,
    ]);
  });

  it('leaves the log level filter behind when a logs query goes to Traces', () => {
    const logs = tableQuery({
      queryType: QueryType.Logs,
      filters: getDefaultLogsFilters(),
      orderBy: getDefaultLogsOrderBy(),
    });

    const next = getQueryTypeChangeDefaults(newMockDatasource(), logs, QueryType.Traces);

    expect(next.filters?.some((f) => f.hint === ColumnHint.LogLevel)).toBe(false);
  });

  it('returns nothing for a query with nothing configured yet', () => {
    const empty = { database: 'db', table: 't', queryType: QueryType.Table, columns: [], meta: {} };

    expect(getQueryTypeChangeDefaults(logsDatasource(), empty, QueryType.Logs)).toEqual({});
  });
});
