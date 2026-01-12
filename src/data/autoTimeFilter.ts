/**
 * Auto Time Filter utility functions
 *
 * Automatically injects $__timeFilter macro into SQL queries that don't have
 * explicit time filtering, ensuring Grafana's dashboard time range is applied.
 */

import { findMainClausePosition, trimTrailingSemicolon } from './sqlUtils';

export interface AutoTimeFilterOptions {
  enabled: boolean;
  timeColumn: string;
  timeColumnType: 'DateTime' | 'DateTime64';
}

/**
 * Checks if the SQL query already contains a time filter macro or variable.
 *
 * Detects:
 * - $__timeFilter, $__timeFilter_ms, $__dateFilter, $__dateTimeFilter macros
 * - $__fromTime, $__toTime, $__fromTime_ms, $__toTime_ms variables
 */
export function hasTimeFilter(sql: string): boolean {
  if (!sql) {
    return false;
  }

  // Check for time filter macros: $__timeFilter(), $__timeFilter_ms(), $__dateFilter(), $__dateTimeFilter(), $__dt()
  const macroPattern = /\$__(?:timeFilter|timeFilter_ms|dateFilter|dateTimeFilter|dt)\s*\(/i;
  if (macroPattern.test(sql)) {
    return true;
  }

  // Check for time value variables: $__fromTime, $__toTime (and _ms variants)
  const varPattern = /\$__(?:fromTime|toTime|fromTime_ms|toTime_ms)\b/i;
  if (varPattern.test(sql)) {
    return true;
  }

  return false;
}

/**
 * Injects time filter into SQL query if conditions are met.
 *
 * @param sql - The SQL query string
 * @param options - Configuration for auto time filter
 * @returns Modified SQL with time filter injected, or original SQL if injection is not needed
 */
export function injectTimeFilter(sql: string, options: AutoTimeFilterOptions): string {
  if (!options.enabled || !options.timeColumn || !sql) {
    return sql;
  }

  // Skip if time filter already exists
  if (hasTimeFilter(sql)) {
    return sql;
  }

  // Skip if query doesn't look like a SELECT statement
  if (!sql.trim().toUpperCase().startsWith('SELECT')) {
    return sql;
  }

  // Remove trailing semicolon for consistent injection
  const trimmedSql = trimTrailingSemicolon(sql);

  // Choose macro based on column type
  const macro = options.timeColumnType === 'DateTime64' ? '$__timeFilter_ms' : '$__timeFilter';

  // Escape column name with double quotes for ClickHouse identifier
  const timeFilterClause = `${macro}("${options.timeColumn}")`;

  return injectWhereClause(trimmedSql, timeFilterClause);
}

/**
 * Injects a condition into the WHERE clause of a SQL query.
 *
 * Handles three cases:
 * 1. Query has existing WHERE clause - prepends condition with AND
 * 2. Query has no WHERE but has GROUP BY/ORDER BY/LIMIT - inserts WHERE before them
 * 3. Query has neither - appends WHERE at the end
 */
function injectWhereClause(sql: string, condition: string): string {
  // Find the main query's WHERE clause (not in subqueries or CTEs)
  // We use a simple heuristic: find WHERE that's not inside parentheses at a deeper level

  // Find WHERE position (case insensitive, word boundary)
  const whereMatch = findMainClausePosition(sql, 'WHERE');

  if (whereMatch !== -1) {
    // WHERE exists - insert condition right after WHERE keyword
    const insertPos = whereMatch + 5; // length of 'WHERE'
    return sql.slice(0, insertPos) + ` ${condition} AND` + sql.slice(insertPos);
  }

  // No WHERE clause - find where to insert it
  // Look for GROUP BY, ORDER BY, LIMIT, SETTINGS, FORMAT (in that order)
  const clausesToFind = ['GROUP BY', 'ORDER BY', 'LIMIT', 'SETTINGS', 'FORMAT'];

  for (const clause of clausesToFind) {
    const pos = findMainClausePosition(sql, clause);
    if (pos !== -1) {
      return sql.slice(0, pos) + `WHERE ${condition} ` + sql.slice(pos);
    }
  }

  // No subsequent clauses found - append WHERE at the end
  return sql + ` WHERE ${condition}`;
}

// Export for testing
export const _testExports = {
  injectWhereClause,
};
