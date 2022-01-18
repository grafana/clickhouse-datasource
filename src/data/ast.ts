export type Clause = string | Map<string, Clause> | null;

export default function sqlToAST(sql: string): Map<string, Clause> {
  const ast = createStatement();
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
        ast.set(lastNode, sqlToAST(bracketPhrase));
      } else {
        const p = (ast.get(lastNode) as string).concat(bracketPhrase);
        ast.set(lastNode, p);
      }
    }
    lastBracketCount = bracketCount;
  }
  return ast;
}

export function clausesToSql(ast: Map<string, Clause>): string {
  let r = '';
  ast.forEach((c: Clause, key: string) => {
    if (typeof c === 'string') {
      r += `${key} ${c.trim()} `;
    } else if (c !== null) {
      r += `${key} (${clausesToSql(c)} `;
    }
  });
  // Remove all of the consecutive spaces to make things more readable when debugging
  return r.trim().replace(/\s+/g, ' ');
}

// Creates a statement with all the keywords to preserve the keyword order
function createStatement() {
  const clauses = new Map<string, Clause>();
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