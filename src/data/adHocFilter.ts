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
    const ast = this.sqlToAST(sql);
    const filteredAST = this.applyFiltersToAST(ast, whereClause);
    return this.clausesToSql(filteredAST);
  }

  private sqlToAST(sql: string): Map<string, Clause> {
    const ast = this.createStatement();
    const re =
      /\b(WITH|SELECT|DISTINCT|FROM|SAMPLE|JOIN|PREWHERE|WHERE|GROUP BY|LIMIT BY|HAVING|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT|INTO OUTFILE|FORMAT)\b/gi;
    let bracketCount = 0;
    let lastBracketCount = 0;
    let lastNode = '';
    let bracketPhrase = '';
    let regExpArray: RegExpExecArray | null;
    while ((regExpArray = re.exec(sql)) !== null) {
      // Sets foundNode to a SQL keyword from the regular expression
      const foundNode = regExpArray[0].toUpperCase();
      const phrase = sql.substring(re.lastIndex, sql.length).split(re)[0];
      // If there is a greater number of open brackets than closed,
      // add the the bracket phrase that will eventually be added the the last node
      if (bracketCount > 0) {
        bracketPhrase += foundNode + phrase;
      } else {
        ast.set(foundNode, phrase);
        lastNode = foundNode;
      }
      bracketCount += (phrase.match(/\(/g) || []).length;
      bracketCount -= (phrase.match(/\)/g) || []).length;
      if (bracketCount <= 0 && lastBracketCount > 0) {
        // The phrase brackets is complete
        // If it is a FROM phrase lets make a branch node
        // If it is anything else lets make a leaf node
        if (lastNode === 'FROM') {
          ast.set(lastNode, this.sqlToAST(bracketPhrase));
        } else {
          const p = (ast.get(lastNode) as string).concat(bracketPhrase);
          ast.set(lastNode, p);
        }
      }
      lastBracketCount = bracketCount;
    }
    return ast;
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

  private clausesToSql(ast: Map<string, Clause>): string {
    let r = '';
    ast.forEach((c: Clause, key: string) => {
      if (typeof c === 'string') {
        r += `${key} ${c.trim()} `;
      } else if (c !== null) {
        r += `${key} (${this.clausesToSql(c)} `;
      }
    });
    // Remove all of the consecutive spaces to make things more readable when debugging
    return r.trim().replace(/\s+/g, ' ');
  }

  // Returns a table name found in the FROM phrase
  // FROM phrases might contain more than just the table name
  private getTableName(fromPhrase: string): string {
    return fromPhrase
      .trim()
      .split(' ')[0]
      .replace(/(;|\(|\))/g, '');
  }

  // Creates a statement with all the keywords to preserve the keyword order
  private createStatement() {
    let clauses = new Map<string, Clause>();
    clauses.set('WITH', null);
    clauses.set('SELECT', null);
    clauses.set('DISTINCT', null);
    clauses.set('FROM', null);
    clauses.set('SAMPLE', null);
    clauses.set('JOIN', null);
    clauses.set('PREWHERE', null);
    clauses.set('WHERE', null);
    clauses.set('GROUP BY', null);
    clauses.set('LIMIT BY', null);
    clauses.set('HAVING', null);
    clauses.set('LIMIT', null);
    clauses.set('OFFSET', null);
    clauses.set('UNION', null);
    clauses.set('INTERSECT', null);
    clauses.set('EXCEPT', null);
    clauses.set('INTO OUTFILE', null);
    clauses.set('FORMAT', null);
    return clauses;
  }
}

export type AdHocVariableFilter = {
  key: string;
  operator: string;
  value: string;
  condition: string;
};

type Clause = string | Map<string, Clause> | null;
