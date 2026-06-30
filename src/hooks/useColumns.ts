import { useState, useEffect, useRef } from 'react';
import { TableColumn } from 'types/queryBuilder';
import { Datasource } from 'data/CHDatasource';

// Shared in-flight requests keyed by datasource + database + table. When two
// callers mount with the same arguments (for example the annotation editor and
// the SchemaPicker it renders), they share a single fetchColumns request instead
// of issuing one each with separate loading states. The entry is removed once the
// request settles, so this only collapses overlapping fetches and never serves
// stale schema.
const inFlightColumns = new Map<string, Promise<readonly TableColumn[]>>();

export default (datasource: Datasource, database: string, table: string): readonly TableColumn[] => {
  const [columns, setColumns] = useState<readonly TableColumn[]>([]);

  useEffect(() => {
    if (!datasource || !database || !table) {
      return;
    }

    let ignore = false;
    const key = `${datasource.uid} ${database} ${table}`;
    let request = inFlightColumns.get(key);
    if (!request) {
      request = datasource.fetchColumns(database, table);
      inFlightColumns.set(key, request);
      request.finally(() => {
        if (inFlightColumns.get(key) === request) {
          inFlightColumns.delete(key);
        }
      });
    }
    request
      .then((cols) => {
        if (ignore) {
          return;
        }
        setColumns(cols);
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
