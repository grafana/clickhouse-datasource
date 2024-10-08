import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryBuilder } from './QueryBuilder';
import { Datasource } from 'data/CHDatasource';
import { BuilderMode, QueryType } from 'types/queryBuilder';
import { CoreApp } from '@grafana/data';

describe('QueryBuilder', () => {
  it('renders correctly', async () => {
    const setState = jest.fn();
    const mockDs = { settings: { jsonData: {} } } as Datasource;

    mockDs.fetchDatabases = jest.fn(() => Promise.resolve([]));
    mockDs.fetchTables = jest.fn((_db?: string) => Promise.resolve([]));
    mockDs.fetchColumns = jest.fn(() => {
      setState();
      return Promise.resolve([]);
    });
    
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
          generatedSql=''
        />
      )
    );
    expect(result.container.firstChild).not.toBeNull();
  });
});
