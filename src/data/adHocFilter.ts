import { AdHocVariableFilter } from '@grafana/data';
import { getTable } from './ast';

// OTel-standard Map columns. Retained as a fallback so behavior does not
// regress when schema info has not been populated (e.g. in tests that
// construct AdHocFilter directly without going through the datasource).
const DEFAULT_MAP_COLUMNS: ReadonlySet<string> = new Set(['ResourceAttributes', 'ScopeAttributes', 'LogAttributes']);

export class AdHocFilter {
  private _targetTable = '';
  private _mapColumns: ReadonlySet<string> = DEFAULT_MAP_COLUMNS;

  setTargetTableFromQuery(query: string) {
    this._targetTable = getTable(query);
    if (this._targetTable === '') {
      throw new Error('Failed to get table from adhoc query.');
    }
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
        const value = escapeValueBasedOnOperator(f.value, f.operator);
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

function escapeKey(s: string, isJSON = false, mapColumns: ReadonlySet<string> = DEFAULT_MAP_COLUMNS): string {
  // Convert arrayElement(col, 'key') → col['key']. Handled up front so the
  // dotted-path logic below doesn't see synthetic function syntax.
  if (s.startsWith('arrayElement(') && s.endsWith(')')) {
    const match = s.match(/arrayElement\((.*?),\s*['"](.*?)['"]\)/);
    if (match) {
      const [_, array, key] = match;
      return `${array}[\\'${key}\\']`;
    }
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
      return `${mapCol}.${mapKey}`;
    }
    return `${mapCol}[\\'${mapKey}\\']`;
  }

  // Non-prefixed Map access: `MapCol.key1.key2` (hideTableName=true or
  // OTel-style, where the first part is the Map column). Covers length 2
  // and length 3+ alike.
  if (parts.length >= 2 && mapColumns.has(parts[0])) {
    const mapCol = parts[0];
    const mapKey = parts.slice(1).join('.');
    if (isJSON) {
      return s;
    }
    return `${mapCol}[\\'${mapKey}\\']`;
  }

  // Default: bare column, or `table.col` reference where col isn't a Map.
  // Strip the leading table prefix if present.
  return s.includes('.') ? s.split('.').slice(1).join('.') : s;
}

function escapeValueBasedOnOperator(s: string, operator: string): string {
  if (operator === 'IN') {
    // Allow list of values without parentheses
    if (s.length > 2 && s[0] !== '(' && s[s.length - 1] !== ')') {
      s = `(${s})`;
    }
    return s.replace(/'/g, "\\'");
  } else {
    return `\\'${s}\\'`;
  }
}

function convertOperatorToClickHouseOperator(operator: string): string {
  if (operator === '=~') {
    return 'ILIKE';
  }
  if (operator === '!~') {
    return 'NOT ILIKE';
  }
  return operator;
}
