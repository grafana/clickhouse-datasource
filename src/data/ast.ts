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
    // add the the bracket phrase that will eventually be added the the last node
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
      // The phrase brackets is complete
      // If it is a FROM phrase lets make a branch node
      // If it is anything else lets make a leaf node
      
      const testRE = /\b(AND|OR|,)\b/gi;
      if (bracketPhrase.match(/\bSELECT\b/gi)) {
          ast.set(lastNode, listSplitAST(testRE, bracketPhrase));
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
        r+=bc;
  });
  // Remove all of the consecutive spaces to make things more readable when debugging
  return r.trim().replace(/\s+/g, ' ');
}

function listSplitAST(re: RegExp, sql: string): Clause[] {
  let clasues: Clause[] = [];
  let bracketCount = 0;
  let lastBracketCount = 0;
  let bracketPhrase = '';
  let regExpArray: RegExpExecArray | null;
  let index = 0;
  let lastStart = 0;
  while ((regExpArray = re.exec(sql)) !== null) {
      // Sets foundNode to a SQL keyword from the regular expression
      const foundNode = regExpArray[0].toUpperCase();
      const phrase = sql.substring(lastStart, regExpArray.index);
      lastStart = re.lastIndex;
      // If there is a greater number of open brackets than closed,
      // add the the bracket phrase that will eventually be added the the last node
      if (bracketCount > 0) {
          bracketPhrase += phrase + foundNode;
      } else {
          clasues.push(phrase + foundNode);
          index++;
          bracketPhrase = phrase + foundNode;
      }
      bracketCount += (phrase.match(/\(/g) || []).length;
      bracketCount -= (phrase.match(/\)/g) || []).length;
      if (bracketCount <= 0 && lastBracketCount > 0) {
          // The phrase brackets is complete
          // If it is a FROM phrase lets make a branch node
          // If it is anything else lets make a leaf node
          
          if (bracketPhrase.match(/\bSELECT\b/gi)) {
              clasues[index-1] = sqlToAST(bracketPhrase);
          } else {
              clasues[index-1] = bracketPhrase;
          }
      }
      lastBracketCount = bracketCount;
  }

  const phrase = sql.substring(lastStart, sql.length);
          console.log(bracketCount + ' ' + lastBracketCount + phrase);
  if (bracketCount > 0) {
          bracketPhrase += phrase;
      } else {
          bracketPhrase = phrase;
          index++;
      }
      console.log(bracketCount + ' ' + lastBracketCount + bracketPhrase);
      if (bracketPhrase.match(/\bSELECT\b/gi)) {
          clasues[index-1] = sqlToAST(bracketPhrase);
      } else {
          clasues[index-1] = bracketPhrase;
      }
  return clasues;
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