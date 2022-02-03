import { isString } from 'lodash';
import SqlToAST, { ASTToSql, AST, ApplyFiltersToAST } from './ast';

export class AdHocFilter {
  private _targetTable = '';

  setTargetTable(query: string) {
    const ast = SqlToAST(query);
    this.setTargetTableFroAST(ast);
  }

  private setTargetTableFroAST(ast: AST) {
    if (!ast.get('FROM')) {
      return;
    }
    const from = ast.get('FROM')![0];
    if (isString(from)) {
      this._targetTable = from.trim().replace(/(\(|\)|,)/gi, '');
      return;
    }
    this.setTargetTableFroAST(from!);
  }

  apply(sql: string, adHocFilters: AdHocVariableFilter[]): string {
    if (this._targetTable === '' || sql === '' || !adHocFilters || adHocFilters.length === 0) {
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
    const ast = SqlToAST(sql);
    ApplyFiltersToAST(ast, whereClause, this._targetTable);
    return ASTToSql(ast);
  }
}

export type AdHocVariableFilter = {
  key: string;
  operator: string;
  value: string;
  condition: string;
};
