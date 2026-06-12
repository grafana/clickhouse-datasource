import { useState, useEffect } from 'react';
import { Datasource } from 'data/CHDatasource';

export default (datasource: Datasource, database: string, table: string): boolean => {
  const [result, setResult] = useState(() => datasource.peekTraceTimestampTable(database, table) ?? false);

  useEffect(() => {
    if (!database || !table) {
      setResult(false);
      return;
    }

    let cancelled = false;
    datasource
      .hasTraceTimestampTable(database, table)
      .then((v) => {
        if (!cancelled) {
          setResult(v);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResult(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasource, database, table]);

  return result;
};
