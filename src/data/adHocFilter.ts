import sqlToAST, { ASTToSql, Clause, AST } from './ast';

export class AdHocFilter {
  private _targetTable = '';

  setTargetTable(query: string) {
    const ast = sqlToAST(query);
    this.setTargetTableFroAST(ast);
  }

  private setTargetTableFroAST(ast: AST) {
    if (!ast.get('FROM')) {
      return;
    }
    const from = ast.get('FROM')![0];
    if (typeof from === 'string') {
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
    const ast = sqlToAST(sql);
    this.applyFiltersToAST(ast, whereClause);
    return ASTToSql(ast);
  }

  private applyFiltersToAST(ast: AST, whereClause: string): AST {
    if (!ast || !ast.get('FROM')) return ast;

    const tableName = this._targetTable;
    if (!tableName) return ast;

    for (let clause of ast.get('FROM')!) {
      if (typeof clause === 'string') {
        const tableRE = RegExp(`\\b${tableName}\\b`, 'g');
        if (!clause.match(tableRE)) continue;
        const where = ast.get('WHERE');
        // If there is no defined WHERE clause create one
        // Else add an ad hoc filter to the existing WHERE clause
        if (where?.length === 0) {
          // set WHERE clause to ad hoc filter and add the remaining part of the FROM clause to the new WHERE clause
          // example: "(SELECT * FROM table) as r" will have a FROM clause of "table) as r". We need ") as r" to be after the new WHERE clause

          // first we get the remaining part of the FROM phrase. ") as r"
          const fromPhraseAfterTableName = ast.get('FROM')![ast.get('FROM')!.length - 1]!.toString().trim().substring(tableName.length);
          // apply the remaining part of the FROM phrase to the end of the new WHERE clause
          ast.set('WHERE', [`${whereClause} ${fromPhraseAfterTableName}`]);
          // set the FROM clause to only have the table name
          const index = ast.get('FROM')!.indexOf(clause);
          ast.get('FROM')![index] = ` ${tableName} `;
          continue;
        }
        where!.unshift(`${whereClause} AND `);
      }
    }

    // Each node in the AST needs to be checked to see if ad hoc filters should be applied
    ast.forEach((clauses: Clause[]) => {
      for (let c of clauses) {
        if (typeof c === 'string') {

        } else if (c !== null) {
          this.applyFiltersToAST(c, whereClause);
        }
      }
    });

    return ast;
  }
}

export type AdHocVariableFilter = {
  key: string;
  operator: string;
  value: string;
  condition: string;
};
