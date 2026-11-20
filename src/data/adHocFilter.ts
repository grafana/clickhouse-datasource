import { AdHocVariableFilter } from '@grafana/data';
import { Lexer } from 'ch-parser/lexer';
import { TokenType } from 'ch-parser/types';
import { getTable } from './ast';
import { buildJSONPathAccess, parseJSONAdhocKey, quoteColumnIfUnsafe } from './jsonPath';

// OTel-standard Map columns. Retained as a fallback so behavior does not
// regress when schema info has not been populated (e.g. in tests that
// construct AdHocFilter directly without going through the datasource).
const DEFAULT_MAP_COLUMNS: ReadonlySet<string> = new Set(['ResourceAttributes', 'ScopeAttributes', 'LogAttributes']);

/** Whether a filter applies to a query, and why not when it does not. */
export interface FilterApplicability {
  applies: boolean;
  reason?: string;
}

/**
 * The notice for a query that leaves some of `adHocFilters` out, with one
 * sentence per reason, or undefined when the query takes every filter. For
 * example: `Filter "level = info" isn't applied here: otel.otel_traces has no
 * column level.`
 */
export function leftOutFiltersNotice(
  adHocFilters: AdHocVariableFilter[],
  applicability: FilterApplicability[]
): string | undefined {
  const labelsByReason = new Map<string, string[]>();
  applicability.forEach((result, i) => {
    if (!result.applies) {
      const reason = result.reason ?? '';
      labelsByReason.set(reason, [...(labelsByReason.get(reason) ?? []), `"${filterLabel(adHocFilters[i])}"`]);
    }
  });
  if (labelsByReason.size === 0) {
    return undefined;
  }
  return [...labelsByReason]
    .map(([reason, labels]) => {
      const list =
        labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
      const subject = labels.length === 1 ? `Filter ${list} isn't` : `Filters ${list} aren't`;
      // A reason is a sentence of its own, so one that starts with "The" goes on in lower case.
      return `${subject} applied here: ${reason.replace(/^The /, 'the ')}`;
    })
    .join(' ');
}

// A filter as the filter bar shows it: `level = info`, or `level =| info, warn` with several values.
function filterLabel(filter: AdHocVariableFilter): string {
  return `${filter.key} ${filter.operator} ${filter.values?.length ? filter.values.join(', ') : filter.value}`;
}

// Where a query's filters go.
interface FilterScope {
  // The table the filters are keyed to.
  table: string;
  // Leave out a filter whose key names another table.
  tableQualifiedKeys: boolean;
}

export class AdHocFilter {
  private _targetTable = '';
  private _mapColumns: ReadonlySet<string> = DEFAULT_MAP_COLUMNS;
  private _tableColumns = new Map<string, ReadonlySet<string>>();

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

  /**
   * Record the columns of `table`, named as `getTable` returns it. A filter on a
   * column the table does not have is then left out of that table's filters, so
   * the query keeps working instead of failing with an unknown identifier. A
   * table without recorded columns gets every filter, as before.
   */
  setTableColumns(table: string, columns: Iterable<string>) {
    this._tableColumns.set(table, new Set(columns));
  }

  hasTableColumns(table: string): boolean {
    return this._tableColumns.has(table);
  }

  /**
   * The table the filters of `sql` are keyed to, or '' when there is none. An
   * explicit target set via setTargetTableFromQuery (the tag-source path) takes
   * precedence over the table the query reads.
   */
  resolveTargetTable(sql: string): string {
    return this._targetTable !== '' ? this._targetTable : getTable(sql);
  }

  /**
   * Render the filters as the body of an `additional_table_filters` entry. With
   * `targetTable`, filters whose key names a different table, or whose column
   * the table is known not to have, are left out. Without `tableQualifiedKeys`,
   * a dotted key that is no Map or JSON access is a column whose name has dots,
   * and is kept whole.
   */
  buildFilterString(
    adHocFilters: AdHocVariableFilter[],
    useJSON = false,
    targetTable?: string,
    tableQualifiedKeys = true
  ): string {
    return this.renderFilters(
      adHocFilters,
      useJSON,
      targetTable === undefined ? undefined : { table: targetTable, tableQualifiedKeys },
      tableQualifiedKeys
    );
  }

  /** @internal — exposed for tests; returns the active Map-column set. */
  getMapColumns(): ReadonlySet<string> {
    return this._mapColumns;
  }

  /**
   * Append the ad-hoc filters to `sql` as an `additional_table_filters`
   * setting on the query's table. With `tableQualifiedKeys`, a filter applies
   * only to the table its key names. A filter on a column the table is known
   * not to have is left out.
   */
  apply(sql: string, adHocFilters: AdHocVariableFilter[], useJSON = false, tableQualifiedKeys = true): string {
    if (sql === '' || !adHocFilters || adHocFilters.length === 0) {
      return sql;
    }

    const scope = this.scopeFor(sql, tableQualifiedKeys);
    if ('reason' in scope) {
      return sql;
    }

    const filters = this.renderFilters(adHocFilters, useJSON, scope);

    if (filters === '') {
      return sql;
    }
    // Drop the statement terminator first, or the settings clause lands after
    // `;` and ClickHouse rejects the query as multiple statements.
    sql = stripStatementTerminator(sql);
    // Append on a new line so a trailing line comment (`-- ...`) cannot swallow
    // the settings clause and silently drop the filter.
    return `${sql}\nsettings additional_table_filters={'${scope.table}' : '${filters}'}`;
  }

  /**
   * Whether `apply` would add each of `adHocFilters` to `sql`, with the reason
   * when it would not, in the same order as the filters.
   */
  applicability(
    sql: string,
    adHocFilters: AdHocVariableFilter[],
    useJSON = false,
    tableQualifiedKeys = true
  ): FilterApplicability[] {
    const scope = this.scopeFor(sql, tableQualifiedKeys);
    return adHocFilters.map((filter) => {
      if ('reason' in scope) {
        return { applies: false, reason: scope.reason };
      }
      if (!isValid(filter)) {
        return { applies: false, reason: 'The filter is incomplete or uses an unsupported operator.' };
      }
      const resolved = this.resolve(filter, useJSON, scope);
      return 'reason' in resolved ? { applies: false, reason: resolved.reason } : { applies: true };
    });
  }

  // Where the filters of `sql` go, or why they go nowhere.
  private scopeFor(sql: string, tableQualifiedKeys: boolean): FilterScope | { reason: string } {
    // Resolve the target table for THIS query. A single AdHocFilter is shared
    // across panels, so a query-derived target is intentionally not cached back
    // onto the instance: caching it would let the first panel to render decide
    // the table for every later panel.
    const explicitTarget = this._targetTable !== '';
    const targetTable = this.resolveTargetTable(sql);

    if (targetTable === '') {
      return { reason: 'The query does not read a single table, so ad hoc filters are not added to it.' };
    }

    // Only re-check that the target appears in this query for an explicit
    // tag-source target; a target just parsed from this same query is by
    // definition present, and the ASCII \b guard would only produce false
    // negatives for non-ASCII or spaced names. Quoting is stripped first (e.g.
    // "default"."table" or `default`.`table`) and the name is regex-escaped so a
    // name with regex metacharacters (e.g. `a[b`) neither throws nor mismatches.
    if (explicitTarget && !sql.replace(/["`]/g, '').match(new RegExp(`.*\\b${escapeRegExp(targetTable)}\\b.*`, 'gi'))) {
      return { reason: `The query does not read ${targetTable}, the table ad hoc filters apply to.` };
    }

    return { table: targetTable, tableQualifiedKeys };
  }

  private renderFilters(
    adHocFilters: AdHocVariableFilter[],
    useJSON: boolean,
    scope?: FilterScope,
    tableQualified = scope?.tableQualifiedKeys ?? true
  ): string {
    if (!adHocFilters || adHocFilters.length === 0) {
      return '';
    }

    const rendered = adHocFilters
      .filter((filter: AdHocVariableFilter) => {
        const valid = isValid(filter);
        if (!valid) {
          console.warn('Invalid adhoc filter will be ignored:', filter);
        }
        return valid;
      })
      .flatMap((filter) => {
        const resolved = this.resolve(filter, useJSON, scope, tableQualified);
        return 'expression' in resolved ? [{ filter, expression: resolved.expression }] : [];
      });

    return rendered
      .map(({ filter: f, expression }, i) => {
        const value = escapeValueBasedOnOperator(f.value, f.operator, f.values);
        const condition = i !== rendered.length - 1 ? toCondition(f.condition) : '';
        const operator = convertOperatorToClickHouseOperator(f.operator);
        return ` ${expression} ${operator} ${value} ${condition}`;
      })
      .join('');
  }

  // The expression `filter` tests in `scope`, escaped for the filter string, or
  // why the filter is left out of it. Without a scope every filter applies.
  private resolve(
    filter: AdHocVariableFilter,
    useJSON: boolean,
    scope?: FilterScope,
    tableQualified = scope?.tableQualifiedKeys ?? true
  ): { expression: string } | { reason: string } {
    if (!scope) {
      return { expression: escapeKey(filter.key, useJSON, this._mapColumns, tableQualified) };
    }
    if (scope.tableQualifiedKeys && !appliesToTable(filter.key, scope.table, this._mapColumns)) {
      const table = tablePrefix(filter.key, this._mapColumns);
      return { reason: `The filter is for table ${table}, and the query reads ${scope.table}.` };
    }
    const columns = this._tableColumns.get(scope.table);
    const column = keyColumn(filter.key, this._mapColumns, tableQualified);
    if (columns && column !== undefined && !hasColumn(columns, column)) {
      return { reason: `${scope.table} has no column ${column}.` };
    }
    return { expression: escapeKey(filter.key, useJSON, this._mapColumns, tableQualified) };
  }
}

// Operators Grafana's ad-hoc filter UI can send, plus this plugin's own IN / NOT
// IN. The operator is emitted verbatim into the filter expression and, like the
// key and value, is URL-settable (`var-filter=key|<op>|value`), so anything
// outside this list is rejected rather than spliced into the SQL.
const SUPPORTED_OPERATORS: ReadonlySet<string> = new Set([
  '=',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  '=~',
  '!~',
  '=|',
  '!=|',
  'IN',
  'NOT IN',
]);

function isValid(filter: AdHocVariableFilter): boolean {
  return (
    filter.key !== undefined &&
    filter.key !== '' &&
    filter.operator !== undefined &&
    SUPPORTED_OPERATORS.has(filter.operator) &&
    filter.value !== undefined
  );
}

// The condition joining two filters is emitted verbatim too, so only AND / OR
// pass through; anything else falls back to the default AND.
function toCondition(condition: string | undefined): string {
  const normalized = condition?.trim().toUpperCase();
  return normalized === 'OR' ? 'OR' : 'AND';
}

// Cut `sql` at its statement terminator: the final run of `;` tokens, with only
// whitespace and comments between and after them (`t; -- note`, `t;;`). The
// lexer reads string literals, quoted identifiers and comments as whole tokens,
// so a `;` inside one, e.g. splitByChar(';', col), is never taken for the
// terminator. A `;` followed by another statement is left as it is.
function stripStatementTerminator(sql: string): string {
  const lexer = new Lexer(sql);
  let terminatorBegin = -1;
  for (let token = lexer.nextToken(); !token.isEnd(); token = lexer.nextToken()) {
    if (token.type === TokenType.Semicolon) {
      if (terminatorBegin === -1) {
        terminatorBegin = token.begin;
      }
    } else if (token.isSignificant()) {
      terminatorBegin = -1;
    }
  }
  return terminatorBegin === -1 ? sql : sql.slice(0, terminatorBegin);
}

// Escape regex metacharacters so a table name can be interpolated into a
// RegExp safely (a `.` in db.table stays literal, `[` etc. do not throw).
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

// A column identifier emitted straight into the `additional_table_filters`
// expression. Ad-hoc filter keys are URL-settable, and this identifier used to
// be emitted verbatim, so a crafted key such as `ServiceName = 'x' OR 1=1 --`
// spliced raw SQL into the filter predicate and bypassed the filter. Plain and
// dotted identifiers pass through unchanged; anything else is backtick-quoted
// (identifier layer first, then the outer single-quoted filter string) so the
// query fails closed with UNKNOWN_IDENTIFIER rather than running the injection.
function safeColumnRef(id: string): string {
  const quoted = quoteColumnIfUnsafe(id);
  if (quoted === id) {
    return id;
  }
  return quoted.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function appliesToTable(key: string, targetTable: string, mapColumns: ReadonlySet<string>): boolean {
  const table = tablePrefix(key, mapColumns);
  return table === undefined || table === targetTable.slice(targetTable.lastIndexOf('.') + 1);
}

function tablePrefix(key: string, mapColumns: ReadonlySet<string>): string | undefined {
  if (key.startsWith('arrayElement(')) {
    return undefined;
  }
  const bracketed = key.match(BRACKET_MAP_ACCESS);
  if (bracketed) {
    return bracketed[1];
  }
  const jsonKey = parseJSONAdhocKey(key);
  if (jsonKey) {
    return jsonKey.table;
  }
  const [first, ...rest] = key.split('.');
  return rest.length > 0 && !mapColumns.has(first) ? first : undefined;
}

// The column `key` reads once escapeKey renders it: the Map or JSON column for a
// key into one, otherwise the key without its table prefix, or the whole key when
// keys are not table-qualified. Undefined when the key is not a plain name, so the
// caller cannot tell whether a table has it.
function keyColumn(key: string, mapColumns: ReadonlySet<string>, tableQualified = true): string | undefined {
  let column: string;
  const arrayElement = key.match(/^arrayElement\(([^,]*),/);
  const bracketed = key.match(BRACKET_MAP_ACCESS);
  const jsonKey = parseJSONAdhocKey(key);
  const parts = key.split('.');
  if (arrayElement) {
    column = arrayElement[1].trim();
  } else if (bracketed) {
    column = bracketed[2];
  } else if (jsonKey) {
    column = jsonKey.column;
  } else if (tableQualified && parts.length >= 3 && !mapColumns.has(parts[0]) && mapColumns.has(parts[1])) {
    column = parts[1];
  } else if (parts.length >= 2 && mapColumns.has(parts[0])) {
    column = parts[0];
  } else {
    column = tableQualified && parts.length > 1 ? parts.slice(1).join('.') : key;
  }
  return column === '' || /[`'"[\]()]/.test(column) ? undefined : column;
}

// Whether a table with `columns` has `column`: the column itself, a column it
// reads a part or a JSON path of (`LogAttributes.keys`), or a Nested column
// under it (`Events.Name` for `Events`).
function hasColumn(columns: ReadonlySet<string>, column: string): boolean {
  const parts = column.split('.');
  for (let i = parts.length; i > 0; i--) {
    if (columns.has(parts.slice(0, i).join('.'))) {
      return true;
    }
  }
  return [...columns].some((c) => c.startsWith(`${column}.`));
}

function escapeKey(
  s: string,
  isJSON = false,
  mapColumns: ReadonlySet<string> = DEFAULT_MAP_COLUMNS,
  tableQualified = true
): string {
  // Convert arrayElement(col, 'key') → col['key']. Handled up front so the
  // dotted-path logic below doesn't see synthetic function syntax.
  if (s.startsWith('arrayElement(') && s.endsWith(')')) {
    const match = s.match(/arrayElement\((.*?),\s*['"](.*?)['"]\)/);
    if (match) {
      const [_, array, key] = match;
      return `${safeColumnRef(array)}[\\'${escapeForOuterFilterLiteral(key)}\\']`;
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
    return `${safeColumnRef(mapCol)}[\\'${escapeForOuterFilterLiteral(mapKey)}\\']`;
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
  if (tableQualified && parts.length >= 3 && !mapColumns.has(parts[0]) && mapColumns.has(parts[1])) {
    const mapCol = parts[1];
    const mapKey = parts.slice(2).join('.');
    if (isJSON) {
      return buildJSONAccessForOuterFilter(mapCol, mapKey);
    }
    return `${safeColumnRef(mapCol)}[\\'${escapeForOuterFilterLiteral(mapKey)}\\']`;
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
    return `${safeColumnRef(mapCol)}[\\'${escapeForOuterFilterLiteral(mapKey)}\\']`;
  }

  // Default: bare column, or `table.col` reference where col isn't a Map.
  // The leading table prefix is stripped only when keys are table-qualified;
  // otherwise the dots belong to the column name.
  return safeColumnRef(tableQualified && s.includes('.') ? s.split('.').slice(1).join('.') : s);
}

function escapeValueBasedOnOperator(s: string, operator: string, values?: string[]): string {
  if (operator === 'IN' || operator === 'NOT IN' || operator === '=|' || operator === '!=|') {
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
    .map((item) =>
      item
        .trim()
        .replace(/^'([\s\S]*)'$/, '$1')
        .replace(/''/g, "'")
    )
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
  // Grafana's multi-value ad-hoc operators ("Equals any of multiple values" /
  // "Not equal any of multiple values") send the literal symbols =| / !=|
  // with a `values` array — same shape as this plugin's own IN / NOT IN, so
  // map them onto the ClickHouse operator escapeValueBasedOnOperator already
  // builds a parenthesized list for (see grafana/scenes AdHocFiltersCombobox).
  if (operator === '=|') {
    return 'IN';
  }
  if (operator === '!=|') {
    return 'NOT IN';
  }
  return operator;
}
