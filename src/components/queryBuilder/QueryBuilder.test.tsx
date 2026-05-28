import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryBuilder } from './QueryBuilder';
import { Datasource } from 'data/CHDatasource';
import { BuilderMode, QueryType, TimeUnit } from 'types/queryBuilder';
import { CoreApp } from '@grafana/data';

jest.mock('./views/TableQueryBuilder', () => ({
  TableQueryBuilder: () => <div data-testid="table-component" />,
}));
jest.mock('./views/LogsQueryBuilder', () => ({
  LogsQueryBuilder: () => <div data-testid="logs-component" />,
}));
jest.mock('./views/TimeSeriesQueryBuilder', () => ({
  TimeSeriesQueryBuilder: () => <div data-testid="time-series-component" />,
}));
jest.mock('./views/TraceQueryBuilder', () => ({
  TraceQueryBuilder: () => <div data-testid="trace-component" />,
}));

describe('QueryBuilder', () => {
  const setState = jest.fn();
  const mockDs = { settings: { jsonData: {} } } as Datasource;

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
  mockDs.fetchColumns = jest.fn(() => {
    setState();
    return Promise.resolve([]);
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
});
