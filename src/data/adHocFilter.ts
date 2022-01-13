
export class AdHocManager {
  targetTable = '';
  setTargetTable(query: string) {
    const fromSplit = query.split(/\bfrom\b/i);
    if (fromSplit.length == 2) {
      this.targetTable = fromSplit[1].trim().split(' ')[0].replace(';', '');
    }
    else {
      //warning
    }
  }

  apply(rawSql: string, adHocFilters: AdHocVariableFilter[]): string {
    if (rawSql == '' || !adHocFilters || adHocFilters.length == 0) {
      return rawSql;
    }
    
    //create the adhoc where clause
    let whereClause = '';
    for (let i = 0; i < adHocFilters.length; i++) {
      const filter = adHocFilters[i];
      const v = isNaN(Number(filter.value)) ? `'${filter.value}'` : Number(filter.value)
      whereClause += ` ${filter.key} ${filter.operator} ${v} `;
      if (i !== adHocFilters.length - 1) {
        whereClause += filter.condition ? filter.condition : 'AND';
      }
    }

    const clauses = this.applyFiltersToTree(this.getClauseTree(rawSql), whereClause);
    return this.clausesToRawSql(clauses);
  }

  applyFiltersToTree(clauses: Map<string, Clause>, whereClause: string) {
    //find which statements have to same table as the adhoc filter, so we can append
    if (clauses.get('FROM')?.statement.trim() === this.targetTable) {
      if (clauses.has('WHERE')) {
        clauses.get('WHERE')!.statement += whereClause;
      } else {
        clauses.set('WHERE', {statement: whereClause} as Clause);
      }
    } 
    else if (clauses.get('FROM')?.clauses) {
      clauses.get('FROM')!.clauses = this.applyFiltersToTree(clauses.get('FROM')!.clauses, whereClause);
    }
    return clauses;
  }

  getClauseTree(sql: string) {
    let clauses = new Map<string, Clause>();
    let regExpArray: RegExpExecArray | null;
    const statementRE = /\b(WITH|SELECT|DISTINCT|FROM|SAMPLE|JOIN|PREWHERE|WHERE|GROUP BY|LIMIT BY|HAVING|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT|INTO OUTFILE|FORMAT)\b/ig;
    let bc = 0;
    let lastAdded = '';
    while ((regExpArray = statementRE.exec(sql)) !== null) {
      const found = regExpArray[0];
      const st = sql.substring(statementRE.lastIndex, sql.length).split(statementRE);
      if(bc > 0) {
        clauses.get(lastAdded)!.statement += found + st[0];
      } else {
        clauses.set(found, {statement: st[0]} as Clause);
        lastAdded = found;
      }
      bc += (st[0].match(/\(/g) || []).length;
      if (st[0].includes(')')) {
        bc -= (st[0].match(/\)/g) || []).length;
        if (bc === 0) {
          const st = clauses.get(lastAdded)!.statement;
          clauses.get(lastAdded)!.clauses = this.getClauseTree(st.substring(1, st.length-2))
        }
      }
    }
    return clauses;
  }

  clausesToRawSql(clauses: Map<string, Clause>) {
    let r = '';
    clauses.forEach((c: Clause, key: string) => {
      r += key;
      if (c.clauses && c.clauses.keys.length > 0) {
        r += ` (${this.clausesToRawSql(c.clauses)}) `;
      } else {
        r += ` ${c.statement.trim()} `;
      }
    });
    return r;
  }
}

export type AdHocVariableFilter = {
  key: string;
  operator: string;
  value: string;
  condition: string;
};

export type Clause = {
  statement: string;
  clauses: Map<string, Clause>;
}
