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

  // The token `index` places ahead of the read position (0 is the token peek()
  // returns), or undefined past the end.
  public peekAt(index: number): Token | undefined {
    return this.tokens[this.offset + index];
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
  // The ON condition of a JOIN.
  On,
  // The USING columns of a JOIN.
  Using,
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
  // The subquery this FROM reads from, e.g. `FROM (SELECT ...)`. Set only for
  // the subquery that directly follows this FROM, so table resolution can
  // descend into it and nothing else.
  subquery?: SelectQueryNode;
  // The alias that follows the table, as in `FROM otel_logs AS l` or `JOIN otel_traces t`.
  alias?: string;
  // True for the JOIN of an ARRAY JOIN, whose target is an array column (e.g.
  // `ARRAY JOIN Events AS e`), not a table.
  arrayJoin?: boolean;
}

export interface IdentifierQueryNode extends QueryNode {
  prefix?: string;
}

export interface SelectQueryNode extends QueryNode {
  from?: FromQueryNode;
  // CTE bodies defined in this level's WITH clause, keyed by alias, so a FROM
  // that references a CTE can resolve to the CTE's underlying table.
  withAliases?: Map<string, SelectQueryNode>;
  // True when a top-level set operation (UNION / INTERSECT / EXCEPT) combines
  // several selects; a single-table target is not meaningful for the whole
  // statement then.
  hasSetOperation?: boolean;
  // The selects that such a set operation combines, in order. Unset without one.
  branches?: SelectBranch[];
}

// One of the selects that a top-level set operation combines.
export interface SelectBranch {
  // Where the select begins: at the first token for the first one, else at the
  // end of the set operator before it.
  begin: number;
  // Its SELECT, once typed.
  token?: Token;
  // Its outer FROM.
  from?: FromQueryNode;
}

// Clause keywords that an unqualified FROM target never takes as the table name.
// Without this guard `SELECT * FROM  WHERE ...` would take `WHERE` as the table
// while the user is mid-edit, and no clause node would be created. FORMAT and
// PREWHERE are left out so that `FROM format` and `FROM prewhere` resolve. The
// parser has no clause branch for either, so no clause node is lost; a mid-edit
// `FROM  PREWHERE x` takes the keyword as the table, and `FROM format(...)`
// reads as a table function, like `numbers(...)`.
const RESERVED_FROM_KEYWORDS = new Set(['WHERE', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'SETTINGS', 'JOIN', 'UNION']);

// A table/database name in a FROM clause. Keywords are accepted here because
// ClickHouse allows keyword-named tables (e.g. `default.values`, `sample`).
// Only the first (unqualified) segment refuses the reserved keywords above, to
// keep `FROM  WHERE ...` from taking WHERE as the table mid-edit. A segment
// after a dot can never start a clause, so `db.<keyword>` (e.g. `default.order`)
// resolves; an unqualified table named after a reserved keyword needs backtick
// quoting.
function isTableNameToken(token: Token, allowReserved: boolean): boolean {
  if (token.type === TokenType.QuotedIdentifier) {
    return true;
  }
  if (token.type !== TokenType.BareWord) {
    return false;
  }
  return allowReserved || !RESERVED_FROM_KEYWORDS.has(token.text.toUpperCase());
}

// Whether `token` is a set operator. UNION, INTERSECT and EXCEPT are also valid
// column names, and EXCEPT is a column modifier too
// (`SELECT * EXCEPT (secret) FROM t`), so each counts only when what follows
// starts another select: SELECT, WITH, ALL / DISTINCT, or `(` and then SELECT or
// WITH.
function isSetOperator(token: Token | undefined, next: Token | undefined, afterNext: Token | undefined): boolean {
  if (!['UNION', 'INTERSECT', 'EXCEPT'].some((keyword) => token?.matchKeyword(keyword))) {
    return false;
  }
  if (next?.type === TokenType.OpeningRoundBracket) {
    return Boolean(afterNext?.matchKeyword('SELECT') || afterNext?.matchKeyword('WITH'));
  }
  return ['SELECT', 'WITH', 'ALL', 'DISTINCT'].some((keyword) => next?.matchKeyword(keyword));
}

// A Grafana variable used as (part of) a FROM target, e.g. `${table}`. A
// variable has no internal whitespace, so tokens are consumed only while
// adjacent (no gap) to what we have so far. That reconstructs `${db.table:csv}`
// exactly, keeps a keyword variable name like `${table}`, and stops an
// unterminated `${` at the next whitespace or bracket, e.g. leaving the rest of
// `FROM ${table WHERE ...` or `FROM (SELECT * FROM ${t) ...` to parse.
function readVariableSegment(parser: QueryNodeParser): string {
  const dollar = parser.next(); // '$'
  let text = dollar.text;
  let lastEnd = dollar.end;
  if (parser.hasNext() && parser.peek().type === TokenType.OpeningCurlyBrace && parser.peek().begin === lastEnd) {
    const brace = parser.next();
    text += brace.text;
    lastEnd = brace.end;
    while (parser.hasNext()) {
      const t = parser.peek();
      if (
        t.begin !== lastEnd ||
        t.type === TokenType.OpeningRoundBracket ||
        t.type === TokenType.ClosingRoundBracket ||
        t.type === TokenType.Semicolon
      ) {
        break; // whitespace gap or structural token: variable ended (or unterminated)
      }
      parser.next();
      text += t.text;
      lastEnd = t.end;
      if (t.type === TokenType.ClosingCurlyBrace) {
        break;
      }
    }
  }
  return text;
}

// One dot-separated segment of a FROM target: a Grafana variable or an
// identifier. Returns undefined when the next token cannot start a name.
function readNameSegment(parser: QueryNodeParser, allowReserved: boolean): string | undefined {
  if (!parser.hasNext()) {
    return undefined;
  }
  if (parser.peek().type === TokenType.DollarSign) {
    return readVariableSegment(parser);
  }
  if (isTableNameToken(parser.peek(), allowReserved)) {
    return parser.next().text;
  }
  return undefined;
}

// The alias after a FROM or JOIN table (`otel_logs AS l` or `otel_logs l`), read
// without consuming it. A set operator right after the table
// (`FROM t EXCEPT SELECT ...`) is not an alias.
function peekTableAlias(parser: QueryNodeParser): string | undefined {
  let alias = parser.peekAt(0);
  if (alias?.matchKeyword('AS')) {
    alias = parser.peekAt(1);
  } else if (isSetOperator(alias, parser.peekAt(1), parser.peekAt(2))) {
    return undefined;
  }
  if (alias?.type === TokenType.QuotedIdentifier || (alias?.type === TokenType.BareWord && !alias.isKeyword())) {
    return alias.text;
  }
  return undefined;
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
  let fromAwaitingSubquery: FromQueryNode | undefined;
  // The two previous significant tokens, used to spot a `<name> AS (` CTE
  // definition when its subquery opens.
  let prev1: Token | undefined;
  let prev2: Token | undefined;
  // The select after the last top-level set operator, once there is one.
  let branch: SelectBranch | undefined;
  let endOfNode = false;
  while (!endOfNode && parser.hasNext()) {
    const token = parser.next();

    // A top-level set operation combines several selects, so no single table is
    // the target. This only sets the flag and starts the next select; the token
    // is still parsed below like any other.
    if (parenDepth === 0 && isSetOperator(token, parser.peekAt(0), parser.peekAt(1))) {
      node.hasSetOperation = true;
      node.branches ??= [{ begin: firstToken.begin, token: node.token, from: node.from }];
      branch = { begin: token.end };
      node.branches.push(branch);
    }

    if (token.type === TokenType.Semicolon) {
      // Statement boundary: a query string may contain more than one statement,
      // but each SELECT node covers a single statement.
      endOfNode = true;
    } else if (token.matchKeyword('SELECT')) {
      node.token = token;
      if (branch) {
        branch.token ??= token;
      }
    } else if (token.matchKeyword('FROM') || token.matchKeyword('JOIN')) {
      const fromNode: FromQueryNode = { type: QueryNodeType.From, token, clause: ClauseType.From };
      if (token.matchKeyword('JOIN') && prev1?.matchKeyword('ARRAY')) {
        fromNode.arrayJoin = true;
      }
      node.children!.push(fromNode);
      // Only the outer-level FROM sets node.from. A FROM nested inside a
      // function call (e.g. `EXTRACT(part FROM col)`, `trim(BOTH ' ' FROM col)`)
      // is at parenDepth > 0 and must not shadow the real table.
      if (!node.from && parenDepth === 0) {
        node.from = fromNode;
      }
      if (branch && !branch.from && parenDepth === 0) {
        branch.from = fromNode;
      }

      if (parser.hasNext() && parser.peek().isError()) {
        fromNode.prefix = parser.peek().text;
      }

      const firstSegment = readNameSegment(parser, false);
      if (firstSegment !== undefined) {
        if (parser.hasNext() && parser.peek().type === TokenType.Dot) {
          parser.next();
          fromNode.database = firstSegment;

          if (parser.hasNext() && parser.peek().isError()) {
            fromNode.prefix = parser.peek().text;
          }

          const secondSegment = readNameSegment(parser, true);
          if (secondSegment !== undefined) {
            fromNode.table = secondSegment;
          }
        } else {
          fromNode.table = firstSegment;
        }

        // A table identifier immediately followed by `(` is a table function
        // (e.g. `merge(...)`), not a physical table that
        // `additional_table_filters` can key on.
        if (fromNode.table && parser.hasNext() && parser.peek().type === TokenType.OpeningRoundBracket) {
          fromNode.isTableFunction = true;
        } else if (fromNode.table) {
          const alias = peekTableAlias(parser);
          if (alias) {
            fromNode.alias = alias;
          }
        }
      } else if (parser.hasNext() && parser.peek().type === TokenType.OpeningRoundBracket) {
        // Subquery FROM, e.g. `FROM (SELECT ...)`. Link the subquery that the
        // next OpeningRoundBracket parses to this FROM node, so resolution can
        // descend into it and nothing else.
        fromAwaitingSubquery = fromNode;
      }
    } else if (token.type === TokenType.OpeningRoundBracket) {
      const nestedNode = parseSelectQueryNode(parser);
      if (nestedNode === null) {
        parenDepth++;
        fromAwaitingSubquery = undefined;
      } else {
        node.children!.push(nestedNode);
        if (fromAwaitingSubquery) {
          fromAwaitingSubquery.subquery = nestedNode;
          fromAwaitingSubquery = undefined;
        }
        // `<name> AS ( <subquery> )` is a CTE definition. Record it so a FROM
        // that references the CTE can resolve to its underlying table.
        if (
          prev1?.matchKeyword('AS') &&
          prev2 &&
          (prev2.type === TokenType.BareWord || prev2.type === TokenType.QuotedIdentifier)
        ) {
          (node.withAliases ??= new Map()).set(prev2.text, nestedNode);
        }
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
    } else if (token.matchKeyword('ON')) {
      node.children!.push({ type: QueryNodeType.Default, token, clause: ClauseType.On });
    } else if (token.matchKeyword('USING')) {
      node.children!.push({ type: QueryNodeType.Default, token, clause: ClauseType.Using });
    } else if (token.matchKeyword('UNION')) {
      node.children!.push({ type: QueryNodeType.Default, token, clause: ClauseType.None });
    } else if (token.type === TokenType.BareWord && !token.isKeyword()) {
      let fullIdent = token.text;
      let identToken = token;
      // A set operator ends the identifier: INTERSECT and EXCEPT are not in the
      // keyword set, so without the check `GROUP BY a INTERSECT SELECT ...`
      // would read `aINTERSECT` and the operator would never be seen.
      while (
        parser.hasNext() &&
        (parser.peekIs(TokenType.Dot) || (parser.peekIs(TokenType.BareWord) && !parser.peek().isKeyword())) &&
        !isSetOperator(parser.peek(), parser.peekAt(1), parser.peekAt(2))
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

    prev2 = prev1;
    prev1 = token;
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
