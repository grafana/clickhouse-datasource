import { useEffect, useState } from 'react';
import { Datasource } from 'data/CHDatasource';
import { TableKeys } from 'types/queryBuilder';

interface Resolved {
  tableId: string;
  keys: TableKeys | null;
}

/**
 * Resolves a table's sorting and partition keys. Returns `undefined` while the lookup is in flight
 * and `null` when there is no table or the keys are unavailable.
 */
export default (datasource: Datasource, database: string, table: string): TableKeys | null | undefined => {
  const [resolved, setResolved] = useState<Resolved>();
  const tableId = `${datasource.uid}\0${database}\0${table}`;

  useEffect(() => {
    if (!database || !table) {
      return;
    }

    let cancelled = false;
    datasource.fetchTableKeys(database, table).then(
      (keys) => !cancelled && setResolved({ tableId, keys: keys ?? null }),
      () => !cancelled && setResolved({ tableId, keys: null })
    );

    return () => {
      cancelled = true;
    };
  }, [datasource, database, table, tableId]);

  if (!database || !table) {
    return null;
  }
  return resolved?.tableId === tableId ? resolved.keys : undefined;
};
