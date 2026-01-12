/**
 * Common SQL utility functions
 *
 * Shared helpers for SQL query manipulation used by autoTimeFilter module.
 */

/**
 * Finds the position of a SQL clause keyword in the main query.
 * Attempts to skip subqueries by tracking parentheses depth.
 *
 * @param sql - The SQL query string
 * @param clause - The clause to find (e.g., 'WHERE', 'GROUP BY', 'LIMIT')
 * @returns Position of the clause, or -1 if not found in main query
 */
export function findMainClausePosition(sql: string, clause: string): number {
  const upperSql = sql.toUpperCase();
  const upperClause = clause.toUpperCase();

  let depth = 0;
  let i = 0;

  // Skip CTE (WITH clause) if present
  const withMatch = upperSql.match(/^\s*WITH\b/);
  if (withMatch) {
    // Find the main SELECT after WITH
    // CTEs end at the SELECT that's not inside parentheses
    let cteDepth = 0;
    for (i = withMatch[0].length; i < sql.length; i++) {
      const char = sql[i];
      if (char === '(') {
        cteDepth++;
      } else if (char === ')') {
        cteDepth--;
      } else if (cteDepth === 0 && upperSql.slice(i).match(/^\s*SELECT\b/)) {
        // Found main SELECT after CTE
        break;
      }
    }
  }

  // Now search for the clause in the main query
  for (; i < sql.length; i++) {
    const char = sql[i];

    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    } else if (depth === 0) {
      // Check if current position matches the clause
      const remaining = upperSql.slice(i);
      const pattern = new RegExp(`^\\s*${upperClause.replace(' ', '\\s+')}\\b`);
      const match = remaining.match(pattern);
      if (match) {
        // Skip leading whitespace to return position of actual keyword
        const whitespaceMatch = remaining.match(/^\s*/);
        const whitespaceLen = whitespaceMatch ? whitespaceMatch[0].length : 0;
        return i + whitespaceLen;
      }
    }
  }

  return -1;
}

/**
 * Removes trailing semicolon from SQL query for consistent manipulation.
 */
export function trimTrailingSemicolon(sql: string): string {
  return sql.replace(/;\s*$/, '').trim();
}
