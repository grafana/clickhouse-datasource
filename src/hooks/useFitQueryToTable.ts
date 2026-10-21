import { useEffect, useRef } from 'react';
import { TableColumn } from 'types/queryBuilder';
import { BuilderOptionsReducerAction, fitToTable } from './useBuilderOptionsState';

/**
 * Fits the query to a table it is moved to, once that table's columns load: what the table lacks is
 * dropped and the empty roles are guessed (see `fitQueryToTable`). Runs only after a database or
 * table change, never for the table the builder mounted with, so opening a saved query never
 * rewrites it.
 */
export default (
  allColumns: readonly TableColumn[],
  database: string,
  table: string,
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>
) => {
  const fittedTo = useRef<string>(`${database}\u0000${table}`);

  useEffect(() => {
    const current = `${database}\u0000${table}`;
    if (!database || !table || allColumns.length === 0 || current === fittedTo.current) {
      return;
    }
    fittedTo.current = current;
    builderOptionsDispatch(fitToTable(database, table, allColumns));
  }, [allColumns, database, table, builderOptionsDispatch]);
};
