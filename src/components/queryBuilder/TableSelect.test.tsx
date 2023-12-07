import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { TableSelect } from './TableSelect';
import { Datasource } from '../../data/CHDatasource';

describe('TableSelect', () => {
  it('renders correctly', async () => {
    const setState = jest.fn();
    const mockDs = {} as Datasource;
    mockDs.fetchDatabases = jest.fn(() => Promise.resolve([]));
    mockDs.fetchTables = jest.fn((_db?: string) => Promise.resolve([]));
    const useStateMock: any = (initState: any) => [initState, setState];
    jest.spyOn(React, 'useState').mockImplementation(useStateMock);
    const result = await waitFor(() => render(<TableSelect table="" onTableChange={() => {}} datasource={mockDs} />));
    expect(result.container.firstChild).not.toBeNull();
  });
});
