import { AdHocVariableFilter } from '@grafana/data';
import { getTable } from './ast';

export class AdHocFilter {
  private _targetTable = '';

  setTargetTableFromQuery(query: string) {
    this._targetTable = getTable(query);
    if (this._targetTable === '') {
      throw new Error('Failed to get table from adhoc query.');
    }
  }

  apply(sql: string, adHocFilters: AdHocVariableFilter[]): string {
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

    const filters = adHocFilters
      .filter((filter: AdHocVariableFilter) => {
        const valid = isValid(filter);
        if (!valid) {
          console.warn('Invalid adhoc filter will be ignored:', filter);
        }
        return valid;
      })
      .map((f, i) => {
        const key = escapeKey(f.key);
        const value = escapeValueBasedOnOperator(f.value, f.operator);
        const condition = i !== adHocFilters.length - 1 ? (f.condition ? f.condition : 'AND') : '';
        const operator = convertOperatorToClickHouseOperator(f.operator);
        return ` ${key} ${operator} ${value} ${condition}`;
      })
      .join('');

    if (filters === '') {
      return sql;
    }
    // Semicolons are not required and cause problems when building the SQL
    sql = sql.replace(';', '');
    return `${sql} settings additional_table_filters={'${this._targetTable}' : '${filters}'}`;
  }
}

function isValid(filter: AdHocVariableFilter): boolean {
  return filter.key !== undefined && filter.operator !== undefined && filter.value !== undefined;
}

function escapeKey(s: string): string {
  if (['ResourceAttributes', 'ScopeAttributes', 'LogAttributes'].includes(s.split('.')[0])) {
    return s;
  }

  // Convert arrayElement syntax to bracket notation
  if (s.startsWith('arrayElement(') && s.endsWith(')')) {
    const match = s.match(/arrayElement\((.*?),\s*['"](.*?)['"]\)/);
    if (match) {
      const [_, array, key] = match;
      return `${array}[\\'${key}\\']`;
    }
  }
  return s.includes('.') ? s.split('.')[1] : s;
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
