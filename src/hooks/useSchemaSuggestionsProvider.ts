import { Schema } from "components/suggestions";
import { Datasource } from "data/CHDatasource";
import { useRef, useState } from "react";
import { SqlFunction, TableColumn } from "types/queryBuilder";

export interface SchemaCache {
	functions: SqlFunction[] | null;
	databases: string[] | null;
	tables: Map<string, string[]>;
	columns: Map<string, TableColumn[]>;
}

function defaultSchemaCache(): SchemaCache {
  return {
	functions: null,
	databases: null,
	tables: new Map<string, string[]>(),
	columns: new Map<string, TableColumn[]>(),
  }
}

/**
 * Provides an interface for the auto-complete to read schema data from.
 * This data is cached since the auto-complete is always looking for schema data.
 */
export function useSchemaSuggestionsProvider(datasource: Datasource): Schema {
  const [datasourceID, setDatasourceID] = useState('');
  const cache = useRef<SchemaCache>(defaultSchemaCache());

  if (datasource.uid && datasource.uid !== datasourceID) {
	cache.current = defaultSchemaCache();
	setDatasourceID(datasource.uid);
  }

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

  async function fetchColumns(db: string, table: string) {
	const key = `${db || ''}.${table || ''}`;

	if (!cache.current.columns.has(key)) {
	  const columns = await datasource.fetchColumnsFromTable(db, table);
	  cache.current.columns.set(key, columns);

	  return columns;
	}

	return cache.current.columns.get(key)!;
  }

  return {
	functions: fetchFunctions,
	databases: fetchDatabases,
	tables: fetchTables,
	columns: fetchColumns,
	defaultDatabase: datasource.getDefaultDatabase(),
  };
}
