import { useState, useEffect } from 'react';
import { Datasource } from 'data/CHDatasource';

/**
 * Resolves whether the `<table>_trace_id_ts` companion exists.
 *
 * Returns `undefined` while the lookup is still in flight on a cold cache.
 * Callers that mirror this into builder options must treat `undefined` as
 * "don't know yet" and leave the upstream meta value alone — otherwise the
 * transient `false` clobbers the optimized value that the response-transform
 * path bakes into trace ID deep-link queries (see issue #1918).
 */
export default (datasource: Datasource, database: string, table: string): boolean | undefined => {
  const [result, setResult] = useState<boolean | undefined>(() =>
    datasource.peekTraceTimestampTable(database, table)
  );

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
