import React, { useState, useEffect } from 'react';
import { Select } from '@grafana/ui';
import { SelectableValue } from '@grafana/data';
import { Datasource } from '../../data/CHDatasource';
import { selectors } from './../../selectors';
import { EditorField } from '@grafana/experimental';

export type Props = { datasource: Datasource; value?: string; onChange: (value: string) => void };

export const DatabaseSelect = (props: Props) => {
  const { datasource, onChange, value } = props;
  const [list, setList] = useState<Array<SelectableValue<string>>>([]);
  const { label, tooltip } = selectors.components.QueryEditor.QueryBuilder.DATABASE;
  useEffect(() => {
    async function fetchList() {
      const list = await datasource.fetchDatabases();
      const values = list.map((t) => ({ label: t, value: t }));
      // Add selected value to the list if it does not exist.
      if (value && !list.find((x) => x === value)) {
        values.push({ label: value!, value: value! });
      }
      setList(values);
    }
    fetchList();
  }, [datasource, value]);

  const defaultDatabase = datasource.settings.jsonData.defaultDatabase;
  const db = value ?? defaultDatabase;
  return (
    <EditorField tooltip={tooltip} label={label}>
      <Select
        onChange={(e) => onChange(e.value!)}
        options={list}
        value={db}
        allowCustomValue={true}
        width={25}
      ></Select>
    </EditorField>
  );
};
