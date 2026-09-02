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

export interface ColumnsState {
  columns: readonly TableColumn[];
  loading: boolean;
}

/** Reports whether a fetch is in flight, so callers can tell "not fetched yet" apart from "this table has no columns". */
export const useColumnsState = (datasource: Datasource, database: string, table: string): ColumnsState => {
  const [state, setState] = useState<ColumnsState>({ columns: [], loading: false });

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
      .then((columns) => {
        if (!ignore) {
          setState({ columns, loading: false });
        }
      })
      .catch((ex: any) => {
        console.error(ex);
        if (!ignore) {
          setState({ columns: [], loading: false });
        }
      });

    return () => {
      ignore = true;
    };
  }, [datasource, database, table]);

  // Immediately return empty array on change so columns aren't stale
  const lastDbTable = useRef<string>('');
  const dbTable = `${database}\0${table}`;
  if (dbTable !== lastDbTable.current) {
    lastDbTable.current = dbTable;
    const loading = Boolean(datasource && database && table);
    setState({ columns: [], loading });
    return { columns: [], loading };
  }

  return state;
};

export default (datasource: Datasource, database: string, table: string): readonly TableColumn[] =>
  useColumnsState(datasource, database, table).columns;
