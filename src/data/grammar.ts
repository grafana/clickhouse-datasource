import * as nearley from 'nearley';
import { AST } from './ast';
import { grammarToAST, SelectStatement, Function, Identifier, IAST } from './grammarData';
const grammar = require("./explainASTGrammar.js");

// There are multiple ways to interpret this grammar so we need to check which one is correct
// Clickhouse gives us the count of children it expects for each list so we will check every list
// until we find one that has the same amounts of elements as clickhouse says
function findTrueStatement(statements: IASTArray[]): IASTArray {
  for (let s of statements) {
    if (asdf(s)) {
      //found true AST
      return s;
    }
  }
  return {} as IASTArray;
}

interface IASTArray {
  kw: string;
  childCount: number;
  items: IASTArray[];
}
function asdf(a: IASTArray): boolean {
  if (!a?.childCount) {
    return true;
  }
  if (a.childCount !== a.items.length) {
    return false;
  }
  for (let i of a.items) {
    if (!asdf(i as IASTArray)) {
      return false;
    }
  }
  return true;
}

export default function build(explainAST: string): AST {
  return grammarToAST(explainASTToStatement(explainAST));
}

export function removeConditionalAllsFromAST(explainAST: string, queryVarNames: string[]): AST {
  const selectStatement = explainASTToStatement(explainAST);
  const selectItems = selectStatement.items;
  for (let i = 0; i < selectItems.length; i++) {
    if (selectItems[i].kw === 'Function') {
      const funItems = (selectItems[i] as Function).items;
      for (let j = 0; j < funItems.length; j++) {
        funItems[j].items = removeCon(funItems[j].items, queryVarNames);
        if (funItems[j].items.length === 0) {
          funItems.splice(j, 1);
          j--;
        }
      }
      if (funItems.length === 0) {
        selectItems.splice(i, 1);
      }
    }
  }
  console.log(selectStatement);
  return grammarToAST(selectStatement);
}

function explainASTToStatement(explainAST: string): SelectStatement {
  const parser = new nearley.Parser(nearley.Grammar.fromCompiled(grammar));
  const p = parser.feed(explainAST);
  const result = p.results;
  const possibles: IASTArray[] = Object.assign([] as IASTArray[], result);
  const actualStatement = findTrueStatement(possibles);

  if (actualStatement === {} as IASTArray) {
    throw Error('fix this');
  }
  console.log(actualStatement as unknown as SelectStatement);
  return actualStatement as unknown as SelectStatement;
}

function removeCon(iast: IAST[], queryVarNames: string[]): IAST[] {
  const r = [] as IAST[];
  for (let i of iast) {
    if (i.kw === 'Identifier') {
      const id = i as Identifier;
      if (queryVarNames.some((v) => v === id.name)) {
        continue;
      }
    }
    else if (i.kw === 'Function') {
      const fun = i as Function;
      for (let j of fun.items) {
        j.items = removeCon(j.items, queryVarNames);
      }
      continue;
    }
    r.concat(i);
  }
  return r;
}