import { useState, useEffect } from 'react';
import { SelectableValue } from '@grafana/data';
import { Datasource } from 'data/CHDatasource';

export default (
  datasource: Datasource,
  column: string,
  database: string,
  table: string
): readonly SelectableValue<string>[] => {
  const [options, setOptions] = useState<SelectableValue<string>[]>([]);

  useEffect(() => {
    if (!datasource || !column || !database || !table) {
      setOptions([]);
      return;
    }

    let ignore = false;
    datasource
      .fetchDistinctColumnValues(column, database, table)
      .then((values) => {
        if (ignore) {
          return;
        }
        setOptions(values.map((v) => ({ label: v, value: v })));
      })
      .catch((ex: any) => {
        console.error('Failed to fetch column values:', column, ex);
      });

    return () => {
      ignore = true;
    };
  }, [datasource, column, database, table]);

  return options;
};
