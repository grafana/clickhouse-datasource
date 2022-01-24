import React, { useState, useEffect } from 'react';
import { InlineFormLabel, Select } from '@grafana/ui';
import { SelectableValue } from '@grafana/data';
import { Datasource } from '../../data/CHDatasource';
import { selectors } from './../../selectors';
import { styles } from '../../styles';

export type Props = { datasource: Datasource; database?: string; table?: string; onTableChange: (value: string) => void };

export const TableSelect = (props: Props) => {
  const { datasource, onTableChange, database } = props;
  const [list, setList] = useState<Array<SelectableValue<string>>>([]);
  const { label, tooltip } = selectors.components.QueryEditor.QueryBuilder.FROM;
  useEffect(() => {
    async function fetchTables() {
      const tables = await datasource.fetchTables(database)
      const values = tables.map((t) => ({ label: t, value: t }));
      setList(values);
    }
    fetchTables();
  }, [datasource, database]);
  return (
    <>
      <InlineFormLabel width={8} className="query-keyword" tooltip={tooltip}>
        {label}
      </InlineFormLabel>
      <Select
        className={`width-15 ${styles.Common.inlineSelect}`}
        onChange={(e) => onTableChange(e.value!)}
        options={list}
        value={props.table}
        menuPlacement={'auto'}
      ></Select>
    </>
  );
};
