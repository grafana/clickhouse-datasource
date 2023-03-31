import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { QueryBuilder } from './QueryBuilder'
import { Datasource } from '../../data/CHDatasource'
import { BuilderMode, Format } from 'types'

describe('QueryBuilder', () => {
  it('renders correctly', async () => {
    const setState = jest.fn();
    const mockDs = { settings: { jsonData: {} } } as Datasource;
    mockDs.fetchDatabases = jest.fn(() => Promise.resolve([]));
    mockDs.fetchTables = jest.fn((_db?: string) => Promise.resolve([]));
    mockDs.fetchFieldsFull = jest.fn(() => {
      setState();
      return Promise.resolve([]);
    });
    const useStateMock: any = (initState: any) => [initState, setState];
    jest.spyOn(React, 'useState').mockImplementation(useStateMock);
    const result = await waitFor(() =>
      render(
        <QueryBuilder
          builderOptions={{
            mode: BuilderMode.List,
            database: 'db',
            table: 'foo',
            fields: [],
          }}
          onBuilderOptionsChange={() => {}}
          datasource={mockDs}
          format={Format.AUTO}
        />
      )
    );
    expect(result.container.firstChild).not.toBeNull();
  });
});
