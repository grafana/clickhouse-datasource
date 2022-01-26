import { getTemplateSrv } from '@grafana/runtime';
import { Range, SchemaKind, Suggestion } from './sqlProvider';

export interface Schema {
  databases: () => Promise<string[]>;
  tables: (db?: string) => Promise<string[]>;
  fields: (db: string, table: string) => Promise<string[]>;
  defaultDatabase?: string;
}

export async function fetchSuggestions(text: string, schema: Schema, range: Range): Promise<Suggestion[]> {
  if (text.endsWith('$')) {
    return getVariableSuggestions(range);
  }

  const keyWords = ['select', 'from', 'where'];
  let normalized = text.replace(/[\n\r]/g, ' '); // remove crlf;
  for (const v of keyWords) {
    normalized = normalized.replace(v, v.toUpperCase());
  }
  if (normalized.endsWith('SELECT ') || normalized.endsWith('FROM ') || normalized.endsWith(', ')) {
    if (schema.defaultDatabase !== undefined) {
      return fetchTableSuggestions(schema, range);
    }
    return fetchDatabaseSuggestions(schema, range);
  }

  if (normalized.endsWith('WHERE ')) {
    // only show the tables we selected from
    // TODO: could also show the fields since where clause doesn't require the table name
    const parts = normalized.split('FROM ');
    const lastPart = parts[parts.length - 1];
    const subparts = lastPart.split(' WHERE');
    const tablesString = subparts[0];
    const tables = tablesString.split(',').map((t) => t.trim());
    return tables.map((val) => ({
      label: val,
      kind: SchemaKind.TABLE,
      documentation: 'Table',
      insertText: val,
      range,
    }));
  }

  if (text.endsWith('.')) {
    const parts = text.split(' ');
    const current = parts[parts.length - 1];
    const subparts = current.split('.');
    if (schema.defaultDatabase !== undefined) {
      // format: table. scenario - fetch the fields for the table
      const table = subparts[0];
      return fetchFieldSuggestions(schema, range, '', table);
    }
    // no default database defined - assume format: db.table.field
    if (subparts.length === 2) {
      // show tables
      const db = subparts[0];
      return fetchTableSuggestions(schema, range, db);
    }
    // show fields
    const db = subparts[0];
    const table = subparts[1];
    return fetchFieldSuggestions(schema, range, db, table);
  }
  return [];
}

async function fetchDatabaseSuggestions(schema: Schema, range: Range) {
  const databases = await schema.databases();
  return databases.map((val) => ({
    label: val,
    kind: SchemaKind.DATABASE,
    documentation: 'Database',
    insertText: val,
    range,
  }));
}

async function fetchTableSuggestions(schema: Schema, range: Range, database?: string) {
  const tables = await schema.tables(database);
  return tables.map((val) => ({
    label: val,
    kind: SchemaKind.TABLE,
    documentation: 'Table',
    insertText: val,
    range,
  }));
}

async function fetchFieldSuggestions(schema: Schema, range: Range, db: string, table: string) {
  const fields = await schema.fields(db, table);
  return fields.map((val) => ({
    label: val,
    kind: SchemaKind.FIELD,
    documentation: 'Field',
    insertText: val,
    range,
  }));
}

function getVariableSuggestions(range: Range) {
  const templateSrv = getTemplateSrv();
  if (!templateSrv) {
    return [];
  }
  return templateSrv.getVariables().map((variable) => {
    const label = `\${${variable.name}}`;
    const val = templateSrv.replace(label);
    return {
      label,
      detail: `(Template Variable) ${val}`,
      kind: SchemaKind.VARIABLE,
      documentation: `(Template Variable) ${val}`,
      insertText: `{${variable.name}}`,
      range,
    };
  });
}
