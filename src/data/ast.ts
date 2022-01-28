import { isString } from 'lodash';

export type Clause = string | AST | null;
export type AST = Map<string, Clause[]>;

export default function sqlToAST(sql: string): AST {
  const ast = createStatement();
  const re =
    /\b(WITH|SELECT|DISTINCT|FROM|SAMPLE|JOIN|PREWHERE|WHERE|GROUP BY|LIMIT BY|HAVING|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT|INTO OUTFILE|FORMAT)\b/gi;
  const bracket = { count: 0, lastCount: 0, phrase: '' };
  let lastNode = '';
  let regExpArray: RegExpExecArray | null;
  ast.set('', [sql.split(re, 2)[0]]);

  while ((regExpArray = re.exec(sql)) !== null) {
    // Sets foundNode to a SQL keyword from the regular expression
    const foundNode = regExpArray[0].toUpperCase();
    const phrase = sql.substring(re.lastIndex, sql.length).split(re, 2)[0];
    // If there is a greater number of open brackets than closed,
    // add the phrase to the bracket phrase. The complete bracket phrase will be used to create a new AST branch
    if (bracket.count > 0) {
      bracket.phrase += foundNode + phrase;
    } else {
      ast.set(foundNode, [phrase]);
      lastNode = foundNode;
      bracket.phrase = phrase;
    }
    bracket.count += (phrase.match(/\(/g) || []).length;
    bracket.count -= (phrase.match(/\)/g) || []).length;
    if (bracket.count <= 0 && bracket.lastCount > 0) {
      // The phrase is complete
      // If it contains the keyword SELECT, make new branches
      // If it does not, make a leaf node
      if (bracket.phrase.match(/\bSELECT\b/gi)) {
        ast.set(lastNode, getASTBranches(bracket.phrase));
      } else {
        ast.set(lastNode, [bracket.phrase]);
      }
    }
    bracket.lastCount = bracket.count;
  }
  return ast;
}

export function ASTToSql(ast: AST): string {
  let r = '';
  ast.forEach((clauses: Clause[], key: string) => {
    let keyAndClauses = `${key} `;
    for (const c of clauses) {
      if (isString(c)) {
        keyAndClauses += `${c.trim()} `;
      } else if (c !== null) {
        keyAndClauses += `${ASTToSql(c)} `;
      }
    }
    // do not add the keys that do not have nodes
    if (keyAndClauses !== `${key} `) {
      r += keyAndClauses;
    }
  });
  // Remove all of the consecutive spaces to make things more readable when debugging
  return r.trim().replace(/\s+/g, ' ');
}

export function applyFiltersToAST(ast: AST, whereClause: string, targetTable: string): AST {
  if (!ast || !ast.get('FROM')) {
    return ast;
  }

  if (!targetTable) {
    return ast;
  }

  for (const clause of ast.get('FROM')!) {
    if (isString(clause)) {
      const tableRE = RegExp(`\\b${targetTable}\\b`, 'g');
      if (!clause.match(tableRE)) {
        continue;
      }
      const where = ast.get('WHERE');
      // If there is no defined WHERE clause create one
      // Else add an ad hoc filter to the existing WHERE clause
      if (where?.length === 0) {
        // set WHERE clause to ad hoc filter and add the remaining part of the FROM clause to the new WHERE clause
        // example: "(SELECT * FROM table) as r" will have a FROM clause of "table) as r". We need ") as r" to be after the new WHERE clause

        // first we get the remaining part of the FROM phrase. ") as r"
        const fromPhrase = ast.get('FROM');
        const fromPhraseAfterTableName = fromPhrase!
          [fromPhrase!.length - 1]!.toString()
          .trim()
          .substring(targetTable.length);
        // apply the remaining part of the FROM phrase to the end of the new WHERE clause
        ast.set('WHERE', [`${whereClause} ${fromPhraseAfterTableName}`]);
        // set the FROM clause to only have the table name
        const index = ast.get('FROM')!.indexOf(clause);
        ast.get('FROM')![index] = ` ${targetTable} `;
        continue;
      }
      where!.unshift(`${whereClause} AND `);
    }
  }

  // Each node in the AST needs to be checked to see if ad hoc filters should be applied
  ast.forEach((clauses: Clause[]) => {
    for (const c of clauses) {
      if (c !== null && !isString(c)) {
        applyFiltersToAST(c, whereClause, targetTable);
      }
    }
  });

  return ast;
}

function getASTBranches(sql: string): Clause[] {
  const clauses: Clause[] = [];
  const re = /\b(AND|OR|,)\b/gi;
  const bracket = { count: 0, lastCount: 0, phrase: '' };
  let regExpArray: RegExpExecArray | null;
  let index = -1;
  let lastPhraseIndex = 0;

  while ((regExpArray = re.exec(sql)) !== null) {
    const foundSplitter = regExpArray[0].toUpperCase();
    const phrase = sql.substring(lastPhraseIndex, regExpArray.index);
    lastPhraseIndex = re.lastIndex;

    // If there is a greater number of open brackets than closed,
    // add the phrase to the bracket phrase. The complete bracket phrase will be used to create a new AST branch
    if (bracket.count > 0) {
      bracket.phrase += phrase + foundSplitter;
    } else {
      clauses.push(phrase + foundSplitter);
      index++;
      bracket.phrase = phrase + foundSplitter;
    }
    bracket.count += (phrase.match(/\(/g) || []).length;
    bracket.count -= (phrase.match(/\)/g) || []).length;
    if (bracket.count <= 0 && bracket.lastCount > 0) {
      completePhrase(clauses, bracket.phrase, index);
    }
    bracket.lastCount = bracket.count;
  }

  // add the phrase after the last splitter
  const phrase = sql.substring(lastPhraseIndex, sql.length);
  if (bracket.count > 0) {
    bracket.phrase += phrase;
  } else {
    bracket.phrase = phrase;
    index++;
  }
  completePhrase(clauses, bracket.phrase, index);
  return clauses;
}

function completePhrase(clauses: Clause[], bracketPhrase: string, index: number) {
  // The phrase is complete
  // If it contains the keyword SELECT, build the AST for the phrase
  // If it does not, make a leaf node
  if (bracketPhrase.match(/\bSELECT\b/gi)) {
    clauses[index] = sqlToAST(bracketPhrase);
  } else {
    clauses[index] = bracketPhrase;
  }
}

// Creates a statement with all the keywords to preserve the keyword order
function createStatement(): AST {
  const clauses = new Map<string, Clause[]>();
  clauses.set('', []);
  clauses.set('WITH', []);
  clauses.set('SELECT', []);
  clauses.set('DISTINCT', []);
  clauses.set('FROM', []);
  clauses.set('SAMPLE', []);
  clauses.set('JOIN', []);
  clauses.set('PREWHERE', []);
  clauses.set('WHERE', []);
  clauses.set('GROUP BY', []);
  clauses.set('LIMIT BY', []);
  clauses.set('HAVING', []);
  clauses.set('LIMIT', []);
  clauses.set('OFFSET', []);
  clauses.set('UNION', []);
  clauses.set('INTERSECT', []);
  clauses.set('EXCEPT', []);
  clauses.set('INTO OUTFILE', []);
  clauses.set('FORMAT', []);
  return clauses as AST;
}
