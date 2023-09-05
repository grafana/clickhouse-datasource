import React, { useState, useEffect } from 'react';
import { InlineFormLabel, Select } from '@grafana/ui';
import { SelectableValue } from '@grafana/data';
import { Datasource } from '../../data/CHDatasource';
import selectors from 'v4/selectors';
import { styles } from '../../styles';
import useDatabaseTables from 'hooks/useDatabaseTables';
import useDatabases from 'hooks/useDatabases';

export type DatabaseSelectProps = {
  datasource: Datasource;
  database: string;
  onDatabaseChange: (value: string) => void
};

export const DatabaseSelect = (props: DatabaseSelectProps) => {
  const { datasource, onDatabaseChange, database } = props;
  const databases = useDatabases(datasource);
  const [list, setList] = useState<Array<SelectableValue<string>>>([]);
  const { label, tooltip } = selectors.components.DatabaseSelect;

  useEffect(() => {
    const values = databases.map(d => ({ label: d, value: d }));

    // Add selected value to the list if it does not exist.
    if (database && !databases.includes(database)) {
      values.push({ label: database, value: database });
    }

    setList(values);
  }, [datasource, database, databases]);

  const defaultDatabase = datasource.settings.jsonData.defaultDatabase;
  const db = database ?? defaultDatabase;

  return (
    <>
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <Select
        className={`width-15 ${styles.Common.inlineSelect}`}
        onChange={e => onDatabaseChange(e.value!)}
        options={list}
        value={db}
        menuPlacement={'bottom'}
        allowCustomValue={true}
      ></Select>
    </>
  );
};

export type TableSelectProps = {
  datasource: Datasource;
  database: string;
  table: string;
  onTableChange: (value: string) => void;
};


export const TableSelect = (props: TableSelectProps) => {
  const { datasource, onTableChange, database, table } = props;
  const tables = useDatabaseTables(datasource, database);
  const [list, setList] = useState<Array<SelectableValue<string>>>([]);
  const { label, tooltip } = selectors.components.TableSelect;

  useEffect(() => {
    const values = tables.map(t => ({ label: t, value: t }));
    // Add selected value to the list if it does not exist.
    if (table && !tables.includes(table)) {
      values.push({ label: table, value: table });
    }

    // TODO: Can't seem to reset the select to unselected
    values.push({ label: '-- Choose --', value: '' });
    setList(values);
  }, [tables, table]);

  return (
    <>
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <Select
        className={`width-15 ${styles.Common.inlineSelect}`}
        onChange={e => onTableChange(e.value ?? '')}
        options={list}
        value={table}
        menuPlacement={'bottom'}
        allowCustomValue={true}
      ></Select>
    </>
  );
};

export type DatabaseTableSelectProps = {
  datasource: Datasource;
  database: string;
  onDatabaseChange: (value: string) => void
  table: string;
  onTableChange: (value: string) => void;
};

export const DatabaseTableSelect = (props: DatabaseTableSelectProps) => {
  const { datasource, database, onDatabaseChange, table, onTableChange } = props;

  return (
    <div className="gf-form">
      <DatabaseSelect datasource={datasource} database={database} onDatabaseChange={onDatabaseChange} />
      <TableSelect datasource={datasource} database={database} table={table} onTableChange={onTableChange} />
    </div>
  );
}
