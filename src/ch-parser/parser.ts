import { Lexer } from './lexer';
import { Token, TokenType } from './types';

export class QueryNodeParser {
  private tokens: Token[];
  private offset: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.offset = 0;
  }

  public advance() {
    this.offset++;
  }

  public hasNext(): boolean {
    return this.offset < this.tokens.length;
  }

  public next(): Token {
    const token = this.tokens[this.offset];
    this.advance();

    return token;
  }

  public peek(): Token {
    return this.tokens[this.offset];
  }

  public nextIs(type: TokenType): boolean {
    const next = this.peek();
    if (next.type === type) {
      this.advance();
      return true;
    }

    return false;
  }

  public peekIs(type: TokenType): boolean {
    return this.peek().type === type;
  }
}

export enum ClauseType {
  None,
  With,
  Select,
  From,
  Join,
  Where,
  GroupBy,
  Having,
  OrderBy,
  Limit,
  Identifier,
}

export enum QueryNodeType {
  Default,
  Select,
  From,
  Identifier,
}

export interface QueryNode {
  type: QueryNodeType;
  token: Token;
  clause: ClauseType;
  children?: QueryNode[];
}

export interface FromQueryNode extends QueryNode {
  token: Token;
  database?: string;
  table?: string;
  prefix?: string;
  // True when the FROM target is a table function (e.g. `merge(...)`), which is
  // not a physical table.
  isTableFunction?: boolean;
}

export interface IdentifierQueryNode extends QueryNode {
  prefix?: string;
}

export interface SelectQueryNode extends QueryNode {
  from?: FromQueryNode;
}

// A table/database name in a FROM clause. Unlike the general identifier
// positions, keywords are accepted here because ClickHouse allows keyword-named
// tables (e.g. `default.values`, `sample`).
function isTableNameToken(token: Token): boolean {
  return token.type === TokenType.BareWord || token.type === TokenType.QuotedIdentifier;
}

export function parseSelectQueryNode(parser: QueryNodeParser): SelectQueryNode | null {
  if (!parser.hasNext()) {
    return null;
  }

  const firstToken = parser.peek();
  const node: SelectQueryNode = {
    type: QueryNodeType.Select,
    clause: ClauseType.Select,
    children: [],
    token: null!,
  };

  if (firstToken.matchKeyword('WITH')) {
    node.children!.push({ type: QueryNodeType.Default, token: firstToken, clause: ClauseType.With });
  } else if (firstToken.matchKeyword('SELECT')) {
    node.token = firstToken;
  } else {
    return null;
  }
  parser.advance();

  let parenDepth = 0;
  let endOfNode = false;
  while (!endOfNode && parser.hasNext()) {
    const token = parser.next();

    if (token.type === TokenType.Semicolon) {
      // Statement boundary: a query string may contain more than one statement,
      // but each SELECT node covers a single statement.
      endOfNode = true;
    } else if (token.matchKeyword('SELECT')) {
      node.token = token;
    } else if (token.matchKeyword('FROM') || token.matchKeyword('JOIN')) {
      const fromNode: FromQueryNode = { type: QueryNodeType.From, token, clause: ClauseType.From };
      node.children!.push(fromNode);
      // Only the outer-level FROM sets node.from. A FROM nested inside a
      // function call (e.g. `EXTRACT(part FROM col)`, `trim(BOTH ' ' FROM col)`)
      // is at parenDepth > 0 and must not shadow the real table.
      if (!node.from && parenDepth === 0) {
        node.from = fromNode;
      }

      if (parser.hasNext() && parser.peek().isError()) {
        fromNode.prefix = parser.peek().text;
      }

      if (parser.hasNext() && parser.peek().type === TokenType.DollarSign) {
        // Grafana variable in the FROM position, e.g. `FROM ${table}`. A
        // variable has no internal whitespace, so concatenating token text from
        // `$` through the closing brace reconstructs it exactly.
        let variable = '';
        while (parser.hasNext()) {
          const part = parser.next();
          variable += part.text;
          if (part.type === TokenType.ClosingCurlyBrace) {
            break;
          }
        }
        fromNode.table = variable;
      } else if (parser.hasNext() && isTableNameToken(parser.peek())) {
        const databaseOrTable = parser.next().text;
        if (parser.hasNext() && parser.peek().type === TokenType.Dot) {
          parser.next();
          fromNode.database = databaseOrTable;

          if (parser.hasNext() && parser.peek().isError()) {
            fromNode.prefix = parser.peek().text;
          }

          if (parser.hasNext() && isTableNameToken(parser.peek())) {
            fromNode.table = parser.next().text;
          }
        } else {
          fromNode.table = databaseOrTable;
        }
      }

      // A table identifier immediately followed by `(` is a table function
      // (e.g. `merge(...)`), not a physical table that
      // `additional_table_filters` can key on.
      if (fromNode.table && parser.hasNext() && parser.peek().type === TokenType.OpeningRoundBracket) {
        fromNode.isTableFunction = true;
      }
    } else if (token.type === TokenType.OpeningRoundBracket) {
      const nestedNode = parseSelectQueryNode(parser);
      if (nestedNode === null) {
        parenDepth++;
      } else {
        node.children!.push(nestedNode);
      }
    } else if (token.type === TokenType.ClosingRoundBracket) {
      if (parenDepth === 0) {
        endOfNode = true;
      } else {
        parenDepth--;
      }
    } else if (token.matchKeyword('JOIN')) {
      node.children!.push({ type: QueryNodeType.Default, token, clause: ClauseType.Join });
    } else if (token.matchKeyword('GROUP') && parser.hasNext() && parser.peek().matchKeyword('BY')) {
      node.children!.push({ type: QueryNodeType.Default, token: parser.next(), clause: ClauseType.GroupBy });
    } else if (token.matchKeyword('WHERE')) {
      node.children!.push({ type: QueryNodeType.Default, token, clause: ClauseType.Where });
    } else if (token.matchKeyword('HAVING')) {
      node.children!.push({ type: QueryNodeType.Default, token, clause: ClauseType.Having });
    } else if (token.matchKeyword('ORDER') && parser.hasNext() && parser.peek().matchKeyword('BY')) {
      node.children!.push({ type: QueryNodeType.Default, token: parser.next(), clause: ClauseType.OrderBy });
    } else if (token.matchKeyword('LIMIT')) {
      node.children!.push({ type: QueryNodeType.Default, token, clause: ClauseType.Limit });
    } else if (token.type === TokenType.BareWord && !token.isKeyword()) {
      let fullIdent = token.text;
      let identToken = token;
      while (
        parser.hasNext() &&
        (parser.peekIs(TokenType.Dot) || (parser.peekIs(TokenType.BareWord) && !parser.peek().isKeyword()))
      ) {
        identToken = parser.next();
        fullIdent += identToken.text;
      }
      node.children!.push({
        type: QueryNodeType.Identifier,
        token: identToken,
        prefix: fullIdent,
        clause: ClauseType.Identifier,
      } as IdentifierQueryNode);
    } else if (token.type === TokenType.DollarSign) {
      node.children!.push({
        type: QueryNodeType.Identifier,
        token,
        prefix: '$',
        clause: ClauseType.Identifier,
      } as IdentifierQueryNode);
    } else {
      node.children!.push({ type: QueryNodeType.Default, token, clause: ClauseType.None });
    }
  }

  return node;
}

/**
 * Tokenizes `sql` with the ClickHouse lexer and parses it into a shallow
 * select-query node tree. Returns null when the input is not a SELECT (or
 * WITH ... SELECT) statement. Shared by SQL autocomplete and ad-hoc table
 * detection so the two paths cannot diverge.
 */
export function parseSelect(sql: string): SelectQueryNode | null {
  const lexer = new Lexer(sql);
  const tokens: Token[] = [];
  for (let token = lexer.nextToken(); !token.isEnd(); token = lexer.nextToken()) {
    if (token.isSignificant()) {
      tokens.push(token);
    }
  }
  return parseSelectQueryNode(new QueryNodeParser(tokens));
}
