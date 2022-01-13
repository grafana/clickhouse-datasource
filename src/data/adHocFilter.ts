
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

    const clauses = this.sqlToAST(rawSql);
    const filteredClauses = this.applyFiltersToTree(clauses, whereClause);
    return this.clausesToRawSql(filteredClauses);
  }

  applyFiltersToTree(clauses: Map<string, Clause>, whereClause: string) {
    if (!clauses) {
      return new Map<string, Clause>();
    }
    //find which statements have the same table as the adhoc filter so we can append
    if (typeof clauses.get('FROM') === 'string' && clauses.get('FROM')?.toString().trim() === this.targetTable) {
      if (clauses.get('WHERE')) {
        clauses.set('WHERE', `${whereClause} AND ${clauses.get('WHERE')!}`);
      } else {
        clauses.set('WHERE', whereClause);
      }
    } 
    else if (typeof clauses.get('FROM') === 'object') {
      clauses.set('FROM', this.applyFiltersToTree(clauses.get('FROM')! as Map<string, Clause>, whereClause));
    }
    return clauses;
  }

  sqlToAST(sql: string) {
    let clauses = this.createStatement();
    let regExpArray: RegExpExecArray | null;
    const re = /\b(WITH|SELECT|DISTINCT|FROM|SAMPLE|JOIN|PREWHERE|WHERE|GROUP BY|LIMIT BY|HAVING|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT|INTO OUTFILE|FORMAT)\b/ig;
    let bracketCount = 0;
    let lastBracketCount = 0;
    let lastAddedOp = '';
    let nodePhrase = '';
    while ((regExpArray = re.exec(sql)) !== null) {
      const found = regExpArray[0];
      const phrase = sql.substring(re.lastIndex, sql.length).split(re)[0];
      // if a bracket was found we need to add each element 
      if(bracketCount > 0) {
        nodePhrase += found + phrase;
      } else {
        clauses.set(found, phrase);
        lastAddedOp = found;
      }
      bracketCount += (phrase.match(/\(/g) || []).length;
      bracketCount -= (phrase.match(/\)/g) || []).length;
      if (bracketCount <= 0 && lastBracketCount > 0) {
        //phrase is complete. Lets parse it
        if (lastAddedOp === 'FROM') {
          clauses.set(lastAddedOp, this.sqlToAST(nodePhrase));
        } else {
          let p = (clauses.get(lastAddedOp) as string).concat(nodePhrase);
          clauses.set(lastAddedOp, p);
        }
      }
      lastBracketCount = bracketCount;
    }
    return clauses;
  }

  clausesToRawSql(clauses: Map<string, Clause>) {
    let r = '';
    clauses.forEach((c: Clause, key: string) => {
      if (typeof c === 'string') {
        r += `${key} ${c.trim()} `;
      } else if (c) {
        r += `${key} (${this.clausesToRawSql(c)} `;
      }
    });
    return r;
  }

  createStatement() {
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
