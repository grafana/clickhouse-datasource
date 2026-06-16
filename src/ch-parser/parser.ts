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
}

export interface IdentifierQueryNode extends QueryNode {
  prefix?: string;
}

export interface SelectQueryNode extends QueryNode {
  from?: FromQueryNode;
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

    if (token.matchKeyword('SELECT')) {
      node.token = token;
    } else if (token.matchKeyword('FROM') || token.matchKeyword('JOIN')) {
      const fromNode: FromQueryNode = { type: QueryNodeType.From, token, clause: ClauseType.From };
      node.children!.push(fromNode);
      if (!node.from) {
        node.from = fromNode;
      }

      if (parser.hasNext() && parser.peek().isError()) {
        fromNode.prefix = parser.peek().text;
      }

      if (
        parser.hasNext() &&
        ((parser.peek().type === TokenType.BareWord && !parser.peek().isKeyword()) ||
          parser.peek().type === TokenType.QuotedIdentifier)
      ) {
        const databaseOrTable = parser.next().text;
        if (parser.hasNext() && parser.peek().type === TokenType.Dot) {
          parser.next();
          fromNode.database = databaseOrTable;

          if (parser.hasNext() && parser.peek().isError()) {
            fromNode.prefix = parser.peek().text;
          }

          if (
            parser.hasNext() &&
            ((parser.peek().type === TokenType.BareWord && !parser.peek().isKeyword()) ||
              parser.peek().type === TokenType.QuotedIdentifier)
          ) {
            fromNode.table = parser.next().text;
          }
        } else {
          fromNode.table = databaseOrTable;
        }
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
