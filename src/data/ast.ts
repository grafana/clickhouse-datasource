/**
 * SQL→AST utilities for the query builder and ad-hoc filters.
 *
 * Both paths parse with the in-repo ClickHouse parser rather than
 * `pgsql-ast-parser`, whose Postgres grammar throws on valid ClickHouse syntax.
 * They use different entry points because they need different shapes:
 *
 * - `getTable` needs clause structure (CTE aliases, UNION, subquery nesting) to
 *   resolve which physical table an ad-hoc filter targets, so it uses the node
 *   tree from `ch-parser/parser` — the same parser that backs SQL autocomplete.
 * - `sqlToStatement` / `getFields` need a flat query model they can convert back
 *   into query-builder state, so they use `ch-parser/sql-parser`.
 */

import { FromQueryNode, parseSelect, SelectQueryNode } from 'ch-parser/parser';
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

function unquoteIdentifier(name: string): string {
  return name.replace(/^["`]|["`]$/g, '');
}

// The physical table a FROM node points at, or undefined for a subquery or a
// table function. A Grafana-variable target is returned verbatim (e.g.
// `${table}`), since that is the identifier the emitted query carries.
function qualifiedTableName(node: FromQueryNode): string | undefined {
  if (!node.table || node.isTableFunction) {
    return undefined;
  }
  const table = unquoteIdentifier(node.table);
  return node.database ? `${unquoteIdentifier(node.database)}.${table}` : table;
}

// Resolves the table the outer FROM reads from at this select level. When the
// FROM is a subquery it descends into that subquery, and only that subquery, so
// a scalar subquery in the SELECT list or a sibling CTE body is never mistaken
// for the target. A FROM that references a CTE resolves to the CTE's underlying
// table. A table-function FROM, or a top-level UNION, resolves to undefined.
function firstPhysicalTable(node: SelectQueryNode): string | undefined {
  // A top-level UNION combines several tables; single-table targeting is not
  // meaningful, so resolve to no table. Per-branch keying is a follow-up.
  if (node.hasUnion) {
    return undefined;
  }
  const from = node.from;
  if (!from) {
    return undefined;
  }
  // An unqualified FROM target that names a CTE defined at this level resolves
  // to the CTE body's table, not the alias (which ClickHouse would ignore).
  if (from.table && !from.database && !from.isTableFunction) {
    const cteBody = node.withAliases?.get(from.table);
    if (cteBody) {
      return firstPhysicalTable(cteBody);
    }
  }
  const name = qualifiedTableName(from);
  if (name) {
    return name;
  }
  if (from.subquery) {
    return firstPhysicalTable(from.subquery);
  }
  return undefined;
}

/**
 * Returns the physical table an ad-hoc filter should target for `sql`, or ''
 * when none can be found.
 *
 * Uses the node tree from `parseSelect` (shared with SQL autocomplete), not the
 * flat model behind `sqlToStatement`: resolving the target needs clause
 * structure. It resolves through a subquery FROM, CTE references,
 * keyword-named tables, and Grafana variables while rejecting table functions
 * and top-level UNIONs and honoring statement boundaries
 * (grafana/clickhouse-datasource#958).
 */
export function getTable(sql: string): string {
  const root = parseSelect(sql);
  if (!root) {
    return '';
  }
  return firstPhysicalTable(root) ?? '';
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
