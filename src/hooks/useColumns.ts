import { useState, useEffect, useRef } from 'react';
import { TableColumn } from 'types/queryBuilder';
import { Datasource } from 'data/CHDatasource';

const FEATURE_FLAT_QUERYING = true;

export default (datasource: Datasource, database: string, table: string): readonly TableColumn[] => {
  const [columns, setColumns] = useState<readonly TableColumn[]>([]);

  useEffect(() => {
    if (!datasource || !database || !table) {
      return;
    }

    let columnPromise: Promise<readonly TableColumn[]>;
    if (FEATURE_FLAT_QUERYING) {
      columnPromise = datasource.fetchColumnsFlat(database, `${table}_query_aliases`);
    } else {
      columnPromise = datasource.fetchColumnsFull(database, table);
    }

    let ignore = false;
    columnPromise.then(columns => {
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
