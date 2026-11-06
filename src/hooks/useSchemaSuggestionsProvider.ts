import { Schema } from 'components/suggestions';
import { Datasource } from 'data/CHDatasource';
import { useRef } from 'react';
import { SqlFunction } from 'types/queryBuilder';

export interface SchemaCache {
  functions: SqlFunction[] | null;
  databases: string[] | null;
  tables: Map<string, string[]>;
}

function defaultSchemaCache(): SchemaCache {
  return {
    functions: null,
    databases: null,
    tables: new Map<string, string[]>(),
  };
}

/**
 * Provides an interface for the auto-complete to read schema data from.
 * This data is cached since the auto-complete is always looking for schema data.
 *
 * Sometimes another CH datasource's suggestions will show up.
 * There's no way to detect this (tried using datasource.uid), it could be monaco caching suggestions since it does show a mix
 */
export function useSchemaSuggestionsProvider(datasource: Datasource): Schema {
  const cache = useRef<SchemaCache>(defaultSchemaCache());

  async function fetchFunctions() {
    if (cache.current.functions === null) {
      cache.current.functions = await datasource.fetchSqlFunctions();
    }

    return cache.current.functions;
  }

  async function fetchDatabases() {
    if (cache.current.databases === null) {
      cache.current.databases = await datasource.fetchDatabases();
    }

    return cache.current.databases;
  }

  async function fetchTables(db?: string) {
    if (db === undefined) {
      db = '';
    }

    if (!cache.current.tables.has(db)) {
      const tables = await datasource.fetchTables(db);
      cache.current.tables.set(db, tables);

      return tables;
    }

    return cache.current.tables.get(db)!;
  }

  return {
    functions: fetchFunctions,
    databases: fetchDatabases,
    tables: fetchTables,
    columns: (db, table) => datasource.getEditorColumnsCached(db, table),
    defaultDatabase: datasource.getDefaultDatabase(),
  };
}
