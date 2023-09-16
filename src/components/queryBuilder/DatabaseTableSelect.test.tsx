import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { DatabaseSelect, TableSelect, DatabaseTableSelect } from './DatabaseTableSelect';
import { Datasource } from '../../data/CHDatasource';

const defaultDB = 'default';
const testTable = 'samples';

describe('DatabaseSelect', () => {
  it('should render with empty options', async () => {
    const mockDs = {} as Datasource;
    mockDs.getDefaultDatabase = jest.fn(() => ''); 
    mockDs.fetchDatabases = jest.fn(() => Promise.resolve([]));

    const result = await waitFor(() => render(<DatabaseSelect datasource={mockDs} database="" onDatabaseChange={() => {}} />));
    expect(result.container.firstChild).not.toBeNull();
  });

  it('should render with valid options', async () => {
    const mockDs = {} as Datasource;
    mockDs.getDefaultDatabase = jest.fn(() => defaultDB); 
    mockDs.fetchDatabases = jest.fn(() => Promise.resolve([defaultDB]));

    const result = await waitFor(() => render(<DatabaseSelect datasource={mockDs} database="default" onDatabaseChange={() => {}} />));
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByText(defaultDB)).toBeInTheDocument();
  });

  it('selects a default database when none is provided', async () => {
    const mockDs = {} as Datasource;
    mockDs.getDefaultDatabase = jest.fn(() => defaultDB); 
    mockDs.fetchDatabases = jest.fn(() => Promise.resolve([defaultDB]));
    const onDatabaseChange = jest.fn();

    const result = await waitFor(() => render(<DatabaseSelect datasource={mockDs} database="" onDatabaseChange={onDatabaseChange} />));
    expect(result.container.firstChild).not.toBeNull();

    expect(onDatabaseChange).toBeCalledTimes(1);
    expect(onDatabaseChange).toBeCalledWith(defaultDB);
  });

  it('should call onDatabaseChange when a database is selected', async () => {
    const mockDs = {} as Datasource;
    mockDs.getDefaultDatabase = jest.fn(() => defaultDB); 
    mockDs.fetchDatabases = jest.fn(() => Promise.resolve([defaultDB]));
    const onDatabaseChange = jest.fn();

    const result = await waitFor(() => render(<DatabaseSelect datasource={mockDs} database="other" onDatabaseChange={onDatabaseChange} />));
    expect(result.container.firstChild).not.toBeNull();

    const multiSelect = result.getByRole('combobox');
    expect(multiSelect).toBeInTheDocument();
    fireEvent.keyDown(multiSelect, { key: 'ArrowDown' }); // "other" db, a custom value
    fireEvent.keyDown(multiSelect, { key: 'ArrowDown' }); // "default" db
    fireEvent.keyDown(multiSelect, { key: 'Enter' });
    expect(onDatabaseChange).toBeCalledTimes(1);
    expect(onDatabaseChange).toBeCalledWith(defaultDB);
  });
});

describe('TableSelect', () => {
  it('should render with empty options', async () => {
    const mockDs = {} as Datasource;
    mockDs.fetchTables = jest.fn(() => Promise.resolve([]));

    const result = await waitFor(() => render(<TableSelect datasource={mockDs} database="" table="" onTableChange={() => {}} />));
    expect(result.container.firstChild).not.toBeNull();
  });

  it('should render with valid options', async () => {
    const mockDs = {} as Datasource;
    mockDs.fetchTables = jest.fn(() => Promise.resolve([testTable]));

    const result = await waitFor(() => render(<TableSelect datasource={mockDs} database={defaultDB} table={testTable} onTableChange={() => {}} />));
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByText(testTable)).toBeInTheDocument();
  });

  // TODO: this hook is disabled in the component for now
  // it('selects a default table when none is provided', async () => {
  //   const mockDs = {} as Datasource;
  //   mockDs.fetchTables = jest.fn(() => Promise.resolve([testTable]));
  //   const onTableChange = jest.fn();

  //   const result = await waitFor(() => render(<TableSelect datasource={mockDs} database={defaultDB} table="" onTableChange={onTableChange} />));
  //   expect(result.container.firstChild).not.toBeNull();

  //   expect(onTableChange).toBeCalledTimes(1);
  //   expect(onTableChange).toBeCalledWith(testTable);
  // });

  it('should call onTableChange when a table is selected', async () => {
    const mockDs = {} as Datasource;
    mockDs.fetchTables = jest.fn(() => Promise.resolve([testTable]));
    const onTableChange = jest.fn();

    const result = await waitFor(() => render(<TableSelect datasource={mockDs} database={defaultDB} table="other" onTableChange={onTableChange} />));
    expect(result.container.firstChild).not.toBeNull();

    const multiSelect = result.getByRole('combobox');
    expect(multiSelect).toBeInTheDocument();
    fireEvent.keyDown(multiSelect, { key: 'ArrowDown' }); // "other" table, a custom value
    fireEvent.keyDown(multiSelect, { key: 'ArrowDown' }); // test table
    fireEvent.keyDown(multiSelect, { key: 'Enter' });
    expect(onTableChange).toBeCalledTimes(1);
    expect(onTableChange).toBeCalledWith(testTable);
  });
});

describe('DatabaseTableSelect', () => {
  it('should render the combined components', async () => {
    const mockDs = {} as Datasource;
    mockDs.fetchDatabases = jest.fn(() => Promise.resolve([]));
    mockDs.fetchTables = jest.fn(() => Promise.resolve([]));

    const result = await waitFor(() => render(
      <DatabaseTableSelect
        datasource={mockDs}
        database={defaultDB}
        onDatabaseChange={() => {}}
        table={testTable}
        onTableChange={() => {}}
      />
    ));
    expect(result.container.firstChild).not.toBeNull();
    expect(result.container.firstChild?.childNodes).toHaveLength(2 * 2); // 2 components with a fragment of 2 components
  });
});
