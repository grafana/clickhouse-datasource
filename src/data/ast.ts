import { isString } from 'lodash';
import build from './grammar';

export type Clause = string | AST | null;
export type AST = Map<string, Clause[]>;

export default function sqlToAST(sql: string): AST {

  const ast = build(sql);

  return ast;
}

export function astToSql(ast: AST): string {
  let r = '';
  ast.forEach((clauses: Clause[], key: string) => {
    let keyAndClauses = `${key} `;
    for (const c of clauses) {
      if (isString(c)) {
        keyAndClauses += `${c.trim()} `;
      } else if (c !== null) {
        keyAndClauses += `${astToSql(c)} `;
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

        // if the fromPhraseAfterTheTableName is not the ending of a bracket statement, then don't add it
        if (!fromPhraseAfterTableName.includes(')')) {
          ast.set('WHERE', [whereClause]);
          continue;
        }
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

export function removeConditionalAllsFromAST(ast: AST, queryVarNames: string[]): AST {
  if (!ast || !ast.get('FROM')) {
    return ast;
  }

  const where = ast.get('WHERE');
  if (where) {
    for (let i = 0; i < where.length; i++) {
      const c = where[i];
      if (isString(c) && queryVarNames.some((v) => c.includes(v)) && c.includes('$')) {
        // remove AND/OR before this condition if this is the last condition
        if (i === where.length - 1) {
          where.splice(i - 1, 2);
        }
        // remove AND/OR after this condition
        if (where.length > 1) {
          where.splice(i, 2);
          i--;
        }
        // moves the ending of the phrase, like ')', to the next logical place
        movePhraseEnding(c, ast);
      }
    }
  }

  // Each node in the AST needs to be checked to see if it contains a conditional all template variable
  ast.forEach((clauses: Clause[]) => {
    for (const c of clauses) {
      if (c !== null && !isString(c)) {
        removeConditionalAllsFromAST(c, queryVarNames);
      }
    }
  });

  return ast;
}

function movePhraseEnding(c: string, ast: AST) {
  let count = (c.match(/\)/g) || []).length - (c.match(/\(/g) || []).length;
  if (count <= 0) {
    return;
  }
  const re = /\)/g;
  const indices: number[] = [];
  // get all indices of ')'
  while (re.exec(c) !== null) {
    indices.push(re.lastIndex);
  }
  // get the first ')' that does not have a beginning bracket in this phrase
  const firstUnmatchedBracketIndex = indices[indices.length - count] - 1;
  const phraseEnding = c.substring(firstUnmatchedBracketIndex, c.length);
  // these are the logical places in priority to move the phrase ending
  if (ast.get('PREWHERE')?.length !== 0) {
    ast.get('PREWHERE')?.push(phraseEnding);
  } else if (ast.get('JOIN')?.length !== 0) {
    ast.get('JOIN')?.push(phraseEnding);
  } else if (ast.get('SAMPLE')?.length !== 0) {
    ast.get('SAMPLE')?.push(phraseEnding);
  } else if (ast.get('FROM')?.length !== 0) {
    ast.get('FROM')?.push(phraseEnding);
  }
}

// function getASTBranches(sql: string): Clause[] {
//   const clauses: Clause[] = [];
//   const re = /(\bAND\b|\bOR\b|,)/gi;
//   const bracket = { count: 0, lastCount: 0, phrase: '' };
//   let regExpArray: RegExpExecArray | null;
//   let lastPhraseIndex = 0;

//   while ((regExpArray = re.exec(sql)) !== null) {
//     const foundSplitter = regExpArray[0].toUpperCase();
//     const phrase = sql.substring(lastPhraseIndex, regExpArray.index);
//     lastPhraseIndex = re.lastIndex;

//     bracket.count += (phrase.match(/\(/g) || []).length;
//     bracket.count -= (phrase.match(/\)/g) || []).length;
//     // If there is a greater number of open brackets than closed,
//     // add the phrase to the bracket phrase. The complete bracket phrase will be used to create a new AST branch
//     if (bracket.count > 0) {
//       bracket.phrase += phrase + foundSplitter;
//     } else if (bracket.lastCount <= 0) {
//       completePhrase(clauses, phrase);
//       clauses.push(foundSplitter);
//     }
//     if (bracket.count <= 0 && bracket.lastCount > 0) {
//       bracket.phrase += phrase;
//       completePhrase(clauses, bracket.phrase);
//       clauses.push(foundSplitter);
//       bracket.phrase = '';
//     }
//     bracket.lastCount = bracket.count;
//   }

//   // add the phrase after the last splitter
//   const phrase = sql.substring(lastPhraseIndex, sql.length);
//   if (bracket.count > 0) {
//     bracket.phrase += phrase;
//   } else {
//     bracket.phrase = phrase;
//   }
//   completePhrase(clauses, bracket.phrase);
//   return clauses;
// }

// function completePhrase(clauses: Clause[], bracketPhrase: string) {
//   // The phrase is complete
//   // If it contains the keyword SELECT, build the AST for the phrase
//   // If it does not, make a leaf node
//   if (bracketPhrase.match(/\bSELECT\b/gi)) {
//     clauses.push(sqlToAST(bracketPhrase));
//   } else {
//     clauses.push(bracketPhrase);
//   }
// }

// // Creates a statement with all the keywords to preserve the keyword order
// function createStatement(): AST {
//   const clauses = new Map<string, Clause[]>();
//   clauses.set('', []);
//   clauses.set('WITH', []);
//   clauses.set('SELECT', []);
//   clauses.set('FROM', []);
//   clauses.set('SAMPLE', []);
//   clauses.set('JOIN', []);
//   clauses.set('PREWHERE', []);
//   clauses.set('WHERE', []);
//   clauses.set('GROUP BY', []);
//   clauses.set('LIMIT BY', []);
//   clauses.set('HAVING', []);
//   clauses.set('ORDER BY', []);
//   clauses.set('LIMIT', []);
//   clauses.set('OFFSET', []);
//   clauses.set('UNION', []);
//   clauses.set('INTERSECT', []);
//   clauses.set('EXCEPT', []);
//   clauses.set('INTO OUTFILE', []);
//   clauses.set('FORMAT', []);
//   return clauses as AST;
// }
