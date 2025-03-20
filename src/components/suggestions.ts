import { getTemplateSrv } from '@grafana/runtime';
import { Monaco } from '@grafana/ui'
import { Range, SchemaKind, Suggestion } from './sqlProvider';
import { Lexer } from 'ch-parser/lexer';
import { Token, TokenType } from 'ch-parser/types';
import { TableColumn } from 'types/queryBuilder';

declare const monaco: Monaco;
export interface Schema {
  databases: () => Promise<string[]>;
  tables: (db?: string) => Promise<string[]>;
  columns: (db: string, table: string) => Promise<TableColumn[]>;
  defaultDatabase?: string;
}

async function fetchDatabaseSuggestions(schema: Schema, range: Range) {
  const databases = await schema.databases();
  return databases.map((val) => ({
    label: val,
    kind: monaco.languages.CompletionItemKind.Module,
    detail: 'Database',
    documentation: 'Database',
    insertText: val,
    range,
  }));
}

async function fetchTableSuggestions(schema: Schema, range: Range, database?: string) {
  const tables = await schema.tables(database);
  return tables.map((val) => ({
    label: val,
    kind: monaco.languages.CompletionItemKind.Class,
    detail: 'Table',
    documentation: 'Table',
    insertText: val,
    range,
  }));
}

async function fetchFieldSuggestions(schema: Schema, range: Range, db: string, table: string, prefix?: string) {
  console.log('field prefix:', prefix);
  const columns = await schema.columns(db, table);
  return columns.map(c => ({
    label: c.label!,
    kind: monaco.languages.CompletionItemKind.Field,
    detail: c.type,
    documentation: c.type,
    insertText: prefix && prefix.includes('.') ? c.name.substring(prefix?.length || 0) : c.name,
    range,
  })).filter(c => !prefix || c.label.startsWith(prefix));
}

export function getVariableSuggestions(range: Range) {
  const templateSrv = getTemplateSrv();
  if (!templateSrv) {
    return [];
  }
  return templateSrv.getVariables().map((variable) => {
    const label = `\${${variable.name}}`;
    const val = templateSrv.replace(label);
    return {
      label,
      detail: `(Template Variable) ${val}`,
      kind: SchemaKind.VARIABLE,
      documentation: `(Template Variable) ${val}`,
      insertText: `{${variable.name}}`,
      range,
    };
  });
}

const CLICKHOUSE_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT',
  'HAVING', 'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN',
  'FULL JOIN', 'ON', 'USING', 'PREWHERE', 'FINAL', 'SAMPLE'
];


/// NEW STUFF

class QueryNodeParser {
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

enum QueryNodeType {
  Default,
  Select,
  From,
  Identifier,
}

interface QueryNode {
  type: QueryNodeType;
  token: Token;
  clause: ClauseType;
  children?: QueryNode[];
}

interface FromQueryNode extends QueryNode {
  token: Token;
  database?: string;
  table?: string;
}

interface IdentifierQueryNode extends QueryNode {
  prefix?: string;
}

interface SelectQueryNode extends QueryNode {
  from?: FromQueryNode
}

function parseSelectQueryNode(parser: QueryNodeParser): SelectQueryNode | null {
  if (!parser.hasNext()) {
    return null;
  }

  const firstToken = parser.peek();
  const node: SelectQueryNode = {
    type: QueryNodeType.Select,
    clause: ClauseType.Select,
    children: [],
    token: null!
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
    } else if (token.matchKeyword('FROM')) {
      node.from = { type: QueryNodeType.From, token, clause: ClauseType.From };
      node.children!.push(node.from);

      if (parser.hasNext() && ((parser.peek().type === TokenType.BareWord && !parser.peek().isKeyword()) || parser.peek().type === TokenType.QuotedIdentifier)) {
        const databaseOrTable = parser.next().text;
        if (parser.hasNext() && parser.peek().type === TokenType.Dot) {
          parser.next()
          node.from.database = databaseOrTable;

          if (parser.hasNext() && ((parser.peek().type === TokenType.BareWord && !parser.peek().isKeyword()) || parser.peek().type === TokenType.QuotedIdentifier)) {
            node.from.table = parser.next().text;
          }
        } else {
          node.from.table = databaseOrTable
        }
      }
    } else if (token.type === TokenType.OpeningRoundBracket) {
      const nestedNode = parseSelectQueryNode(parser)
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
      while (parser.hasNext() && (parser.peekIs(TokenType.Dot) || (parser.peekIs(TokenType.BareWord) && !parser.peek().isKeyword()))) {
        identToken = parser.next();
        fullIdent += identToken.text;
      }
      node.children!.push({ type: QueryNodeType.Identifier, token: identToken, prefix: fullIdent, clause: ClauseType.NestedIdent } as IdentifierQueryNode);
    } else {
      node.children!.push({ type: QueryNodeType.Default, token, clause: ClauseType.None });
    }
  }

  return node;
}

enum ClauseType {
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
  NestedIdent,
}

interface CursorData {
  clause: ClauseType;
  identifiers: string[];
  database?: string;
  table?: string;
  prefix?: string;
}

function getTokenRangeForSelectQueryNode(root: SelectQueryNode, subquery: boolean): { begin: number, end: number } {
  let begin = root.token.begin;
  let end = root.token.end;

  if (root.children && root.children.length > 0) {
    const lastChild = root.children[root.children.length - 1];
    if (lastChild.type === QueryNodeType.Select) {
      const subqueryRange = getTokenRangeForSelectQueryNode(lastChild, true);
      end = subqueryRange.end;
    } else {
      end = lastChild.token.end;
    }
  }

  if (subquery) {
    return { begin: begin - 1, end: end + 1 }; 
  }

  return { begin, end }; 
}

function getCursorInSelectQueryNode(root: SelectQueryNode, cursorPosition: number): CursorData {
  const cursorData: CursorData = {
    clause: ClauseType.None,
    identifiers: [],
  };

  if (cursorPosition > root.token.end) {
    cursorData.clause = ClauseType.Select;
  }

  if (root.from) {
    cursorData.database = root.from.database;
    cursorData.table = root.from.table;
  }

  if (!root.children) {
    return cursorData;
  }

  for (const node of root.children) {
    switch (node.type) {
      case QueryNodeType.Select:
        const selectNode = node as SelectQueryNode;
        const nestedCursorData = getCursorInSelectQueryNode(selectNode, cursorPosition);
        const tokenRange = getTokenRangeForSelectQueryNode(selectNode, true);
        if (cursorPosition >= tokenRange.begin && cursorPosition <= tokenRange.end) {
          return nestedCursorData;
        }

        break;
      default:
        if (node.token.type === TokenType.QuotedIdentifier || node.type === QueryNodeType.Identifier || (node.token.type === TokenType.BareWord && !node.token.isKeyword())) {
          if (node.type === QueryNodeType.Identifier) {
            cursorData.identifiers.push((node as IdentifierQueryNode).prefix || node.token.text);
          } else {
            cursorData.identifiers.push(node.token.text);
          }
        }

        if (node.type === QueryNodeType.Identifier && cursorPosition === node.token.end) {
          cursorData.prefix = (node as IdentifierQueryNode).prefix;
        }

        if (cursorPosition < node.token.begin) {
          break;
        } else if (cursorPosition > node.token.end && node.clause !== ClauseType.None) {
          cursorData.clause = node.clause;
        }
    }
  }

  return cursorData;
}

export async function getSuggestions(text: string, schema: Schema, range: Range, cursorPosition: number): Promise<Suggestion[]> {
  const lexer = new Lexer(text);
  const tokens = [];
  while (true) {
    const token = lexer.nextToken();
    if (token.isEnd() || token.isError()) {
      break;
    }

    if (!token.isSignificant()) {
      continue;
    }

    tokens.push(token);
  }

  const parser = new QueryNodeParser(tokens);
  const selectNode = parseSelectQueryNode(parser);
  console.log(selectNode);

  if (!selectNode) {
    return [];
  }

  const cursorData = getCursorInSelectQueryNode(selectNode, cursorPosition);

  console.log('database:', cursorData.database, 'table:', cursorData.table, 'identifiers:', cursorData.identifiers);

  return await getSuggestionsFromCursorData(cursorData, schema, range);
}

async function getSuggestionsFromCursorData(data: CursorData, schema: Schema, range: Range): Promise<Suggestion[]> {
  let results: Suggestion[] = [];

  if (data.database && (data.database.includes('"') || data.database.includes('`'))) {
    data.database = data.database.substring(1, data.database.length - 1);
  }
  if (data.table && (data.table.includes('"') || data.table.includes('`'))) {
    data.table = data.table.substring(1, data.table.length - 1);
  }

  const mapping = ({
    [ClauseType.None]: 'keyword',
    [ClauseType.With]: 'column',
    [ClauseType.Select]: 'column',
    [ClauseType.From]: 'database_or_table',
    [ClauseType.Join]: 'database_or_table',
    [ClauseType.Where]: 'column',
    [ClauseType.GroupBy]: 'column',
    [ClauseType.Having]: 'column',
    [ClauseType.OrderBy]: 'column',
    [ClauseType.Limit]: 'keyword',
    [ClauseType.NestedIdent]: 'column',
  });

  if (data.database && !data.table) {
    mapping[ClauseType.From] = 'table';
    mapping[ClauseType.Join] = 'table';
  } else if (data.table && !data.database) {
    mapping[ClauseType.From] = 'table';
    mapping[ClauseType.Join] = 'table';
  } else if (data.database && data.table) {
    mapping[ClauseType.From] = 'table';
    mapping[ClauseType.Join] = 'table';
  }

  const contextType = mapping[data.clause];
  console.log('contextType', contextType);

  switch (contextType) {
    case 'database':
      results = await fetchDatabaseSuggestions(schema, range);
      break;

    case 'database_or_table':
      const databases = await fetchDatabaseSuggestions(schema, range);
      const defaultTables = await fetchTableSuggestions(schema, range, 'default');

      results = [
        ...databases,
        ...defaultTables,
      ];
      break;

    case 'table':
      const db = data.database || 'default';
      results = await fetchTableSuggestions(schema, range, db);
      break;

    case 'column':
      if (data.table) {
        const database = data.database || 'default';
        results = await fetchFieldSuggestions(schema, range, database, data.table, data.prefix);

        // result = result.map(column => ({
        //   ...column,
        //   needsQuotes: needsQuotes(column.name)
        // }));
      } else {
        // result = COMMON_COLUMNS.map(col => ({
        //   name: col,
        //   type: 'common_column'
        // }));
      }
      break;

    case 'keyword':
      results = CLICKHOUSE_KEYWORDS.map(keyword => ({
        label: keyword,
        insertText: keyword,
        kind: monaco.languages.CompletionItemKind.Keyword,
        documentation: '',
        range
      }));
      break;
  }

  return results;
}
