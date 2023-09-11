import React, { useEffect } from 'react';
import { InlineFormLabel, Select } from '@grafana/ui';
import { Datasource } from '../../data/CHDatasource';
import labels from 'labels';
import { styles } from '../../styles';
import useTables from 'hooks/useTables';
import useDatabases from 'hooks/useDatabases';

export type DatabaseSelectProps = {
  datasource: Datasource;
  database: string;
  onDatabaseChange: (value: string) => void
};

export const DatabaseSelect = (props: DatabaseSelectProps) => {
  const { datasource, onDatabaseChange, database } = props;
  const databases = useDatabases(datasource);
  const { label, tooltip, empty } = labels.components.DatabaseSelect;

  const options = databases.map(d => ({ label: d, value: d }));
  options.push({ label: empty, value: '' }); // Allow a blank value

  // Add selected value to the list if it does not exist.
  if (database && !databases.includes(database)) {
    options.push({ label: database, value: database });
  }

  useEffect(() => {
    // Auto select default db
    if (!database) {
      onDatabaseChange(datasource.getDefaultDatabase() || 'default');
    }
  }, [datasource, database, onDatabaseChange]);

  return (
    <>
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <Select
        className={`width-15 ${styles.Common.inlineSelect}`}
        options={options}
        value={database}
        onChange={e => onDatabaseChange(e.value!)}
        menuPlacement={'bottom'}
        allowCustomValue
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
  const tables = useTables(datasource, database);
  const { label, tooltip, empty } = labels.components.TableSelect;

  const options = tables.map(t => ({ label: t, value: t }));
  options.push({ label: empty, value: '' }); // Allow a blank value

  if (table && !tables.includes(table)) {
    options.push({ label: table, value: table });
  }

  // useEffect(() => {
  //   // TODO: broken. tables are loaded async when the db is changed, so it picks the first table from the previous db
  //   // Auto select first table
  //   if (database && !table && tables.length > 0) {
  //       onTableChange(tables[0]);
  //   }
  // }, [database, table, tables, onTableChange]);

  return (
    <>
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <Select
        className={`width-15 ${styles.Common.inlineSelect}`}
        options={options}
        value={table}
        onChange={e => onTableChange(e.value!)}
        menuPlacement={'bottom'}
        allowCustomValue
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
