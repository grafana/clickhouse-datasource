/**
 * SQL→AST utilities backed by the pure-TypeScript ClickHouse parser.
 */

import { ParsedSelectQuery, parseSelectQuerySync } from 'ch-parser/sql-parser';
import { preprocessSql, restoreMacros, MacroMap } from 'ch-parser/macro-preprocessor';

export type { ParsedSelectQuery };

function parse(rawSql: string): ParsedSelectQuery | null {
  const { preprocessed, macroMap } = preprocessSql(rawSql);
  const raw = parseSelectQuerySync(preprocessed);
  if (!raw) {
    return null;
  }
  return restoreInResult(raw, macroMap);
}

function restoreInResult(result: ParsedSelectQuery, macroMap: MacroMap): ParsedSelectQuery {
  const restoreStr = (s: string) => restoreMacros(s, macroMap);
  const restoreNullable = (s: string | null) => (s ? restoreStr(s) : s);
  return {
    table: restoreStr(result.table),
    database: restoreStr(result.database),
    columns: result.columns.map((c) => ({
      ...c,
      name: restoreStr(c.name),
      alias: restoreNullable(c.alias),
      aggregateColumn: c.aggregateColumn ? restoreStr(c.aggregateColumn) : c.aggregateColumn,
    })),
    filters: result.filters.map((f) => ({
      ...f,
      key: restoreStr(f.key),
      value: Array.isArray(f.value) ? f.value.map(restoreStr) : f.value !== null ? restoreStr(f.value) : null,
    })),
    orderBy: result.orderBy.map((o) => ({ ...o, name: restoreStr(o.name) })),
    groupBy: result.groupBy.map(restoreStr),
    limit: result.limit,
  };
}

/**
 * Parse a raw SQL string into a structured representation.
 * Returns null when the SQL is not a valid SELECT statement.
 */
export function sqlToStatement(rawSql: string): ParsedSelectQuery | null {
  return parse(rawSql);
}

/**
 * Extract the table reference (including database if present) from a SQL string.
 *
 * @example
 *   getTable('SELECT a FROM myDB.MyTable') // → 'myDB.MyTable'
 *   getTable('SELECT a FROM MyTable')       // → 'MyTable'
 */
export function getTable(sql: string): string {
  const parsed = parse(sql);
  if (!parsed?.table) {
    return '';
  }
  return parsed.database ? `${parsed.database}.${parsed.table}` : parsed.table;
}

/**
 * Extract the list of selected field expressions from a SQL string.
 */
export function getFields(sql: string): string[] {
  const parsed = parse(sql);
  if (!parsed) {
    return [];
  }
  return parsed.columns.map((c) => (c.alias ? `${c.name} as ${c.alias}` : c.name));
}
