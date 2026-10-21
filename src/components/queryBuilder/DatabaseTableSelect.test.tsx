import React, { useState } from 'react';
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

    const result = await waitFor(() =>
      render(<DatabaseSelect datasource={mockDs} database="" onDatabaseChange={() => {}} />)
    );
    expect(result.container.firstChild).not.toBeNull();
  });

  it('should render with valid options', async () => {
    const mockDs = {} as Datasource;
    mockDs.getDefaultDatabase = jest.fn(() => defaultDB);
    mockDs.fetchDatabases = jest.fn(() => Promise.resolve([defaultDB]));

    const result = await waitFor(() =>
      render(<DatabaseSelect datasource={mockDs} database="default" onDatabaseChange={() => {}} />)
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.getByText(defaultDB)).toBeInTheDocument();
  });

  it('selects a default database when none is provided', async () => {
    const mockDs = {} as Datasource;
    mockDs.getDefaultDatabase = jest.fn(() => defaultDB);
    mockDs.fetchDatabases = jest.fn(() => Promise.resolve([defaultDB]));
    const onDatabaseChange = jest.fn();

    const result = await waitFor(() =>
      render(<DatabaseSelect datasource={mockDs} database="" onDatabaseChange={onDatabaseChange} />)
    );
    expect(result.container.firstChild).not.toBeNull();

    expect(onDatabaseChange).toBeCalledTimes(1);
    expect(onDatabaseChange).toBeCalledWith(defaultDB);
  });

  it('should call onDatabaseChange when a database is selected', async () => {
    const mockDs = {} as Datasource;
    mockDs.getDefaultDatabase = jest.fn(() => defaultDB);
    mockDs.fetchDatabases = jest.fn(() => Promise.resolve([defaultDB]));
    const onDatabaseChange = jest.fn();

    const result = await waitFor(() =>
      render(<DatabaseSelect datasource={mockDs} database="other" onDatabaseChange={onDatabaseChange} />)
    );
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

    const result = await waitFor(() =>
      render(<TableSelect datasource={mockDs} database="" table="" onTableChange={() => {}} />)
    );
    expect(result.container.firstChild).not.toBeNull();
  });

  it('should render with valid options', async () => {
    const mockDs = {} as Datasource;
    mockDs.fetchTables = jest.fn(() => Promise.resolve([testTable]));

    const result = await waitFor(() =>
      render(<TableSelect datasource={mockDs} database={defaultDB} table={testTable} onTableChange={() => {}} />)
    );
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

    const result = await waitFor(() =>
      render(<TableSelect datasource={mockDs} database={defaultDB} table="other" onTableChange={onTableChange} />)
    );
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

describe('TableSelect after a database change', () => {
  const setup = (tablesByDb: Record<string, string[]>, changedInDropdown: boolean) => {
    const mockDs = {} as Datasource;
    mockDs.fetchTables = jest.fn((db?: string) => Promise.resolve(tablesByDb[db!] ?? []));
    mockDs.getDefaultTable = jest.fn(() => '');
    const onTableChange = jest.fn();
    const databaseChanged = { current: false };
    const select = (database: string) => (
      <TableSelect
        datasource={mockDs}
        database={database}
        table="logs"
        onTableChange={onTableChange}
        databaseChanged={databaseChanged}
      />
    );
    const result = render(select('db_a'));
    const changeDatabase = (database: string) => {
      databaseChanged.current = changedInDropdown;
      result.rerender(select(database));
    };
    return { mockDs, onTableChange, changeDatabase };
  };

  it('keeps the table when the new database has it', async () => {
    const { mockDs, onTableChange, changeDatabase } = setup({ db_a: ['logs'], db_b: ['logs', 'other'] }, true);
    changeDatabase('db_b');

    await waitFor(() => expect(mockDs.fetchTables).toHaveBeenCalledWith('db_b'));
    await new Promise((r) => setTimeout(r, 0));
    expect(onTableChange).not.toHaveBeenCalled();
  });

  it('picks another table when the new database lacks it', async () => {
    const { onTableChange, changeDatabase } = setup({ db_a: ['logs'], db_b: ['spans'] }, true);
    changeDatabase('db_b');

    await waitFor(() => expect(onTableChange).toHaveBeenCalledWith('spans'));
  });

  it('skips a default table the new database lacks', async () => {
    const { mockDs, onTableChange, changeDatabase } = setup({ db_a: ['logs'], db_b: ['spans'] }, true);
    (mockDs.getDefaultTable as jest.Mock).mockReturnValue('events');
    changeDatabase('db_b');

    await waitFor(() => expect(onTableChange).toHaveBeenCalledWith('spans'));
    expect(onTableChange).not.toHaveBeenCalledWith('events');
  });

  it('keeps the table of a query restored with another database', async () => {
    const { mockDs, onTableChange, changeDatabase } = setup({ db_a: ['logs'], db_b: ['spans'] }, false);
    changeDatabase('db_b');

    await waitFor(() => expect(mockDs.fetchTables).toHaveBeenCalledWith('db_b'));
    await new Promise((r) => setTimeout(r, 0));
    expect(onTableChange).not.toHaveBeenCalled();
  });
});

describe('DatabaseTableSelect', () => {
  it('should render the combined components', async () => {
    const mockDs = {} as Datasource;
    mockDs.fetchDatabases = jest.fn(() => Promise.resolve([]));
    mockDs.fetchTables = jest.fn(() => Promise.resolve([]));

    const result = await waitFor(() =>
      render(
        <DatabaseTableSelect
          datasource={mockDs}
          database={defaultDB}
          onDatabaseChange={() => {}}
          table={testTable}
          onTableChange={() => {}}
        />
      )
    );
    expect(result.container.firstChild).not.toBeNull();
    expect(result.container.firstChild?.childNodes).toHaveLength(2); // 2 InlineFields (database + table)
  });
});

describe('DatabaseTableSelect database changes', () => {
  // Holds the query's database and table the way the builder does, so the dropdown drives TableSelect.
  const Harness = ({ datasource, onTableChange }: { datasource: Datasource; onTableChange: (t: string) => void }) => {
    const [database, setDatabase] = useState('db_a');
    const [table, setTable] = useState('logs');
    return (
      <DatabaseTableSelect
        datasource={datasource}
        database={database}
        onDatabaseChange={setDatabase}
        table={table}
        onTableChange={(t) => {
          onTableChange(t);
          setTable(t);
        }}
      />
    );
  };

  const setup = () => {
    const mockDs = {} as Datasource;
    mockDs.getDefaultDatabase = jest.fn(() => 'db_a');
    mockDs.getDefaultTable = jest.fn(() => '');
    mockDs.fetchDatabases = jest.fn(() => Promise.resolve(['db_a', 'db_b']));
    mockDs.fetchTables = jest.fn((db?: string) => Promise.resolve(db === 'db_b' ? ['spans'] : ['logs']));
    const onTableChange = jest.fn();
    const result = render(<Harness datasource={mockDs} onTableChange={onTableChange} />);
    const [databaseSelect, tableSelect] = result.getAllByRole('combobox');
    return { mockDs, onTableChange, result, databaseSelect, tableSelect };
  };

  it('replaces the table when a database picked in the dropdown lacks it', async () => {
    const { mockDs, onTableChange, result, databaseSelect } = setup();
    await waitFor(() => expect(result.getByText('db_a')).toBeInTheDocument());

    fireEvent.keyDown(databaseSelect, { key: 'ArrowDown' }); // opens on db_a, the current one
    fireEvent.keyDown(databaseSelect, { key: 'ArrowDown' }); // db_b
    fireEvent.keyDown(databaseSelect, { key: 'Enter' });

    await waitFor(() => expect(mockDs.fetchTables).toHaveBeenCalledWith('db_b'));
    await waitFor(() => expect(onTableChange).toHaveBeenCalledWith('spans'));
  });

  it('keeps a typed table after re-selecting the current database', async () => {
    const { mockDs, onTableChange, result, databaseSelect, tableSelect } = setup();
    await waitFor(() => expect(result.getByText('db_a')).toBeInTheDocument());
    await waitFor(() => expect(mockDs.fetchTables).toHaveBeenCalledWith('db_a'));

    fireEvent.keyDown(databaseSelect, { key: 'ArrowDown' }); // opens on db_a, the current one
    fireEvent.keyDown(databaseSelect, { key: 'Enter' });

    // A table name typed by hand, not in the list.
    fireEvent.change(tableSelect, { target: { value: 'typed_table' } });
    await waitFor(() => expect(result.getByText(/typed_table/)).toBeInTheDocument());
    fireEvent.keyDown(tableSelect, { key: 'Enter' });

    await waitFor(() => expect(onTableChange).toHaveBeenCalledWith('typed_table'));
    await new Promise((r) => setTimeout(r, 0));
    expect(onTableChange).toHaveBeenLastCalledWith('typed_table');
  });
});
