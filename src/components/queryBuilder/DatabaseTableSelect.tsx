import React, { MutableRefObject, useEffect, useRef } from 'react';
import { InlineField, InlineFieldRow, InlineFormLabel, Select } from '@grafana/ui';
import { Datasource } from '../../data/CHDatasource';
import labels from 'labels';
import { styles } from '../../styles';
import useTables from 'hooks/useTables';
import useDatabases from 'hooks/useDatabases';

export type DatabaseSelectProps = {
  datasource: Datasource;
  database: string;
  onDatabaseChange: (value: string) => void;
};

export const DatabaseSelect = (props: DatabaseSelectProps) => {
  const { datasource, onDatabaseChange, database } = props;
  const databases = useDatabases(datasource);
  const { label, tooltip, empty } = labels.components.DatabaseSelect;

  const options = databases.map((d) => ({ label: d, value: d }));
  options.push({ label: empty, value: '' }); // Allow a blank value

  // Add selected value to the list if it does not exist.
  // When loading an existing query, the saved value may no longer be in the list
  if (database && !databases.includes(database)) {
    options.push({ label: database, value: database });
  }

  useEffect(() => {
    // Auto select default db
    if (!database) {
      onDatabaseChange(datasource.getDefaultDatabase());
    }
  }, [datasource, database, onDatabaseChange]);

  return (
    <InlineField
      label={
        <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
          {label}
        </InlineFormLabel>
      }
    >
      <Select
        className={`width-15 ${styles.Common.inlineSelect}`}
        options={options}
        value={database}
        onChange={(e) => onDatabaseChange(e.value!)}
        menuPlacement={'bottom'}
        allowCustomValue
      ></Select>
    </InlineField>
  );
};

export type TableSelectProps = {
  datasource: Datasource;
  database: string;
  table: string;
  onTableChange: (value: string) => void;
  /** Set by a database change in the dropdown: the kept table is replaced if the new database lacks it. */
  databaseChanged?: MutableRefObject<boolean>;
};

export const TableSelect = (props: TableSelectProps) => {
  const { datasource, onTableChange, database, table, databaseChanged } = props;
  const tables = useTables(datasource, database);
  const { label, tooltip, empty } = labels.components.TableSelect;

  const options = tables.map((t) => ({ label: t, value: t }));
  options.push({ label: empty, value: '' }); // Allow a blank value

  // Include saved value in case it's no longer listed
  if (table && !tables.includes(table)) {
    options.push({ label: table, value: table });
  }

  useEffect(() => {
    if (!database || tables.length === 0) {
      return;
    }
    // useTables empties the list on a database change, so these are the new database's tables.
    const missing = Boolean(databaseChanged?.current) && Boolean(table) && !tables.includes(table);
    if (databaseChanged) {
      databaseChanged.current = false;
    }
    // Auto select first/default table
    if (!table || missing) {
      onTableChange(datasource.getDefaultTable() || tables[0]);
    }
  }, [database, table, tables, datasource, onTableChange, databaseChanged]);

  return (
    <InlineField
      label={
        <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
          {label}
        </InlineFormLabel>
      }
    >
      <Select
        className={`width-15 ${styles.Common.inlineSelect}`}
        options={options}
        value={table}
        onChange={(e) => onTableChange(e.value!)}
        menuPlacement={'bottom'}
        allowCustomValue
      ></Select>
    </InlineField>
  );
};

export type DatabaseTableSelectProps = {
  datasource: Datasource;
  database: string;
  onDatabaseChange: (value: string) => void;
  table: string;
  onTableChange: (value: string) => void;
};

export const DatabaseTableSelect = (props: DatabaseTableSelectProps) => {
  const { datasource, database, onDatabaseChange, table, onTableChange } = props;
  const databaseChanged = useRef<boolean>(false);
  const onSelectDatabase = (value: string) => {
    databaseChanged.current = true;
    onDatabaseChange(value);
  };

  return (
    <InlineFieldRow>
      <DatabaseSelect datasource={datasource} database={database} onDatabaseChange={onSelectDatabase} />
      <TableSelect
        datasource={datasource}
        database={database}
        table={table}
        onTableChange={onTableChange}
        databaseChanged={databaseChanged}
      />
    </InlineFieldRow>
  );
};
