import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getCompactFilterColumns, QueryBuilder } from './QueryBuilder';
import { getDefaultCompactMode } from './CompactModeBar';
import { Datasource } from 'data/CHDatasource';
import { generateSql } from 'data/sqlGenerator';
import {
  BuilderMode,
  ColumnHint,
  FilterOperator,
  OrderByDirection,
  QueryBuilderOptions,
  QueryType,
  TableKeys,
  TimeUnit,
} from 'types/queryBuilder';
import { setColumnByHint, useBuilderOptionsState } from 'hooks/useBuilderOptionsState';
import { defaultCHBuilderQuery } from 'types/sql';
import { CoreApp } from '@grafana/data';
import { selectors } from 'selectors';

jest.mock('./views/TableQueryBuilder', () => ({
  TableQueryBuilder: () => <div data-testid="table-component" />,
}));
jest.mock('./views/LogsQueryBuilder', () => ({
  LogsQueryBuilder: ({ builderOptions }: any) => (
    <div data-testid="logs-component" data-database={builderOptions.database} data-table={builderOptions.table} />
  ),
}));
jest.mock('./views/TimeSeriesQueryBuilder', () => ({
  TimeSeriesQueryBuilder: () => <div data-testid="time-series-component" />,
}));
jest.mock('./views/TraceQueryBuilder', () => ({
  TraceQueryBuilder: ({ builderOptions }: any) => (
    <div data-testid="trace-component" data-database={builderOptions.database} data-table={builderOptions.table} />
  ),
}));

describe('QueryBuilder', () => {
  const setState = jest.fn();
  const mockDs = { settings: { jsonData: {} } } as Datasource;

  mockDs.getSignalType = jest.fn(() => undefined);
  mockDs.getConfigMode = jest.fn(() => 'classic');
  mockDs.isSingleTableMode = jest.fn(() => false);
  mockDs.fetchDatabases = jest.fn(() => Promise.resolve([]));
  mockDs.fetchTables = jest.fn((_db?: string) => Promise.resolve([]));
  mockDs.getDefaultLogsColumns = jest.fn((_db?: string) => new Map());
  mockDs.getDefaultLogsTable = jest.fn((_db?: string) => '');
  mockDs.getDefaultLogsDatabase = jest.fn((_db?: string) => '');
  mockDs.getLogsOtelVersion = jest.fn((_db?: string) => '');
  mockDs.getDefaultDatabase = jest.fn((_db?: string) => '');
  mockDs.getDefaultTraceColumns = jest.fn((_db?: string) => new Map());
  mockDs.shouldSelectLogContextColumns = jest.fn((_db?: string) => false);
  mockDs.getAdditionalLogColumns = jest.fn(() => []);
  mockDs.getDefaultTable = jest.fn((_db?: string) => '');
  mockDs.getDefaultTraceDatabase = jest.fn((_db?: string) => '');
  mockDs.getDefaultTraceTable = jest.fn((_db?: string) => '');
  mockDs.getDefaultTraceDurationUnit = jest.fn((_db?: string) => 'ms' as TimeUnit);
  mockDs.getTraceOtelVersion = jest.fn((_db?: string) => '');
  mockDs.getDefaultTraceFlattenNested = jest.fn((_db?: string) => false);
  mockDs.getDefaultTraceEventsColumnPrefix = jest.fn((_db?: string) => '');
  mockDs.getDefaultTraceLinksColumnPrefix = jest.fn((_db?: string) => '');
  mockDs.getTraceTimestampTableSuffix = jest.fn((_db?: string) => '_trace_id_ts');
  mockDs.getLogContextColumnNames = jest.fn(() => []);
  mockDs.fetchColumns = jest.fn(() => {
    setState();
    return Promise.resolve([]);
  });
  mockDs.getColumnsCached = jest.fn(() => Promise.resolve([]));

  it('omits compact time columns from filter column options', () => {
    const filterColumns = getCompactFilterColumns(
      [
        { name: 'TimestampTime', type: 'DateTime', picklistValues: [] },
        { name: 'Timestamp', type: 'DateTime64(9)', picklistValues: [] },
        { name: 'Body', type: 'String', picklistValues: [] },
        { name: 'ingested_at', type: 'DateTime', picklistValues: [] },
      ],
      {
        database: 'otel_v2',
        table: 'otel_logs',
        queryType: QueryType.Logs,
        columns: [
          { name: 'TimestampTime', hint: ColumnHint.FilterTime },
          { name: 'Timestamp', hint: ColumnHint.Time },
          { name: 'Body', hint: ColumnHint.LogMessage },
        ],
      }
    );

    expect(filterColumns.map((column) => column.name)).toEqual(['Body', 'ingested_at']);
  });

  it('maps configured signal types to compact modes', () => {
    expect(getDefaultCompactMode('logs')).toBe('otel-logs');
    expect(getDefaultCompactMode('traces')).toBe('otel-traces');
  });

  it('renders correctly', async () => {
    const result = await waitFor(() =>
      render(
        <QueryBuilder
          app={CoreApp.PanelEditor}
          builderOptions={{
            queryType: QueryType.Table,
            mode: BuilderMode.List,
            database: 'db',
            table: 'foo',
            columns: [],
            filters: [],
          }}
          builderOptionsDispatch={() => {}}
          datasource={mockDs}
          generatedSql=""
        />
      )
    );
    expect(result.container.firstChild).not.toBeNull();
  });

  it('renders the min interval field under the query type row', async () => {
    const onMinIntervalChange = jest.fn();
    const result = await waitFor(() =>
      render(
        <QueryBuilder
          app={CoreApp.PanelEditor}
          builderOptions={{
            queryType: QueryType.Table,
            mode: BuilderMode.List,
            database: 'db',
            table: 'foo',
            columns: [],
            filters: [],
          }}
          builderOptionsDispatch={() => {}}
          datasource={mockDs}
          generatedSql=""
          minInterval="5m"
          onMinIntervalChange={onMinIntervalChange}
        />
      )
    );

    expect(result.getByTestId(selectors.components.QueryEditor.MinIntervalEditor.input)).toHaveValue('5m');
  });

  describe('compact filter chip label', () => {
    let getSignalTypeSpy: jest.SpyInstance;
    let isSingleTableModeSpy: jest.SpyInstance;

    beforeEach(() => {
      // Compact editor renders only when the datasource is single-table with a signal type.
      getSignalTypeSpy = jest.spyOn(mockDs, 'getSignalType').mockReturnValue('logs' as any);
      isSingleTableModeSpy = jest.spyOn(mockDs, 'isSingleTableMode').mockReturnValue(true);
    });

    afterEach(() => {
      getSignalTypeSpy.mockRestore();
      isSingleTableModeSpy.mockRestore();
    });

    it('shows the raw attribute column name in the compact filter chip for a hinted "+" filter', async () => {
      render(
        <QueryBuilder
          app={CoreApp.PanelEditor}
          builderOptions={{
            queryType: QueryType.Logs,
            mode: BuilderMode.List,
            database: 'otel_v2',
            table: 'otel_logs',
            columns: [
              { name: 'Timestamp', hint: ColumnHint.Time },
              { name: 'Body', hint: ColumnHint.LogMessage },
              { name: 'LogAttributes', hint: ColumnHint.LogAttributes },
            ],
            filters: [
              {
                condition: 'AND',
                filterType: 'custom',
                key: '',
                hint: ColumnHint.LogAttributes,
                mapKey: 'user.tier',
                type: 'Map(String, String)',
                operator: FilterOperator.Equals,
                value: 'basic',
              } as any,
            ],
          }}
          builderOptionsDispatch={() => {}}
          datasource={mockDs}
          generatedSql=""
        />
      );

      // The log-view "+" stores { key: '', hint }, so the chip must resolve the hint to the
      // column name and read "LogAttributes.user.tier" (matching the Add filter path), not the
      // friendly hint label "log attributes.user.tier".
      expect(await screen.findByText('LogAttributes.user.tier')).toBeInTheDocument();
      expect(screen.queryByText('log attributes.user.tier')).not.toBeInTheDocument();
    });
  });

  it('renders TableQueryBuilder when queryType is Table', () => {
    render(
      <React.Suspense fallback={<div>Loading...</div>}>
        <QueryBuilder
          app={CoreApp.PanelEditor}
          builderOptions={{
            queryType: QueryType.Table,
            mode: BuilderMode.List,
            database: 'db',
            table: 'foo',
            columns: [],
            filters: [],
          }}
          builderOptionsDispatch={() => {}}
          datasource={mockDs}
          generatedSql=""
        />
      </React.Suspense>
    );
    expect(screen.getByTestId('table-component')).toBeInTheDocument();
  });

  it('renders LogsQueryBuilder when queryType is Logs', async () => {
    render(
      <QueryBuilder
        app={CoreApp.PanelEditor}
        builderOptions={{
          queryType: QueryType.Logs,
          mode: BuilderMode.List,
          database: 'db',
          table: 'foo',
          columns: [],
          filters: [],
        }}
        builderOptionsDispatch={() => {}}
        datasource={mockDs}
        generatedSql=""
      />
    );
    expect(screen.getByTestId('logs-component')).toBeInTheDocument();
  });

  it('renders TimeSeriesQueryBuilder when queryType is TimeSeries', async () => {
    render(
      <QueryBuilder
        app={CoreApp.PanelEditor}
        builderOptions={{
          queryType: QueryType.TimeSeries,
          mode: BuilderMode.List,
          database: 'db',
          table: 'foo',
          columns: [],
          filters: [],
        }}
        builderOptionsDispatch={() => {}}
        datasource={mockDs}
        generatedSql=""
      />
    );
    await waitFor(() => {
      expect(screen.getByTestId('time-series-component')).toBeInTheDocument();
    });
  });

  it('renders TraceQueryBuilder when queryType is Traces', async () => {
    render(
      <QueryBuilder
        app={CoreApp.PanelEditor}
        builderOptions={{
          queryType: QueryType.Traces,
          mode: BuilderMode.List,
          database: 'db',
          table: 'foo',
          columns: [],
          filters: [],
        }}
        builderOptionsDispatch={() => {}}
        datasource={mockDs}
        generatedSql=""
      />
    );
    await waitFor(() => {
      expect(screen.getByTestId('trace-component')).toBeInTheDocument();
    });
  });

  it('renders logs compact mode without database/table or query type selectors', async () => {
    const compactDs = {
      ...mockDs,
      getSignalType: jest.fn(() => 'logs'),
      getConfigMode: jest.fn(() => 'single-table'),
      isSingleTableMode: jest.fn(() => true),
      getDefaultLogsDatabase: jest.fn(() => 'otel_v2'),
      getDefaultLogsTable: jest.fn(() => 'otel_logs'),
      getDefaultLogsColumns: jest.fn(
        () =>
          new Map([
            ['filter_time', 'TimestampTime'],
            ['time', 'Timestamp'],
            ['log_message', 'Body'],
          ])
      ),
      getLogsOtelVersion: jest.fn(() => '1.29.0'),
      shouldSelectLogContextColumns: jest.fn(() => false),
      getLogContextColumnNames: jest.fn(() => []),
    } as unknown as Datasource;
    const builderOptionsDispatch = jest.fn();
    const onQueryChange = jest.fn();
    const onEditAsSql = jest.fn();
    const onRunQuery = jest.fn();

    render(
      <QueryBuilder
        app={CoreApp.PanelEditor}
        builderOptions={{
          queryType: QueryType.Table,
          mode: BuilderMode.List,
          database: '',
          table: '',
          columns: [],
          filters: [],
        }}
        builderOptionsDispatch={builderOptionsDispatch}
        datasource={compactDs}
        generatedSql=""
        onQueryChange={onQueryChange}
        onEditAsSql={onEditAsSql}
        onRunQuery={onRunQuery}
      />
    );

    expect(screen.getByTestId('compact-mode-bar')).toBeInTheDocument();
    expect(screen.getByTestId('compact-filter-bar')).toBeInTheDocument();
    expect(screen.queryByText('Database')).not.toBeInTheDocument();
    expect(screen.queryByText('Query Type')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search log body text...'), { target: { value: 'error' } });
    fireEvent.blur(screen.getByPlaceholderText('Search log body text...'));
    expect(screen.getByRole('button', { name: 'Add filter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Order by' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open query history' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'set_all_options' }))
    );
    expect(onQueryChange).toHaveBeenCalledWith(
      expect.objectContaining({
        database: 'otel_v2',
        table: 'otel_logs',
        queryType: QueryType.Logs,
      })
    );
    expect(onQueryChange).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ logMessageLike: 'error' }),
      })
    );
    expect(onRunQuery).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open in SQL editor' }));
    expect(onEditAsSql).toHaveBeenCalledWith(
      expect.objectContaining({
        database: 'otel_v2',
        table: 'otel_logs',
        queryType: QueryType.Logs,
      })
    );
  });

  // Drive the REAL reducer (not a jest.fn dispatch) through CompactQueryEditor so the test observes
  // the composed column set after every hook has run, and can catch a duplicate projection.
  const renderCompactWithRealReducer = (datasource: Datasource): (() => QueryBuilderOptions) => {
    let latest: QueryBuilderOptions = defaultCHBuilderQuery.builderOptions;
    const Harness = () => {
      const [builderOptions, builderOptionsDispatch] = useBuilderOptionsState(defaultCHBuilderQuery.builderOptions);
      latest = builderOptions;
      return (
        <QueryBuilder
          app={CoreApp.PanelEditor}
          builderOptions={builderOptions}
          builderOptionsDispatch={builderOptionsDispatch}
          datasource={datasource}
          generatedSql=""
          onQueryChange={jest.fn()}
        />
      );
    };
    render(<Harness />);
    return () => latest;
  };

  it('emits no runnable query for a non-OTel compact logs table before its schema loads', async () => {
    // Cold-load transient: fetchColumns has not returned, so no time/message/scalar column can be
    // resolved. The logs query must be empty rather than an invalid `SELECT  FROM host_logs`, which
    // ClickHouse rejects with a 400. generateSql returns '' for a columns-less logs query, and
    // filterQuery (tested in CHDatasource) skips an empty query so Grafana never sends it.
    const compactDs = {
      ...mockDs,
      getSignalType: jest.fn(() => 'logs'),
      getConfigMode: jest.fn(() => 'single-table'),
      isSingleTableMode: jest.fn(() => true),
      getDefaultLogsDatabase: jest.fn(() => 'logs'),
      getDefaultLogsTable: jest.fn(() => 'host_logs'),
      getDefaultLogsColumns: jest.fn(() => new Map()),
      getLogsOtelVersion: jest.fn(() => undefined),
      shouldSelectLogContextColumns: jest.fn(() => false),
      getLogContextColumnNames: jest.fn(() => []),
      getAdditionalLogColumns: jest.fn(() => []),
      fetchColumns: jest.fn(() => Promise.resolve([])),
    } as unknown as Datasource;

    const getOptions = renderCompactWithRealReducer(compactDs);

    await waitFor(() => {
      expect(getOptions().queryType).toBe(QueryType.Logs);
    });

    const options = getOptions();
    // No column could be resolved from an empty schema, so nothing is projected...
    expect(options.columns || []).toHaveLength(0);
    // ...and the generated logs query is empty rather than `SELECT  FROM "logs"."host_logs"`.
    expect(generateSql(options)).toBe('');
  });

  it('preserves an authored query when its type does not match the datasource signal', async () => {
    const compactDs = {
      ...mockDs,
      getSignalType: jest.fn(() => 'logs'),
      getConfigMode: jest.fn(() => 'single-table'),
      isSingleTableMode: jest.fn(() => true),
      getDefaultLogsDatabase: jest.fn(() => 'otel_v2'),
      getDefaultLogsTable: jest.fn(() => 'otel_logs'),
      getDefaultLogsColumns: jest.fn(
        () =>
          new Map([
            ['time', 'Timestamp'],
            ['log_message', 'Body'],
          ])
      ),
      getLogsOtelVersion: jest.fn(() => '1.29.0'),
      shouldSelectLogContextColumns: jest.fn(() => false),
      getLogContextColumnNames: jest.fn(() => []),
    } as unknown as Datasource;
    const builderOptionsDispatch = jest.fn();
    const onQueryChange = jest.fn();

    render(
      <QueryBuilder
        app={CoreApp.PanelEditor}
        builderOptions={{
          queryType: QueryType.TimeSeries,
          mode: BuilderMode.Trend,
          database: 'metrics_db',
          table: 'requests',
          columns: [{ name: 'created_at', hint: ColumnHint.Time }, { name: 'requests_count' }],
          filters: [],
          orderBy: [{ name: 'created_at', dir: OrderByDirection.ASC }],
        }}
        builderOptionsDispatch={builderOptionsDispatch}
        datasource={compactDs}
        generatedSql=""
        onQueryChange={onQueryChange}
      />
    );

    // The authored time series query falls back to the classic builder instead of being
    // replaced with compact logs defaults.
    expect(await screen.findByTestId('time-series-component')).toBeInTheDocument();
    expect(screen.queryByTestId('compact-mode-bar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('compact-filter-bar')).not.toBeInTheDocument();
    expect(builderOptionsDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'set_all_options' }));
    expect(onQueryChange).not.toHaveBeenCalled();
  });

  describe('query carried over from another single-table data source', () => {
    const serviceFilter = {
      filterType: 'custom',
      key: 'ServiceName',
      type: 'LowCardinality(String)',
      operator: FilterOperator.Equals,
      value: 'checkout',
      condition: 'AND',
    } as const;
    const severityFilter = { ...serviceFilter, key: 'SeverityText', value: 'ERROR' } as const;

    // A logs query as another single-table data source built it in Explore, with a search and two
    // filters. The editor recorded that data source as the owner.
    const carriedOverLogsQuery: QueryBuilderOptions = {
      database: 'otel_v2',
      table: 'otel_logs',
      queryType: QueryType.Logs,
      mode: BuilderMode.List,
      columns: [
        { name: 'Timestamp', hint: ColumnHint.Time },
        { name: 'Body', hint: ColumnHint.LogMessage },
      ],
      filters: [serviceFilter, severityFilter],
      orderBy: [{ name: '', hint: ColumnHint.Time, dir: OrderByDirection.DESC }],
      limit: 1000,
      meta: { logMessageLike: 'timeout', datasourceUid: 'single-table-otel-logs' },
    };
    const { datasourceUid: discardedOwner, ...unrecordedMeta } = carriedOverLogsQuery.meta ?? {};
    void discardedOwner;
    // The same query without a recorded owner: a panel opened in Explore, a history entry or a link.
    const unrecordedLogsQuery: QueryBuilderOptions = { ...carriedOverLogsQuery, meta: unrecordedMeta };

    const columnsOf = (types: Record<string, string>) =>
      Object.entries(types).map(([name, type]) => ({ name, type, picklistValues: [] }));

    const tracesDs = {
      ...mockDs,
      uid: 'single-table-traces',
      getSignalType: jest.fn(() => 'traces'),
      getConfigMode: jest.fn(() => 'single-table'),
      isSingleTableMode: jest.fn(() => true),
      getDefaultTraceDatabase: jest.fn(() => 'otel_v2'),
      getDefaultTraceTable: jest.fn(() => 'otel_traces'),
      getDefaultTraceColumns: jest.fn(
        () =>
          new Map([
            ['time', 'Timestamp'],
            ['trace_id', 'TraceId'],
          ])
      ),
      getTraceOtelVersion: jest.fn(() => '1.29.0'),
      getDefaultTraceDurationUnit: jest.fn(() => TimeUnit.Nanoseconds),
      getColumnsCached: jest.fn(() =>
        Promise.resolve(
          columnsOf({ Timestamp: 'DateTime64(9)', TraceId: 'String', ServiceName: 'LowCardinality(String)' })
        )
      ),
    } as unknown as Datasource;

    const otherLogsDs = {
      ...mockDs,
      uid: 'single-table-app-logs',
      getSignalType: jest.fn(() => 'logs'),
      getConfigMode: jest.fn(() => 'single-table'),
      isSingleTableMode: jest.fn(() => true),
      getDefaultLogsDatabase: jest.fn(() => 'otel_v2'),
      getDefaultLogsTable: jest.fn(() => 'app_logs'),
      getDefaultLogsColumns: jest.fn(
        () =>
          new Map([
            ['time', 'Timestamp'],
            ['log_message', 'Body'],
          ])
      ),
      getLogsOtelVersion: jest.fn(() => '1.29.0'),
      getColumnsCached: jest.fn(() =>
        Promise.resolve(
          columnsOf({
            Timestamp: 'DateTime64(9)',
            Body: 'String',
            ServiceName: 'LowCardinality(String)',
            SeverityText: 'LowCardinality(String)',
          })
        )
      ),
    } as unknown as Datasource;

    const renderBuilder = (app: CoreApp, datasource: Datasource, builderOptions = carriedOverLogsQuery) => {
      const builderOptionsDispatch = jest.fn();
      const onQueryChange = jest.fn();
      const onRunQuery = jest.fn();
      render(
        <QueryBuilder
          app={app}
          builderOptions={builderOptions}
          builderOptionsDispatch={builderOptionsDispatch}
          datasource={datasource}
          generatedSql=""
          onQueryChange={onQueryChange}
          onRunQuery={onRunQuery}
        />
      );
      return { builderOptionsDispatch, onQueryChange, onRunQuery };
    };

    it('converts it for the traces data source in Explore, keeping the filters that fit, and runs it', async () => {
      const { onQueryChange, onRunQuery } = renderBuilder(CoreApp.Explore, tracesDs);

      expect(screen.getByTestId('compact-filter-bar')).toBeInTheDocument();
      expect(screen.queryByText('Query Type')).not.toBeInTheDocument();
      expect(screen.queryByTestId('logs-component')).not.toBeInTheDocument();
      await waitFor(() => expect(onRunQuery).toHaveBeenCalledTimes(1));
      expect(tracesDs.getColumnsCached).toHaveBeenCalledWith('otel_v2', 'otel_traces');
      expect(onQueryChange).toHaveBeenCalledTimes(1);
      const converted = onQueryChange.mock.calls[0][0];
      expect(converted).toMatchObject({ database: 'otel_v2', table: 'otel_traces', queryType: QueryType.Traces });
      expect(converted.filters).toContainEqual(serviceFilter);
      expect(converted.filters).not.toContainEqual(severityFilter);
      expect(converted.meta.logMessageLike).toBeUndefined();
      expect(converted.meta.datasourceUid).toBe('single-table-traces');
    });

    it('still converts and runs it once when the new table columns cannot be fetched', async () => {
      const failingTracesDs = {
        ...tracesDs,
        getColumnsCached: jest.fn(() => Promise.reject(new Error('schema fetch failed'))),
      } as unknown as Datasource;
      const { onQueryChange, onRunQuery } = renderBuilder(CoreApp.Explore, failingTracesDs);

      await waitFor(() => expect(onRunQuery).toHaveBeenCalledTimes(1));
      const converted = onQueryChange.mock.calls[0][0];
      expect(converted).toMatchObject({ table: 'otel_traces', queryType: QueryType.Traces });
      expect(converted.filters).not.toContainEqual(serviceFilter);
    });

    it('retargets it to another logs table in Explore, keeping the search text and filters', async () => {
      const { onQueryChange, onRunQuery } = renderBuilder(CoreApp.Explore, otherLogsDs);

      expect(screen.getByTestId('compact-mode-bar')).toBeInTheDocument();
      await waitFor(() => expect(onRunQuery).toHaveBeenCalledTimes(1));
      const converted = onQueryChange.mock.calls[0][0];
      expect(converted).toMatchObject({ database: 'otel_v2', table: 'app_logs', queryType: QueryType.Logs });
      expect(converted.filters).toEqual([serviceFilter, severityFilter]);
      expect(converted.meta.logMessageLike).toBe('timeout');
      expect(converted.meta.datasourceUid).toBe('single-table-app-logs');
    });

    it('keeps a query that records no owner in Explore, such as a panel, a history entry or a link', async () => {
      const datasource = {
        ...otherLogsDs,
        getColumnsCached: jest.fn(() => Promise.resolve([])),
      } as unknown as Datasource;
      const { builderOptionsDispatch, onQueryChange, onRunQuery } = renderBuilder(
        CoreApp.Explore,
        datasource,
        unrecordedLogsQuery
      );

      expect(await screen.findByTestId('compact-mode-bar')).toBeInTheDocument();
      expect(datasource.getColumnsCached).not.toHaveBeenCalled();
      expect(builderOptionsDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'set_all_options' }));
      expect(onQueryChange).not.toHaveBeenCalled();
      expect(onRunQuery).not.toHaveBeenCalled();
    });

    it('keeps a query recorded as this data source in Explore, even when it reads another table', async () => {
      const { builderOptionsDispatch, onRunQuery } = renderBuilder(CoreApp.Explore, otherLogsDs, {
        ...carriedOverLogsQuery,
        meta: { ...carriedOverLogsQuery.meta, datasourceUid: 'single-table-app-logs' },
      });

      expect(await screen.findByTestId('compact-mode-bar')).toBeInTheDocument();
      expect(builderOptionsDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'set_all_options' }));
      expect(onRunQuery).not.toHaveBeenCalled();
    });

    it('keeps the recorded owner when it builds the defaults for a new query', async () => {
      const { onQueryChange } = renderBuilder(CoreApp.Explore, otherLogsDs, {
        queryType: QueryType.Table,
        mode: BuilderMode.List,
        database: '',
        table: '',
        columns: [],
        filters: [],
        meta: { datasourceUid: 'single-table-app-logs' },
      });

      await waitFor(() => expect(onQueryChange).toHaveBeenCalled());
      const defaults = onQueryChange.mock.calls[onQueryChange.mock.calls.length - 1][0];
      expect(defaults).toMatchObject({ table: 'app_logs', queryType: QueryType.Logs });
      expect(defaults.meta.datasourceUid).toBe('single-table-app-logs');
    });

    it('keeps it in the classic builder outside Explore, where it may be a saved query', async () => {
      const { builderOptionsDispatch, onQueryChange, onRunQuery } = renderBuilder(CoreApp.PanelEditor, tracesDs);

      expect(await screen.findByTestId('logs-component')).toHaveAttribute('data-table', 'otel_logs');
      expect(screen.queryByTestId('compact-filter-bar')).not.toBeInTheDocument();
      expect(builderOptionsDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'set_all_options' }));
      expect(onQueryChange).not.toHaveBeenCalled();
      expect(onRunQuery).not.toHaveBeenCalled();
    });

    it('leaves a query that already belongs to the data source alone in Explore', async () => {
      const { builderOptionsDispatch, onRunQuery } = renderBuilder(CoreApp.Explore, otherLogsDs, {
        ...carriedOverLogsQuery,
        table: 'app_logs',
      });

      expect(await screen.findByTestId('compact-mode-bar')).toBeInTheDocument();
      expect(builderOptionsDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'set_all_options' }));
      expect(onRunQuery).not.toHaveBeenCalled();
    });

    it('keeps an authored time series query in the classic builder in Explore', async () => {
      const { builderOptionsDispatch, onQueryChange, onRunQuery } = renderBuilder(CoreApp.Explore, otherLogsDs, {
        queryType: QueryType.TimeSeries,
        mode: BuilderMode.Trend,
        database: 'metrics_db',
        table: 'requests',
        columns: [{ name: 'created_at', hint: ColumnHint.Time }, { name: 'requests_count' }],
        filters: [serviceFilter],
      });

      expect(await screen.findByTestId('time-series-component')).toBeInTheDocument();
      expect(screen.queryByTestId('compact-mode-bar')).not.toBeInTheDocument();
      expect(builderOptionsDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'set_all_options' }));
      expect(onQueryChange).not.toHaveBeenCalled();
      expect(onRunQuery).not.toHaveBeenCalled();
    });
  });

  it('re-resolves compact logs defaults to the pre-v0.151.0 otel schema once table columns load', async () => {
    const compactDs = {
      ...mockDs,
      uid: 'compact-otel-latest',
      getSignalType: jest.fn(() => 'logs'),
      getConfigMode: jest.fn(() => 'single-table'),
      isSingleTableMode: jest.fn(() => true),
      getDefaultLogsDatabase: jest.fn(() => 'otel_v2'),
      getDefaultLogsTable: jest.fn(() => 'otel_logs'),
      // The static "latest" schema has no filter_time mapping, so the initial
      // defaults order and filter on Timestamp only.
      getDefaultLogsColumns: jest.fn(
        () =>
          new Map([
            ['time', 'Timestamp'],
            ['log_message', 'Body'],
          ])
      ),
      getLogsOtelVersion: jest.fn(() => 'latest'),
      shouldSelectLogContextColumns: jest.fn(() => false),
      getLogContextColumnNames: jest.fn(() => []),
      fetchTableKeys: jest.fn(() => Promise.resolve(undefined)),
      // The table itself is the older schema, identified by TimestampTime.
      fetchColumns: jest.fn(() =>
        Promise.resolve([
          { name: 'Timestamp', type: 'DateTime64(9)', picklistValues: [] },
          { name: 'TimestampTime', type: 'DateTime', picklistValues: [] },
          { name: 'Body', type: 'String', picklistValues: [] },
        ])
      ),
    } as unknown as Datasource;
    const onQueryChange = jest.fn();

    render(
      <QueryBuilder
        app={CoreApp.PanelEditor}
        builderOptions={{
          queryType: QueryType.Table,
          mode: BuilderMode.List,
          database: '',
          table: '',
          columns: [],
          filters: [],
        }}
        builderOptionsDispatch={jest.fn()}
        datasource={compactDs}
        generatedSql=""
        onQueryChange={onQueryChange}
      />
    );

    await waitFor(() =>
      expect(onQueryChange).toHaveBeenCalledWith(
        expect.objectContaining({
          columns: expect.arrayContaining([{ name: 'TimestampTime', hint: ColumnHint.FilterTime }]),
        })
      )
    );
  });

  describe('compact otel logs schema detection with the table keys', () => {
    const filterTimeColumn = { name: 'TimestampTime', hint: ColumnHint.FilterTime };

    const otelLogsDs = (fetchTableKeys: () => Promise<TableKeys | undefined>) =>
      ({
        ...mockDs,
        uid: 'compact-otel-keys',
        getSignalType: jest.fn(() => 'logs'),
        getConfigMode: jest.fn(() => 'single-table'),
        isSingleTableMode: jest.fn(() => true),
        getDefaultLogsDatabase: jest.fn(() => 'otel_v2'),
        getDefaultLogsTable: jest.fn(() => 'otel_logs'),
        getDefaultLogsColumns: jest.fn(
          () =>
            new Map([
              ['time', 'Timestamp'],
              ['log_message', 'Body'],
            ])
        ),
        getLogsOtelVersion: jest.fn(() => 'latest'),
        shouldSelectLogContextColumns: jest.fn(() => false),
        getLogContextColumnNames: jest.fn(() => []),
        fetchTableKeys: jest.fn(fetchTableKeys),
        fetchColumns: jest.fn(() =>
          Promise.resolve([
            { name: 'Timestamp', type: 'DateTime64(9)', picklistValues: [] },
            { name: 'TimestampTime', type: 'DateTime', picklistValues: [] },
            { name: 'Body', type: 'String', picklistValues: [] },
          ])
        ),
      }) as unknown as Datasource;

    const newQuery: QueryBuilderOptions = {
      queryType: QueryType.Table,
      mode: BuilderMode.List,
      database: '',
      table: '',
      columns: [],
      filters: [],
    };

    const renderQuery = (datasource: Datasource, builderOptions = newQuery): jest.Mock => {
      const onQueryChange = jest.fn();
      render(
        <QueryBuilder
          app={CoreApp.PanelEditor}
          builderOptions={builderOptions}
          builderOptionsDispatch={jest.fn()}
          datasource={datasource}
          generatedSql=""
          onQueryChange={onQueryChange}
        />
      );
      return onQueryChange;
    };

    it('uses Timestamp when the table keeps TimestampTime but its keys use only Timestamp (#2103)', async () => {
      const onQueryChange = renderQuery(
        otelLogsDs(() =>
          Promise.resolve({
            sortingKey: 'toStartOfFiveMinutes(Timestamp), ServiceName, Timestamp',
            partitionKey: 'toDate(Timestamp)',
          })
        )
      );

      await waitFor(() => expect(onQueryChange).toHaveBeenCalledTimes(2));
      expect(onQueryChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ columns: expect.not.arrayContaining([filterTimeColumn]) })
      );
    });

    it('waits for the table keys that arrive after the columns', async () => {
      let resolveTableKeys: (keys: TableKeys) => void = () => {};
      const datasource = otelLogsDs(() => new Promise((resolve) => (resolveTableKeys = resolve)));
      const onQueryChange = renderQuery(datasource);

      await waitFor(() => expect(datasource.fetchColumns).toHaveBeenCalled());
      await act(async () => {});
      expect(onQueryChange).toHaveBeenCalledTimes(1);

      await act(async () =>
        resolveTableKeys({ sortingKey: 'ServiceName, TimestampTime, Timestamp', partitionKey: 'toDate(TimestampTime)' })
      );
      await waitFor(() => expect(onQueryChange).toHaveBeenCalledTimes(2));
      expect(onQueryChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ columns: expect.arrayContaining([filterTimeColumn]) })
      );
    });

    it('does not look up the table keys for a saved query', async () => {
      const datasource = otelLogsDs(() => Promise.resolve(undefined));
      const onQueryChange = renderQuery(datasource, {
        queryType: QueryType.Logs,
        mode: BuilderMode.List,
        database: 'otel_v2',
        table: 'otel_logs',
        columns: [{ name: 'Timestamp', hint: ColumnHint.Time }, filterTimeColumn],
        filters: [],
        meta: { otelEnabled: true, otelVersion: 'latest' },
      });

      await waitFor(() => expect(datasource.fetchColumns).toHaveBeenCalled());
      await act(async () => {});
      expect(datasource.fetchTableKeys).not.toHaveBeenCalled();
      expect(onQueryChange).not.toHaveBeenCalled();
    });
  });

  it('renders traces compact mode without database/table or query type selectors', async () => {
    const compactDs = {
      ...mockDs,
      getSignalType: jest.fn(() => 'traces'),
      getConfigMode: jest.fn(() => 'single-table'),
      isSingleTableMode: jest.fn(() => true),
      getDefaultTraceDatabase: jest.fn(() => 'otel_v2'),
      getDefaultTraceTable: jest.fn(() => 'otel_traces'),
      getDefaultTraceColumns: jest.fn(
        () =>
          new Map([
            ['time', 'Timestamp'],
            ['trace_id', 'TraceId'],
            ['trace_span_id', 'SpanId'],
          ])
      ),
      getTraceOtelVersion: jest.fn(() => '1.29.0'),
      getDefaultTraceDurationUnit: jest.fn(() => TimeUnit.Nanoseconds),
      getDefaultTraceFlattenNested: jest.fn(() => false),
      getDefaultTraceEventsColumnPrefix: jest.fn(() => 'Events'),
      getDefaultTraceLinksColumnPrefix: jest.fn(() => 'Links'),
      getTraceTimestampTableSuffix: jest.fn(() => '_trace_id_ts'),
    } as unknown as Datasource;
    const builderOptionsDispatch = jest.fn();

    render(
      <QueryBuilder
        app={CoreApp.PanelEditor}
        builderOptions={{
          queryType: QueryType.Logs,
          mode: BuilderMode.List,
          database: 'logs_db',
          table: 'logs_table',
          columns: [],
          filters: [],
        }}
        builderOptionsDispatch={builderOptionsDispatch}
        datasource={compactDs}
        generatedSql=""
      />
    );

    expect(screen.queryByTestId('compact-mode-bar')).not.toBeInTheDocument();
    expect(screen.getByTestId('compact-filter-bar')).toBeInTheDocument();
    expect(screen.queryByText('Database')).not.toBeInTheDocument();
    expect(screen.queryByText('Query Type')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'set_all_options' }))
    );
  });

  describe('compact logs message column detection', () => {
    const buildCompactLogsDs = (defaultColumns: Map<ColumnHint, string>): Datasource =>
      ({
        ...mockDs,
        getSignalType: jest.fn(() => 'logs'),
        getConfigMode: jest.fn(() => 'single-table'),
        isSingleTableMode: jest.fn(() => true),
        getDefaultLogsDatabase: jest.fn(() => 'default'),
        getDefaultLogsTable: jest.fn(() => 'app_logs'),
        getDefaultLogsColumns: jest.fn(() => defaultColumns),
        getLogsOtelVersion: jest.fn(() => ''),
        shouldSelectLogContextColumns: jest.fn(() => false),
        getLogContextColumnNames: jest.fn(() => []),
        fetchColumns: jest.fn(() =>
          Promise.resolve([
            { name: 'timestamp', type: 'DateTime', picklistValues: [] },
            { name: 'message', type: 'String', picklistValues: [] },
            { name: 'level', type: 'LowCardinality(String)', picklistValues: [] },
          ])
        ),
      }) as unknown as Datasource;

    const initialBuilderOptions = {
      queryType: QueryType.Table,
      mode: BuilderMode.List,
      database: '',
      table: '',
      columns: [],
      filters: [],
    };

    it('detects LogMessage and LogLevel columns by name when config has no columns', async () => {
      const datasource = buildCompactLogsDs(new Map());
      const builderOptionsDispatch = jest.fn();

      render(
        <QueryBuilder
          app={CoreApp.PanelEditor}
          builderOptions={initialBuilderOptions}
          builderOptionsDispatch={builderOptionsDispatch}
          datasource={datasource}
          generatedSql=""
        />
      );

      await waitFor(() =>
        expect(builderOptionsDispatch).toHaveBeenCalledWith(
          setColumnByHint({ name: 'message', type: 'String', hint: ColumnHint.LogMessage })
        )
      );
      expect(builderOptionsDispatch).toHaveBeenCalledWith(
        setColumnByHint({ name: 'level', type: 'LowCardinality(String)', hint: ColumnHint.LogLevel })
      );
    });

    it('never overrides an explicitly configured message column', async () => {
      const datasource = buildCompactLogsDs(new Map([[ColumnHint.LogMessage, 'my_msg_col']]));
      const builderOptionsDispatch = jest.fn();

      render(
        <QueryBuilder
          app={CoreApp.PanelEditor}
          builderOptions={initialBuilderOptions}
          builderOptionsDispatch={builderOptionsDispatch}
          datasource={datasource}
          generatedSql=""
        />
      );

      // The level slot is not configured, so detection has run once this dispatch appears
      await waitFor(() =>
        expect(builderOptionsDispatch).toHaveBeenCalledWith(
          setColumnByHint({ name: 'level', type: 'LowCardinality(String)', hint: ColumnHint.LogLevel })
        )
      );

      const logMessageDispatches = builderOptionsDispatch.mock.calls.filter(
        ([action]) => action.type === 'set_column_by_hint' && action.payload?.column?.hint === ColumnHint.LogMessage
      );
      expect(logMessageDispatches).toHaveLength(0);
    });
  });
});
