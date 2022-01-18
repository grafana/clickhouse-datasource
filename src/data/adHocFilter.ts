import sqlToAST, { clausesToSql, Clause } from './ast';

export class AdHocFilter {
  private _targetTable = '';

  setTargetTable(query: string) {
    const fromSplit = query.split(/\b\FROM\b/i);
    if (fromSplit.length === 2) {
      this._targetTable = this.getTableName(fromSplit[1]);
    }
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
    const ast = sqlToAST(sql);
    const filteredAST = this.applyFiltersToAST(ast, whereClause);
    return clausesToSql(filteredAST);
  }

  private applyFiltersToAST(ast: Map<string, Clause>, whereClause: string): Map<string, Clause> {
    if (typeof ast.get('FROM') === 'string') {
      const fromPhrase = ast.get('FROM')!.toString().trim();
      const tableName = this.getTableName(fromPhrase);
      if (tableName !== this._targetTable) {
        return ast;
      }
      // If there is no defined WHERE clause create one
      // Else add an ad hoc filter to the existing WHERE clause
      if (ast.get('WHERE') === null) {
        ast.set('FROM', ` ${tableName} `);
        // set where clause to ad hoc filter and add the remaining part of the from phrase to the new WHERE phrase
        return ast.set('WHERE', `${whereClause} ${fromPhrase.substring(tableName.length)}`);
      }
      return ast.set('WHERE', `${whereClause} AND ${ast.get('WHERE')}`);
    }
    const fromAST = this.applyFiltersToAST(ast.get('FROM')! as Map<string, Clause>, whereClause);
    return ast.set('FROM', fromAST);
  }

  // Returns a table name found in the FROM phrase
  // FROM phrases might contain more than just the table name
  private getTableName(fromPhrase: string): string {
    return fromPhrase
      .trim()
      .split(' ')[0]
      .replace(/(;|\(|\))/g, '');
  }
}

export type AdHocVariableFilter = {
  key: string;
  operator: string;
  value: string;
  condition: string;
};
