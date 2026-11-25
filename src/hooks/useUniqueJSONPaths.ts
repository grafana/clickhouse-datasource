import { useState, useEffect } from 'react';
import { Datasource } from 'data/CHDatasource';

interface FetchedPaths {
  datasource: Datasource;
  key: string;
  paths: string[];
}

const useUniqueJSONPaths = (
  datasource: Datasource,
  jsonColumn: string,
  database: string,
  table: string,
  keysColumn?: string
): readonly string[] => {
  // Results are tagged with the inputs they were fetched for, so a change of inputs reads as empty
  // straight away instead of showing the previous column's paths until the new fetch lands.
  const [fetched, setFetched] = useState<FetchedPaths>();
  const enabled = Boolean(datasource && jsonColumn && database && table);
  const key = JSON.stringify([jsonColumn, database, table, keysColumn]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let ignore = false;
    datasource
      .fetchUniqueJSONPaths(jsonColumn, database, table, keysColumn)
      .then((result) => {
        if (ignore) {
          return;
        }
        setFetched({ datasource, key, paths: result });
      })
      .catch((ex: any) => {
        console.error('Failed to fetch JSON paths for column:', jsonColumn, database, table, ex);
      });

    return () => {
      ignore = true;
    };
  }, [enabled, key, datasource, jsonColumn, database, table, keysColumn]);

  return enabled && fetched?.datasource === datasource && fetched.key === key ? fetched.paths : EMPTY;
};

const EMPTY: readonly string[] = [];

export default useUniqueJSONPaths;
