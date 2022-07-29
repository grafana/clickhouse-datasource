import { getTable } from './ast2';

export class AdHocFilter {
  private _targetTable = '';

  setTargetTable(table: string) {
    this._targetTable = table;
  }

  setTargetTableFromQuery(query: string) {
    this._targetTable = getTable(query);
    if (this._targetTable === '') {
      throw new Error('Stuff broke');
    }
  }

  apply(sql: string, adHocFilters: AdHocVariableFilter[]): string {
    if (sql === '' || !adHocFilters || adHocFilters.length === 0) {
      return sql;
    }
    const filter = adHocFilters[0];
    if (filter.key.includes('.')) {
      this._targetTable = filter.key.split('.')[0];
    }
    if (this._targetTable === '' || !sql.search(this._targetTable)) {
      return sql;
    }
    let filters = '';
    for (let i = 0; i < adHocFilters.length; i++) {
      const filter = adHocFilters[i];
      const v = isNaN(Number(filter.value)) ? `\\'${filter.value}\\'` : Number(filter.value);
      filters += ` ${filter.key} ${filter.operator} ${v} `;
      if (i !== adHocFilters.length - 1) {
        filters += filter.condition ? filter.condition : 'AND';
      }
    }
    // Semicolons are not required and cause problems when building the SQL
    sql = sql.replace(';', '');
    return `${sql} settings additional_table_filters={'${this._targetTable}' : '${filters}'}`
  }
}

export type AdHocVariableFilter = {
  key: string;
  operator: string;
  value: string;
  condition: string;
};
