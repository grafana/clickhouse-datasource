import { AdHocVariableFilter } from '@grafana/data';
import { getTable } from './ast';
import { buildJSONPathAccess, parseJSONAdhocKey } from './jsonPath';

// OTel-standard Map columns. Retained as a fallback so behavior does not
// regress when schema info has not been populated (e.g. in tests that
// construct AdHocFilter directly without going through the datasource).
const DEFAULT_MAP_COLUMNS: ReadonlySet<string> = new Set(['ResourceAttributes', 'ScopeAttributes', 'LogAttributes']);

export class AdHocFilter {
  private _targetTable = '';
  private _mapColumns: ReadonlySet<string> = DEFAULT_MAP_COLUMNS;

  setTargetTableFromQuery(query: string) {
    // Reset first so that if getTable() throws (its pgsql AST can't parse some
    // valid ClickHouse SQL, e.g. backtick identifiers) we don't retain a stale
    // table from a previous query — apply() then re-derives from the panel SQL.
    this._targetTable = '';
    const table = getTable(query);
    if (table === '') {
      throw new Error('Failed to get table from adhoc query.');
    }
    this._targetTable = table;
  }

  /**
   * Register the set of column names known to be `Map(...)` (or
   * `Nullable(Map(...))`) in the current adhoc context. Used by `escapeKey`
   * to disambiguate `col.subkey` dotted paths — without this, there is no
   * way to tell a table-prefix apart from a Map-key access.
   *
   * The default set (`ResourceAttributes`, `ScopeAttributes`,
   * `LogAttributes`) is preserved as a fallback; callers should pass the
   * union of discovered columns plus any OTel-standard names they want to
   * keep supported.
   */
  setMapColumns(mapColumns: Iterable<string>) {
    const merged = new Set<string>(DEFAULT_MAP_COLUMNS);
    for (const c of mapColumns) {
      if (c) {
        merged.add(c);
      }
    }
    this._mapColumns = merged;
  }

  buildFilterString(adHocFilters: AdHocVariableFilter[], useJSON = false): string {
    if (!adHocFilters || adHocFilters.length === 0) {
      return '';
    }

    const validFilters = adHocFilters.filter((filter: AdHocVariableFilter) => {
      const valid = isValid(filter);
      if (!valid) {
        console.warn('Invalid adhoc filter will be ignored:', filter);
      }
      return valid;
    });

    const filters = validFilters
      .map((f, i) => {
        const key = escapeKey(f.key, useJSON, this._mapColumns);
        const value = escapeValueBasedOnOperator(f.value, f.operator, f.values);
        const condition = i !== validFilters.length - 1 ? (f.condition ? f.condition : 'AND') : '';
        const operator = convertOperatorToClickHouseOperator(f.operator);
        return ` ${key} ${operator} ${value} ${condition}`;
      })
      .join('');

    return filters;
  }

  /** @internal — exposed for tests; returns the active Map-column set. */
  getMapColumns(): ReadonlySet<string> {
    return this._mapColumns;
  }

  apply(sql: string, adHocFilters: AdHocVariableFilter[], useJSON = false): string {
    if (sql === '' || !adHocFilters || adHocFilters.length === 0) {
      return sql;
    }

    // sql can contain a query with double quotes around the database and table name, e.g. "default"."table", so we remove those
    if (this._targetTable !== '' && !sql.replace(/"/g, '').match(new RegExp(`.*\\b${this._targetTable}\\b.*`, 'gi'))) {
      return sql;
    }

    if (this._targetTable === '') {
      this._targetTable = getTable(sql);
    }

    if (this._targetTable === '') {
      return sql;
    }

    const filters = this.buildFilterString(adHocFilters, useJSON);

    if (filters === '') {
      return sql;
    }
    // Semicolons are not required and cause problems when building the SQL
    sql = sql.replace(';', '');
    return `${sql} settings additional_table_filters={'${this._targetTable}' : '${filters}'}`;
  }
}

function isValid(filter: AdHocVariableFilter): boolean {
  return filter.key !== undefined && filter.key !== '' && filter.operator !== undefined && filter.value !== undefined;
}

// Two-layer escape for a string embedded as a nested SQL literal inside the
// outer single-quoted `additional_table_filters` string — a Map key in
// `MapCol[\'<key>\']` or a filter value in `= \'<value>\'`. A raw `'` has to
// survive (a) the inner string literal and (b) the outer filter string — so
// each `'` produces `\\\'` and each `\` produces `\\\\` at SQL source level.
function escapeForOuterFilterLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\\\\\').replace(/'/g, "\\\\\\'");
}

// Self-describing Map access minted by getTagKeys: `MapCol['key']` or
// `table.MapCol['key']`. The bracket content is a ClickHouse string-literal
// body (quotes and backslashes pre-escaped with `\`).
const BRACKET_MAP_ACCESS = /^(?:([^.[\]']+)\.)?([^.[\]']+)\['((?:[^'\\]|\\.)*)'\]$/;

// Inverse of the ClickHouse string-literal escaping applied when the key was
// minted: `\X` → `X`.
function unescapeCHStringLiteral(s: string): string {
  return s.replace(/\\(.)/g, '$1');
}

// `buildJSONPathAccess` output embedded inside the single-quoted
// `additional_table_filters` string needs one further layer of string escaping
// (`'` → `\'`, `\` → `\\`) over the whole expression.
function buildJSONAccessForOuterFilter(col: string, path: string): string {
  const expr = buildJSONPathAccess(col, path);
  return expr.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function escapeKey(s: string, isJSON = false, mapColumns: ReadonlySet<string> = DEFAULT_MAP_COLUMNS): string {
  // Convert arrayElement(col, 'key') → col['key']. Handled up front so the
  // dotted-path logic below doesn't see synthetic function syntax.
  if (s.startsWith('arrayElement(') && s.endsWith(')')) {
    const match = s.match(/arrayElement\((.*?),\s*['"](.*?)['"]\)/);
    if (match) {
      const [_, array, key] = match;
      return `${array}[\\'${escapeForOuterFilterLiteral(key)}\\']`;
    }
  }

  // Explicit bracket form (`MapCol['key']` or `table.MapCol['key']`) is
  // handled without consulting mapColumns, so saved filters render
  // correctly on a fresh dashboard load, before getTagKeys has populated
  // the Map-column cache.
  const bracketed = s.match(BRACKET_MAP_ACCESS);
  if (bracketed) {
    const [, , mapCol, literalKey] = bracketed;
    const mapKey = unescapeCHStringLiteral(literalKey);
    if (isJSON) {
      return buildJSONAccessForOuterFilter(mapCol, mapKey);
    }
    return `${mapCol}[\\'${escapeForOuterFilterLiteral(mapKey)}\\']`;
  }

  // Stateless JSON path form minted by getTagKeys (`col.`seg``): the backtick
  // form is itself the signal, so it renders with no column cache (mirrors the
  // Map bracket form above).
  const jsonKey = parseJSONAdhocKey(s);
  if (jsonKey) {
    return buildJSONAccessForOuterFilter(jsonKey.column, jsonKey.path);
  }

  const parts = s.split('.');

  // Table-prefixed Map access: `table.MapCol.key1.key2` → `MapCol['key1.key2']`.
  // We only treat `parts[1]` as the Map column when parts[0] is not itself a
  // known Map column — otherwise `MapCol.a.b` would be misread as having `a`
  // as the Map column.
  if (parts.length >= 3 && !mapColumns.has(parts[0]) && mapColumns.has(parts[1])) {
    const mapCol = parts[1];
    const mapKey = parts.slice(2).join('.');
    if (isJSON) {
      return buildJSONAccessForOuterFilter(mapCol, mapKey);
    }
    return `${mapCol}[\\'${escapeForOuterFilterLiteral(mapKey)}\\']`;
  }

  // Non-prefixed Map access: `MapCol.key1.key2` (hideTableName=true or
  // OTel-style, where the first part is the Map column). Covers length 2
  // and length 3+ alike.
  if (parts.length >= 2 && mapColumns.has(parts[0])) {
    const mapCol = parts[0];
    const mapKey = parts.slice(1).join('.');
    if (isJSON) {
      return buildJSONAccessForOuterFilter(mapCol, mapKey);
    }
    return `${mapCol}[\\'${escapeForOuterFilterLiteral(mapKey)}\\']`;
  }

  // Default: bare column, or `table.col` reference where col isn't a Map.
  // Strip the leading table prefix if present.
  return s.includes('.') ? s.split('.').slice(1).join('.') : s;
}

function escapeValueBasedOnOperator(s: string, operator: string, values?: string[]): string {
  if (operator === 'IN' || operator === 'NOT IN') {
    // Build the list from the structured `values` array when Grafana provides it
    // (multi-select), otherwise best-effort split of the legacy joined string.
    // Every element is escaped and re-quoted, so no element can break out of the
    // filter clause — ClickHouse coerces quoted numerics, so numeric IN still
    // works. Empty list → `(NULL)` so `IN`/`NOT IN` stay valid SQL.
    const items = values && values.length > 0 ? values : parseInListItems(s);
    if (items.length === 0) {
      return '(NULL)';
    }
    return `(${items.map((item) => `\\'${escapeForOuterFilterLiteral(item)}\\'`).join(', ')})`;
  }
  // The value becomes a SQL string literal nested inside the single-quoted
  // additional_table_filters string — the same two-layer embedding as a Map
  // key inside `col['...']` — so reuse that escaping. Without it a value
  // containing `'` breaks out of the filter (e.g. `x' OR '1'='1`).
  return `\\'${escapeForOuterFilterLiteral(s)}\\'`;
}

// Split a legacy comma-separated IN value into individual items when the
// structured `values` array isn't provided. Strips an optional surrounding pair
// of parentheses and per-item surrounding single quotes/whitespace. Best-effort
// (a value containing a comma won't split correctly), but every resulting item
// is re-escaped and re-quoted by the caller, so it cannot break out of the SQL.
function parseInListItems(raw: string): string[] {
  let s = raw.trim();
  if (s.startsWith('(') && s.endsWith(')')) {
    s = s.slice(1, -1);
  }
  // Split on commas that are NOT inside a single-quoted element, so a value
  // containing a comma (e.g. `'gzip, deflate'`) stays a single item instead of
  // being torn in half. Best-effort: the joined form isn't a strict grammar.
  const items: string[] = [];
  let cur = '';
  let inQuote = false;
  for (const ch of s) {
    if (ch === "'") {
      inQuote = !inQuote;
      cur += ch;
    } else if (ch === ',' && !inQuote) {
      items.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  items.push(cur);
  return items
    .map((item) => item.trim().replace(/^'([\s\S]*)'$/, '$1').replace(/''/g, "'"))
    .filter((item) => item.length > 0);
}

function convertOperatorToClickHouseOperator(operator: string): string {
  // Grafana's "Matches regex" (=~) and "Does not match regex" (!~) are regex
  // operators, so map them to ClickHouse's REGEXP. Using ILIKE here produced
  // semantically wrong filters and prevented index usage for indexed columns
  // (see grafana/clickhouse-datasource#1443).
  if (operator === '=~') {
    return 'REGEXP';
  }
  if (operator === '!~') {
    return 'NOT REGEXP';
  }
  return operator;
}
