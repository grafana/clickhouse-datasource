import sqlToAST, { ASTToSql, Clause, AST } from './ast';

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
    this.applyFiltersToAST(ast, whereClause);
    return ASTToSql(ast);
  }

  private applyFiltersToAST(ast: AST, whereClause: string): AST {
    if (!ast || !ast.get('FROM')) return ast;

    const fromPhrase = ast.get('FROM')![ast.get('FROM')!.length - 1]!.toString().trim();
    for (let c of ast.get('FROM')!) {
        if (typeof c === 'string') {
            const tableName = this.getTableName(fromPhrase);
            const tableRE = RegExp(`\\b${tableName}\\b`, 'g');
            if (!c.match(tableRE)) continue;
            const where = ast.get('WHERE');
            // If there is no defined WHERE clause create one
            // Else add an ad hoc filter to the existing WHERE clause
            if (where?.length === 0) {
              let asdf = ast.get('FROM')!.indexOf(c);
              ast.get('FROM')![asdf] = ` ${tableName} `;
                // set where clause to ad hoc filter and add the remaining part of the from phrase to the new WHERE phrase
                ast.set('WHERE', [`${whereClause} ${fromPhrase.substring(tableName.length)}`]);
                //ast.set('WHERE', [`${whereClause}`]);
            }
            else {
                where!.unshift(`${whereClause} AND `);
            }
        }
    }

    ast.forEach((clauses: Clause[], key: string) => {
        for (let c of clauses) {
            if (typeof c === 'string') {
                
            } else if (c !== null) {
              this.applyFiltersToAST(c, whereClause);
            }
        }
    });

    return ast;
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
