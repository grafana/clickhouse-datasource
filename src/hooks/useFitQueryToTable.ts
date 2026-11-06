import { useEffect, useRef } from 'react';
import { TableColumn } from 'types/queryBuilder';
import { BuilderOptionsReducerAction, fitToTable } from './useBuilderOptionsState';

/** Identifies a database and table pair, for `pickedSource`. */
export const sourceKey = (database: string, table: string): string => `${database}\u0000${table}`;

/**
 * Fits the query to a table picked in the database or table dropdown, once that table's columns
 * load: what the table lacks is dropped and the empty roles are guessed (see `fitQueryToTable`).
 * `pickedSource` is the `sourceKey` of the last pick; a table the query arrives on any other way,
 * such as the one the builder mounts with or one Grafana replaces the query with (query history, a
 * dashboard change), is left alone, so a loaded query is never rewritten.
 */
export default (
  allColumns: readonly TableColumn[],
  database: string,
  table: string,
  pickedSource: string | undefined,
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>
) => {
  const fittedTo = useRef<string>(sourceKey(database, table));

  useEffect(() => {
    const current = sourceKey(database, table);
    if (current !== pickedSource) {
      // Arrived some other way: take it as it is, so picking another table later still fits from here.
      fittedTo.current = current;
      return;
    }
    if (!database || !table || allColumns.length === 0 || current === fittedTo.current) {
      return;
    }
    fittedTo.current = current;
    builderOptionsDispatch(fitToTable(database, table, allColumns));
  }, [allColumns, database, table, pickedSource, builderOptionsDispatch]);
};
