import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getCompactFilterColumns, QueryBuilder } from './QueryBuilder';
import { Datasource } from 'data/CHDatasource';
import { BuilderMode, ColumnHint, QueryType, TimeUnit } from 'types/queryBuilder';
import { CoreApp } from '@grafana/data';

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
      />
    );

    expect(screen.getByTestId('compact-mode-bar')).toBeInTheDocument();
    expect(screen.getByTestId('compact-filter-bar')).toBeInTheDocument();
    expect(screen.queryByText('Database')).not.toBeInTheDocument();
    expect(screen.queryByText('Query Type')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search log body text...'), { target: { value: 'error' } });
    fireEvent.blur(screen.getByPlaceholderText('Search log body text...'));
    expect(screen.getByRole('button', { name: 'Add filter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show advanced options' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open query history' })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Edit as SQL' }));
    expect(onEditAsSql).toHaveBeenCalledWith(
      expect.objectContaining({
        database: 'otel_v2',
        table: 'otel_logs',
        queryType: QueryType.Logs,
      })
    );
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
});
