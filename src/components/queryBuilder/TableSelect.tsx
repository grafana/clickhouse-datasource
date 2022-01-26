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
  const [value, setValue] = useState<string | undefined>(table);
  const { label, tooltip } = selectors.components.QueryEditor.QueryBuilder.FROM;
  useEffect(() => {
    async function fetchTables() {
      const tables = await datasource.fetchTables(database);
      const values = tables.map((t) => ({ label: t, value: t }));
      values.push({ label: '-- Choose --', value: '' });
      setList(values);
      setValue('');
    }
    fetchTables();
  }, [datasource, database]);

  const onChange = (value: string) => {
    setValue(value);
    onTableChange(value);
  };

  return (
    <>
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <Select
        className={`width-15 ${styles.Common.inlineSelect}`}
        onChange={(e) => onChange(e.value!)}
        options={list}
        value={value}
        menuPlacement={'auto'}
      ></Select>
    </>
  );
};
