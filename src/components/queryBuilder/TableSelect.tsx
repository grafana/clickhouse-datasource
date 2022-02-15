import React, { useState, useEffect } from 'react';
import { InlineFormLabel, Select } from '@grafana/ui';
import { SelectableValue } from '@grafana/data';
import { Datasource } from '../../data/CHDatasource';
import { selectors } from './../../selectors';
import { styles } from '../../styles';

export type Props = {
  datasource: Datasource;
  database?: string;
  table?: string;
  onTableChange: (value: string) => void;
};

export const TableSelect = (props: Props) => {
  const { datasource, onTableChange, database, table } = props;
  const [list, setList] = useState<Array<SelectableValue<string>>>([]);
  const { label, tooltip } = selectors.components.QueryEditor.QueryBuilder.FROM;
  useEffect(() => {
    async function fetchTables() {
      const tables = await datasource.fetchTables(database);
      const values = tables.map((t) => ({ label: t, value: t }));
      // Add selected value to the list if it does not exist.
      if (table && !tables.find((x) => x === table)) {
        values.push({ label: table!, value: table! });
      }
      // TODO - can't seem to reset the select to unselected
      values.push({ label: '-- Choose --', value: '' });
      setList(values);
    }
    fetchTables();
  }, [datasource, database, table]);

  const onChange = (value: string) => {
    onTableChange(value);
  };

  return (
    <>
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <Select
        className={`width-15 ${styles.Common.inlineSelect}`}
        onChange={(e) => onChange(e.value ? e.value : '')}
        options={list}
        value={table}
        menuPlacement={'bottom'}
        allowCustomValue={true}
      ></Select>
    </>
  );
};
