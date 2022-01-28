export type Clause = string | AST | null;
export type AST = Map<string, Clause[]>;

export default function sqlToAST(sql: string): AST {
  const ast = createStatement();
  const re =
    /\b(WITH|SELECT|DISTINCT|FROM|SAMPLE|JOIN|PREWHERE|WHERE|GROUP BY|LIMIT BY|HAVING|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT|INTO OUTFILE|FORMAT)\b/gi;
  let bracketCount = 0;
  let lastBracketCount = 0;
  let lastNode = '';
  let bracketPhrase = '';
  let regExpArray: RegExpExecArray | null;
  ast.set('', [sql.split(re, 2)[0]]);

  while ((regExpArray = re.exec(sql)) !== null) {
    // Sets foundNode to a SQL keyword from the regular expression
    const foundNode = regExpArray[0].toUpperCase();
    const phrase = sql.substring(re.lastIndex, sql.length).split(re, 2)[0];
    // If there is a greater number of open brackets than closed,
    // add the phrase to the bracket phrase. The complete bracket phrase will be used to create a new AST branch
    if (bracketCount > 0) {
      bracketPhrase += foundNode + phrase;
    } else {
      ast.set(foundNode, [phrase]);
      lastNode = foundNode;
      bracketPhrase = phrase;
    }
    bracketCount += (phrase.match(/\(/g) || []).length;
    bracketCount -= (phrase.match(/\)/g) || []).length;
    if (bracketCount <= 0 && lastBracketCount > 0) {
      // The phrase is complete
      // If it contains the keyword SELECT, make new branches
      // If it does not, make a leaf node
      if (bracketPhrase.match(/\bSELECT\b/gi)) {
        ast.set(lastNode, getASTBranches(bracketPhrase));
      } else {
        ast.set(lastNode, [bracketPhrase]);
      }
    }
    lastBracketCount = bracketCount;
  }
  return ast;
}

export function ASTToSql(ast: AST): string {
  let r = '';
  ast.forEach((clauses: Clause[], key: string) => {
    let bc = `${key} `
    for (let c of clauses) {
      if (typeof c === 'string') {
        bc += `${c.trim()} `;
      } else if (c !== null) {
        bc += `${ASTToSql(c)} `;
      }
    }
    if (bc !== `${key} `)
      r += bc;
  });
  // Remove all of the consecutive spaces to make things more readable when debugging
  return r.trim().replace(/\s+/g, ' ');
}

function getASTBranches(sql: string): Clause[] {
  const clauses: Clause[] = [];
  const re = /\b(AND|OR|,)\b/gi;
  let bracketCount = 0;
  let lastBracketCount = 0;
  let bracketPhrase = '';
  let regExpArray: RegExpExecArray | null;
  let index = -1;
  let lastPhraseIndex = 0;

  while ((regExpArray = re.exec(sql)) !== null) {
    const foundSplitter = regExpArray[0].toUpperCase();
    const phrase = sql.substring(lastPhraseIndex, regExpArray.index);
    lastPhraseIndex = re.lastIndex;

    // If there is a greater number of open brackets than closed,
    // add the phrase to the bracket phrase. The complete bracket phrase will be used to create a new AST branch
    if (bracketCount > 0) {
      bracketPhrase += phrase + foundSplitter;
    } else {
      clauses.push(phrase + foundSplitter);
      index++;
      bracketPhrase = phrase + foundSplitter;
    }
    bracketCount += (phrase.match(/\(/g) || []).length;
    bracketCount -= (phrase.match(/\)/g) || []).length;
    if (bracketCount <= 0 && lastBracketCount > 0) {
      completePhrase(clauses, bracketPhrase, index);
    }
    lastBracketCount = bracketCount;
  }

  // add the phrase after the last splitter
  const phrase = sql.substring(lastPhraseIndex, sql.length);
  if (bracketCount > 0) {
    bracketPhrase += phrase;
  } else {
    bracketPhrase = phrase;
    index++;
  }
  completePhrase(clauses, bracketPhrase, index);
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