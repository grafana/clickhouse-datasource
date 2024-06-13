import { useState, useEffect, useRef } from 'react';
import { TableColumn } from 'types/queryBuilder';
import { Datasource } from 'data/CHDatasource';

export default (datasource: Datasource, database: string, table: string): readonly TableColumn[] => {
  const [columns, setColumns] = useState<readonly TableColumn[]>([]);

  useEffect(() => {
    if (!datasource || !database || !table) {
      return;
    }

    let ignore = false;
    datasource.fetchColumns(database, table).then(columns => {
        if (ignore) {
          return;
        }
        setColumns(columns);
      })
      .catch((ex: any) => {
        console.error(ex);
      });

    return () => {
      ignore = true;
    };
  }, [datasource, database, table]);

  // Immediately return empty array on change so columns aren't stale
  const lastDbTable = useRef<string>('');
  const dbTable = database + table;
  if (dbTable !== lastDbTable.current) {
    lastDbTable.current = dbTable;
    setColumns([]);
    return [];
  }

  return columns;
};
