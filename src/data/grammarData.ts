import { AST, Clause } from "./ast";

/*export interface SelectStatements {
  selectStatement: SelectStatement[];
}
export interface SelectStatement extends IAST, IASTArray {
  identifier: Identifier;
}

export interface Function extends IAST, IASTArray {
  name: string;
}

export interface IASTArray extends IAST {
  childCount: number;
  items: IAST[];
}

export interface Identifier extends IAST {
  name: string;
  alias?: string;
}

export interface Literal extends IAST {
  value: string;
}


export interface TableIdentifier extends IAST {
  name: string;
  alias?: string;
}

export interface TableOperation extends TableElement, IAST {
}

export interface TableElement {
}

export interface IAST {
  kw: string;
}*/

export function grammarToAST(statement: SelectStatement): AST {
  const ast = new Map<string, Clause[]>();
  ast.set('SELECT', getExpressionList(getSelectQueryItem(statement, 'ExpressionList') as ExpressionList));
  ast.set('FROM', getFrom(getSelectQueryItem(statement, 'TablesInSelectQuery') as TablesInSelectQuery));
  ast.set('WHERE', getFunction(getSelectQueryItem(statement, 'Function') as Function));
  return ast;
}

function getSelectQueryItem(statement: SelectStatement, kw: string): IAST {
  for (const i of statement.items) {
    if (i.kw === kw) {
      return i;
    }
  }
  return {} as IAST;
}

function getExpressionList(expressionList: ExpressionList): Clause[] {
  if (!expressionList) {
    return [];
  }
  let clauses = [] as Clause[];
  for (const i of expressionList.items) {
    switch (i.kw) {
      case 'Identifier':
        const identifier = (i as Identifier);
        clauses.push(identifier.name + (identifier.alias ? ` as ${identifier.alias}` : ''));
        break;
      case 'Literal':
        clauses.push(getLiteral(i as Literal));
        break;
      case 'Function':
        clauses = clauses.concat(getFunction(i as Function));
        break;
      case 'Asterisk':
        clauses.push('*');
        break;
      default:
        throw new Error('NOT HANDLED EXPRESSION LIST KEYWORD - ' + i.kw);
    }
    clauses.push(',');
  }
  //remove last , added
  clauses.pop();
  return clauses;
}

function getLiteral(literal: Literal): Clause {
  if (literal.val.startsWith('UInt64_')) {
    return literal.val.substring(7, literal.val.length);
  }
  // need to support signed number, float, uint8, uint16, compound (so like [1, 2] or (1, 'hello'), null, heredoc (like $heredoc$)
  return literal.val;
}

function getFrom(tablesInSelectQuery: TablesInSelectQuery): Clause[] {
  if (!tablesInSelectQuery) {
    return [];
  }
  let clauses = [] as Clause[];
  for (const i of tablesInSelectQuery.items) {
    if (i.kw !== 'TablesInSelectQueryElement') {
      throw new Error('NOT AN IDENTIFIER - ' + i.kw);
    }
    clauses = clauses.concat(getTablesInSelectQueryElement(i));
  }
  return clauses;
}

function getFunction(func: Function): Clause[] {
  if (!func || !func.items) {
    return [];
  }
  let clauses = [] as Clause[];
  clauses.push(func.name);
  clauses.push('(');
  for (const i of func.items) {
    if (i.kw !== 'ExpressionList') {
      throw new Error('NOT AN IDENTIFIER - ' + i.kw);
    }
    clauses = clauses.concat(getExpressionList(i));
  }
  clauses.push(')');

  return clauses;
}

function getTablesInSelectQueryElement(tablesInSelectQueryElement: TablesInSelectQueryElement): Clause[] {
  let clauses = [] as Clause[];
  for (const i of tablesInSelectQueryElement.items) {
    if (i.kw === 'TableJoin') {
      //im not sure if we need to do something here. i think we will just be adding a comma
    }
    if (i.kw === 'TableExpression') {
      clauses = clauses.concat(getTableExpression(i as TableExpression));
    }
  }
  return clauses;
}

function getTableExpression(tableExpression: TableExpression): Clause[] {
  let clauses = [] as Clause[];
  for (const i of tableExpression.items) {
    if (i.kw !== 'TableIdentifier') {
      throw new Error('NOT AN IDENTIFIER - ' + i.kw);
    }
    const identifier = (i as TableIdentifier);
    clauses = clauses.concat(identifier.name + (identifier.alias ? ` as ${identifier.alias}` : ''));
  }
  return clauses;
}

export interface SelectStatement {
  kw: string;
  childCount: number;
  items: (HasChildren & IAST)[];
  identifier: TableIdentifier;
}
export interface TablesInSelectQuery extends IAST, HasChildren {
  items: TablesInSelectQueryElement[];
}

export interface Function extends IAST, HasChildren {
  name: string;
  items: ExpressionList[];
}

export interface ExpressionList extends IAST, HasChildren {
  items: IAST[];
}

export interface Identifier extends IAST {
  name: string;
  alias?: string;
}

export interface TableIdentifier extends IAST {
  name: string;
  alias?: string;
}

export interface Literal extends IAST {
  val: string;
}

export interface Asterisk extends IAST {
}

export interface TablesInSelectQueryElement extends HasChildren, IAST {
  items: TableElement[];
}

export interface TableExpression extends TableElement, HasChildren, IAST {
  items: TableIdentifier[];
}

export interface TableIdentifier extends IAST {
  name: string;
  alias?: string;
}

export interface TableOperation extends TableElement, IAST {
}

export interface TableElement extends IAST {
}

export interface IAST {
  kw: string;
}

export interface HasChildren {
  childCount: number;
}