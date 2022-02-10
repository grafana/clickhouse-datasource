import { isString } from 'lodash';
import sqlToAST, { astToSql, AST, applyFiltersToAST } from './ast';

export class AdHocFilter {
  private _targetTable = '';

  setTargetTable(table: string) {
    this._targetTable = table;
  }

  setTargetTableFromQuery(query: string) {
    const ast = sqlToAST(query);
    this.setTargetTableFromAST(ast);
  }

  private setTargetTableFromAST(ast: AST) {
    if (!ast.get('FROM')) {
      return;
    }
    const from = ast.get('FROM')![0];
    if (isString(from)) {
      this._targetTable = from.trim().replace(/(\(|\)|,)/gi, '');
      return;
    }
    if (from) {
      this.setTargetTableFromAST(from);
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
    if (this._targetTable === '') {
      return sql;
    }
    let whereClause = '';
    for (let i = 0; i < adHocFilters.length; i++) {
      const filter = adHocFilters[i];
      const v = isNaN(Number(filter.value)) ? `'${filter.value}'` : Number(filter.value);
      whereClause += ` ${filter.key} ${filter.operator} ${v} `;
      if (i !== adHocFilters.length - 1) {
        whereClause += filter.condition ? filter.condition : 'AND';
      }
    }
    // Semicolons are not required and cause problems when building the SQL
    sql = sql.replace(';', '');
    const ast = sqlToAST(sql);
    applyFiltersToAST(ast, whereClause, this._targetTable);
    return astToSql(ast);
  }
}

export type AdHocVariableFilter = {
  key: string;
  operator: string;
  value: string;
  condition: string;
};
