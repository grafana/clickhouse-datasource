import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { SchemaPicker, SchemaPickerValue } from './SchemaPicker';
import { Datasource } from '../../data/CHDatasource';
import { TableColumn } from 'types/queryBuilder';

// Order matters: 'attrs' first so cascade-cascade tests can navigate down to 'service'.
// react-select does not wrap with ArrowDown, so navigating away from the last option
// keeps focus on it.
const mapColumns: readonly TableColumn[] = [
  { name: 'attrs', type: 'Map(String, String)', picklistValues: [] },
  { name: 'service', type: 'String', picklistValues: [] },
];

const buildDatasource = (overrides: Partial<Datasource> = {}): Datasource => {
  const ds = {} as Datasource;
  ds.getDefaultDatabase = jest.fn(() => '');
  ds.fetchDatabases = jest.fn(() => Promise.resolve(['default', 'analytics']));
  ds.fetchTables = jest.fn(() => Promise.resolve(['events', 'logs']));
  ds.fetchColumns = jest.fn(() => Promise.resolve([...mapColumns]));
  ds.fetchUniqueMapKeys = jest.fn(() => Promise.resolve(['service.name', 'http.status']));
  return Object.assign(ds, overrides);
};

describe('SchemaPicker', () => {
  describe("level='database'", () => {
    it('renders only the database selector', async () => {
      const datasource = buildDatasource();
      const result = await waitFor(() =>
        render(<SchemaPicker datasource={datasource} level="database" value={{}} onChange={() => {}} />)
      );
      expect(result.getAllByRole('combobox')).toHaveLength(1);
      expect(result.getByText('Database')).toBeInTheDocument();
      expect(result.queryByText('Table')).not.toBeInTheDocument();
      expect(result.queryByText('Column')).not.toBeInTheDocument();
    });

    it('emits the selected database', async () => {
      const datasource = buildDatasource();
      const onChange = jest.fn();
      const result = await waitFor(() =>
        render(<SchemaPicker datasource={datasource} level="database" value={{}} onChange={onChange} />)
      );

      const combobox = result.getByRole('combobox');
      fireEvent.keyDown(combobox, { key: 'ArrowDown' });
      fireEvent.keyDown(combobox, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({
        database: 'default',
        table: '',
        column: '',
        mapKey: '',
      });
    });
  });

  describe("level='table'", () => {
    it('renders database and table selectors', async () => {
      const datasource = buildDatasource();
      const result = await waitFor(() =>
        render(
          <SchemaPicker datasource={datasource} level="table" value={{ database: 'default' }} onChange={() => {}} />
        )
      );
      expect(result.getAllByRole('combobox')).toHaveLength(2);
      expect(result.getByText('Database')).toBeInTheDocument();
      expect(result.getByText('Table')).toBeInTheDocument();
    });

    it('disables the table selector until a database is selected', async () => {
      const datasource = buildDatasource();
      const result = await waitFor(() =>
        render(<SchemaPicker datasource={datasource} level="table" value={{}} onChange={() => {}} />)
      );
      // The Table label still renders, but the underlying combobox is non-interactive
      // and Grafana's Select hides the combobox role when disabled.
      expect(result.getByText('Table')).toBeInTheDocument();
      expect(result.getAllByRole('combobox')).toHaveLength(1);
    });

    it('clears the table when the database changes', async () => {
      const datasource = buildDatasource();
      const onChange = jest.fn();
      const value: SchemaPickerValue = { database: 'default', table: 'events' };
      const result = await waitFor(() =>
        render(<SchemaPicker datasource={datasource} level="table" value={value} onChange={onChange} />)
      );

      const [databaseCombobox] = result.getAllByRole('combobox');
      fireEvent.keyDown(databaseCombobox, { key: 'ArrowDown' });
      fireEvent.keyDown(databaseCombobox, { key: 'ArrowDown' });
      fireEvent.keyDown(databaseCombobox, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({
        database: 'analytics',
        table: '',
        column: '',
        mapKey: '',
      });
    });

    it('emits a table selection without disturbing the database', async () => {
      const datasource = buildDatasource();
      const onChange = jest.fn();
      const value: SchemaPickerValue = { database: 'default' };
      const result = await waitFor(() =>
        render(<SchemaPicker datasource={datasource} level="table" value={value} onChange={onChange} />)
      );

      const [, tableCombobox] = result.getAllByRole('combobox');
      fireEvent.keyDown(tableCombobox, { key: 'ArrowDown' });
      fireEvent.keyDown(tableCombobox, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({
        database: 'default',
        table: 'events',
        column: '',
        mapKey: '',
      });
    });
  });

  describe("level='column' (default)", () => {
    it('renders database, table, and column selectors', async () => {
      const datasource = buildDatasource();
      const result = await waitFor(() =>
        render(
          <SchemaPicker datasource={datasource} value={{ database: 'default', table: 'events' }} onChange={() => {}} />
        )
      );
      expect(result.getAllByRole('combobox')).toHaveLength(3);
      expect(result.getByText('Database')).toBeInTheDocument();
      expect(result.getByText('Table')).toBeInTheDocument();
      expect(result.getByText('Column')).toBeInTheDocument();
    });

    it('clears the column when the table changes', async () => {
      const datasource = buildDatasource();
      const onChange = jest.fn();
      const value: SchemaPickerValue = { database: 'default', table: 'events', column: 'service' };
      const result = await waitFor(() =>
        render(<SchemaPicker datasource={datasource} value={value} onChange={onChange} />)
      );

      const [, tableCombobox] = result.getAllByRole('combobox');
      fireEvent.keyDown(tableCombobox, { key: 'ArrowDown' });
      fireEvent.keyDown(tableCombobox, { key: 'ArrowDown' });
      fireEvent.keyDown(tableCombobox, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({
        database: 'default',
        table: 'logs',
        column: '',
        mapKey: '',
      });
    });
  });

  describe("level='mapKey'", () => {
    it('shows the Map Key selector when the selected column is a Map type', async () => {
      const datasource = buildDatasource();
      const value: SchemaPickerValue = { database: 'default', table: 'events', column: 'attrs' };
      const result = await waitFor(() =>
        render(<SchemaPicker datasource={datasource} level="mapKey" value={value} onChange={() => {}} />)
      );
      await waitFor(() => expect(result.getAllByRole('combobox')).toHaveLength(4));
      expect(result.getByText('Map Key')).toBeInTheDocument();
    });

    it('hides the Map Key selector when the selected column is not a Map type', async () => {
      const datasource = buildDatasource();
      const value: SchemaPickerValue = { database: 'default', table: 'events', column: 'service' };
      const result = await waitFor(() =>
        render(<SchemaPicker datasource={datasource} level="mapKey" value={value} onChange={() => {}} />)
      );
      await waitFor(() => expect(datasource.fetchColumns).toHaveBeenCalled());
      expect(result.queryByText('Map Key')).not.toBeInTheDocument();
      expect(result.getAllByRole('combobox')).toHaveLength(3);
    });

    it('emits the chosen map key alongside the existing selection', async () => {
      const datasource = buildDatasource();
      const onChange = jest.fn();
      const value: SchemaPickerValue = { database: 'default', table: 'events', column: 'attrs' };
      const result = await waitFor(() =>
        render(<SchemaPicker datasource={datasource} level="mapKey" value={value} onChange={onChange} />)
      );

      await waitFor(() => expect(result.getAllByRole('combobox')).toHaveLength(4));
      const comboboxes = result.getAllByRole('combobox');
      const mapKeyCombobox = comboboxes[3];
      fireEvent.keyDown(mapKeyCombobox, { key: 'ArrowDown' });
      fireEvent.keyDown(mapKeyCombobox, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({
        database: 'default',
        table: 'events',
        column: 'attrs',
        mapKey: 'service.name',
      });
    });

    it('clears the map key when the column changes', async () => {
      const datasource = buildDatasource();
      const onChange = jest.fn();
      const value: SchemaPickerValue = {
        database: 'default',
        table: 'events',
        column: 'attrs',
        mapKey: 'service.name',
      };
      const result = await waitFor(() =>
        render(<SchemaPicker datasource={datasource} level="mapKey" value={value} onChange={onChange} />)
      );

      await waitFor(() => expect(result.getAllByRole('combobox')).toHaveLength(4));
      const [, , columnCombobox] = result.getAllByRole('combobox');
      // Open the menu and move past the current selection to a different option
      // (mock columns: ['service', 'attrs']; current is 'attrs', so navigate to 'service').
      fireEvent.keyDown(columnCombobox, { key: 'ArrowDown' });
      fireEvent.keyDown(columnCombobox, { key: 'ArrowDown' });
      fireEvent.keyDown(columnCombobox, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          database: 'default',
          table: 'events',
          mapKey: '',
        })
      );
      const [emitted] = onChange.mock.calls[0];
      expect(emitted.column).not.toBe('attrs');
    });
  });

  describe('cross-level cascade invalidation', () => {
    it('clears table, column, and mapKey when the database changes at mapKey depth', async () => {
      const datasource = buildDatasource();
      const onChange = jest.fn();
      const value: SchemaPickerValue = {
        database: 'default',
        table: 'events',
        column: 'attrs',
        mapKey: 'service.name',
      };
      const result = await waitFor(() =>
        render(<SchemaPicker datasource={datasource} level="mapKey" value={value} onChange={onChange} />)
      );

      const [databaseCombobox] = result.getAllByRole('combobox');
      fireEvent.keyDown(databaseCombobox, { key: 'ArrowDown' });
      fireEvent.keyDown(databaseCombobox, { key: 'ArrowDown' });
      fireEvent.keyDown(databaseCombobox, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({
        database: 'analytics',
        table: '',
        column: '',
        mapKey: '',
      });
    });
  });

  describe('custom labels', () => {
    it('overrides the visible labels via the labels prop', async () => {
      const datasource = buildDatasource();
      const result = await waitFor(() =>
        render(
          <SchemaPicker
            datasource={datasource}
            level="column"
            value={{ database: 'default', table: 'events' }}
            onChange={() => {}}
            labels={{ database: 'Schema', table: 'Source', column: 'Field' }}
          />
        )
      );
      expect(result.getByText('Schema')).toBeInTheDocument();
      expect(result.getByText('Source')).toBeInTheDocument();
      expect(result.getByText('Field')).toBeInTheDocument();
      expect(result.queryByText('Database')).not.toBeInTheDocument();
    });

    it('falls back to defaults for any unspecified label', async () => {
      const datasource = buildDatasource();
      const result = await waitFor(() =>
        render(
          <SchemaPicker
            datasource={datasource}
            level="column"
            value={{ database: 'default', table: 'events' }}
            onChange={() => {}}
            labels={{ database: 'Schema' }}
          />
        )
      );
      expect(result.getByText('Schema')).toBeInTheDocument();
      expect(result.getByText('Table')).toBeInTheDocument();
      expect(result.getByText('Column')).toBeInTheDocument();
    });
  });
});
