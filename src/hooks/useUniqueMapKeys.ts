import { useState, useEffect, useRef } from 'react';
import { Datasource } from 'data/CHDatasource';

export default (datasource: Datasource, mapColumn: string, database: string, table: string): readonly string[] => {
  const [keys, setKeys] = useState<string[]>([]); 
  
  useEffect(() => {
    if (!datasource || !mapColumn || !database || !table) {
      return;
    }

    let ignore = false;
    datasource.
      fetchUniqueMapKeys(mapColumn, database, table).
      then(tables => {
        if (ignore) {
          return;
        }
        setKeys(tables);
      }).
      catch((ex: any) => {
        console.error('Failed to fetch map keys for column:', mapColumn, database, table, ex);
      });

    return () => {
      ignore = true;
    };
  }, [datasource, mapColumn, database, table]);

  // Immediately return empty array on change so keys aren't stale
  const lastDatabase = useRef<string>('');
  const lastTable = useRef<string>('');
  if (database !== lastDatabase.current || table !== lastTable.current) {
    lastDatabase.current = database;
    lastTable.current = table;
    setKeys([]);
    return [];
  }

  return keys;
}
