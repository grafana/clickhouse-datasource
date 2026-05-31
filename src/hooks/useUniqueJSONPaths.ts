import { useState, useEffect } from 'react';
import { Datasource } from 'data/CHDatasource';

export default (datasource: Datasource, jsonColumn: string, database: string, table: string): readonly string[] => {
  const [paths, setPaths] = useState<string[]>([]);

  useEffect(() => {
    if (!datasource || !jsonColumn || !database || !table) {
      setPaths([]);
      return;
    }

    setPaths([]);
    let ignore = false;
    datasource
      .fetchUniqueJSONPaths(jsonColumn, database, table)
      .then((result) => {
        if (ignore) {
          return;
        }
        setPaths(result);
      })
      .catch((ex: any) => {
        console.error('Failed to fetch JSON paths for column:', jsonColumn, database, table, ex);
      });

    return () => {
      ignore = true;
    };
  }, [datasource, jsonColumn, database, table]);

  return paths;
};
