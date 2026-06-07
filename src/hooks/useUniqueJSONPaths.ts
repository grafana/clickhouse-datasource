import { useState, useEffect } from 'react';
import { Datasource } from 'data/CHDatasource';

const useUniqueJSONPaths = (
  datasource: Datasource,
  jsonColumn: string,
  database: string,
  table: string,
  keysColumn?: string
): readonly string[] => {
  const [paths, setPaths] = useState<string[]>([]);

  useEffect(() => {
    if (!datasource || !jsonColumn || !database || !table) {
      setPaths([]);
      return;
    }

    setPaths([]);
    let ignore = false;
    datasource
      .fetchUniqueJSONPaths(jsonColumn, database, table, keysColumn)
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
  }, [datasource, jsonColumn, database, table, keysColumn]);

  return paths;
};

export default useUniqueJSONPaths;
