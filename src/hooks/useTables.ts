import { useState, useEffect, useRef } from 'react';
import { Datasource } from 'data/CHDatasource';

export default (datasource: Datasource, database: string): string[] => {
  const [tables, setTables] = useState<string[]>([]); 
  
  useEffect(() => {
    if (!datasource || !database) {
      return;
    }

    let ignore = false;
    datasource.
      fetchTables(database).
      then(tables => {
        if (ignore) {
          return;
        }
        setTables(tables);
      }).
      catch((ex: any) => {
        console.error(ex);
      });

    return () => {
      ignore = false;
    };
  }, [datasource, database]);

  // Immediately return empty array on change so tables aren't stale
  const lastDatabase = useRef<string>('');
  if (database !== lastDatabase.current) {
    lastDatabase.current = database;
    setTables([]);
    return [];
  }

  return tables;
}
