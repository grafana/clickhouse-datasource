import { useState, useEffect, useRef } from 'react';
import { Datasource } from 'data/CHDatasource';

export default (datasource: Datasource, database: string): Record<string, string> => {
  const [engines, setEngines] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!datasource || !database) {
      return;
    }

    let ignore = false;
    datasource.fetchTableEngines(database).then((next) => {
      if (!ignore) {
        setEngines(next);
      }
    });

    return () => {
      ignore = true;
    };
  }, [datasource, database]);

  // Immediately return an empty map on change so engines aren't stale
  const lastDatabase = useRef<string>('');
  if (database !== lastDatabase.current) {
    lastDatabase.current = database;
    setEngines({});
    return {};
  }

  return engines;
};
