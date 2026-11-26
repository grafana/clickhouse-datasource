import { getTemplateSrv } from '@grafana/runtime';
import { Monaco, monacoTypes } from '@grafana/ui';
import { Range } from './sqlProvider';
import { keywords, TokenType } from 'ch-parser/types';
import { SqlFunction, TableColumn } from 'types/queryBuilder';
import { pluginMacros } from 'ch-parser/pluginMacros';
import { quoteColumnIfUnsafe } from 'data/jsonPath';
import {
  ClauseType,
  FromQueryNode,
  IdentifierQueryNode,
  parseSelect,
  QueryNode,
  QueryNodeType,
  SelectQueryNode,
} from 'ch-parser/parser';
import { selectListItems, unquoteIdentifier } from 'ch-parser/spans';

declare const monaco: Monaco;
export interface Schema {
  databases: () => Promise<string[]>;
  tables: (db?: string) => Promise<string[]>;
  columns: (db: string, table: string) => Promise<TableColumn[]>;
  functions: () => Promise<SqlFunction[]>;
  defaultDatabase?: string;
}

// A CTE that the FROM of the cursor's select level reads from, with the CTEs visible there.
interface CursorCte {
  name: string;
  body: SelectQueryNode;
  scope: Map<string, SelectQueryNode>;
}

interface CursorData {
  clause: ClauseType;
  identifiers: string[];
  database?: string;
  table?: string;
  prefix?: string;
  cte?: CursorCte;

  begin: number;
  end: number;
}

function getCursorInSelectQueryNode(
  root: SelectQueryNode,
  cursorPosition: number,
  outerScope: Map<string, SelectQueryNode> = new Map()
): CursorData {
  // A query that starts with WITH has no SELECT token until its outer SELECT is typed, for example
  // while the cursor is still in the first CTE body.
  const head = root.token ?? root.children?.[0]?.token;
  const cursorData: CursorData = {
    clause: ClauseType.None,
    identifiers: [],
    begin: head?.begin ?? 0,
    end: head?.end ?? 0,
  };

  if (root.token && cursorPosition > root.token.end) {
    cursorData.clause = ClauseType.Select;
  }

  // The CTEs defined at this level and the ones around it; an inner name wins.
  const scope = new Map([...outerScope, ...(root.withAliases ?? [])]);
  if (root.from) {
    cursorData.database = root.from.database;
    cursorData.table = root.from.table;
    const body = cteNamedBy(root.from, scope);
    if (body) {
      cursorData.cte = { name: root.from.table!, body, scope };
    }
  }

  if (!root.children) {
    return cursorData;
  }

  for (const node of root.children) {
    switch (node.type) {
      case QueryNodeType.Select:
        const selectNode = node as SelectQueryNode;
        const nestedCursorData = getCursorInSelectQueryNode(selectNode, cursorPosition, scope);
        // +1/-1 to exclude subquery parenthesis
        if (cursorPosition >= nestedCursorData.begin - 1 && cursorPosition <= nestedCursorData.end + 1) {
          return nestedCursorData;
        }

        break;
      default:
        cursorData.end = node.token.end;
        if (node.type === QueryNodeType.From) {
          const fromNode = node as FromQueryNode;
          const dbLen = fromNode.database?.length || 0;
          const separatorLen = dbLen > 0 ? 1 : 0;
          const tableLen = fromNode.table?.length || 0;
          const extendedTokenLen = dbLen + separatorLen + tableLen;
          cursorData.end = fromNode.token.end + extendedTokenLen;

          if ((node as FromQueryNode).prefix) {
            cursorData.prefix = (node as FromQueryNode).prefix;
          }
        }

        if (
          node.token.type === TokenType.QuotedIdentifier ||
          node.type === QueryNodeType.Identifier ||
          (node.token.type === TokenType.BareWord && !node.token.isKeyword())
        ) {
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

  // In a FROM position the target being typed is the outer FROM or the last JOIN
  // whose keyword the cursor has passed. The parser reads a JOIN target as a From
  // node too, as it does a FROM inside a function call (`EXTRACT(DAY FROM ts)`),
  // which is not a target. When the target is `$`-prefixed (`${t}` or `${db}.`,
  // as in the typingVariable check below), surface it so a JOIN target gets
  // variable completions, not just the first FROM. The clause guard keeps this
  // from changing a later clause's column context.
  if (cursorData.clause === ClauseType.From) {
    let target: FromQueryNode | undefined;
    for (const node of root.children) {
      if (
        node.type === QueryNodeType.From &&
        (node === root.from || node.token.matchKeyword('JOIN')) &&
        node.token.end < cursorPosition
      ) {
        target = node;
      }
    }
    if (target && (target.table || target.database || '').startsWith('$')) {
      cursorData.database = target.database;
      cursorData.table = target.table;
    }
  }

  return cursorData;
}

export async function getSuggestions(
  text: string,
  schema: Schema,
  range: Range,
  cursorPosition: number
): Promise<monacoTypes.languages.CompletionItem[]> {
  const selectNode = parseSelect(text);

  if (!selectNode) {
    return [];
  }

  const cursorData = getCursorInSelectQueryNode(selectNode, cursorPosition);

  const results = await getSuggestionsFromCursorData(
    cursorData,
    schema,
    range,
    text,
    typedVariableStart(text, cursorPosition)
  );
  return dedupeSuggestions(results);
}

/**
 * How much of a variable reference is typed before the name at the cursor: '$', '${', or nothing.
 * Monaco treats `$` and `{` as word separators, so they stay in place and the suggestion replaces
 * only the name typed after them. `closed` is whether a `}` comes right after the cursor, which
 * closes the variable only after `${`.
 */
export interface TypedVariableStart {
  start: '' | '$' | '${';
  closed: boolean;
}

function typedVariableStart(text: string, cursorPosition: number): TypedVariableStart {
  const match = /(\$\{?)\w*$/.exec(text.substring(0, cursorPosition));
  const start = !match ? '' : match[1] === '${' ? '${' : '$';
  return { start, closed: text[cursorPosition] === '}' };
}

function dedupeSuggestions(items: monacoTypes.languages.CompletionItem[]): monacoTypes.languages.CompletionItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const label = typeof item.label === 'string' ? item.label : item.label.label;
    const key = JSON.stringify([label, item.kind, item.insertText]);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function getSuggestionsFromCursorData(
  data: CursorData,
  schema: Schema,
  range: Range,
  text: string,
  typed: TypedVariableStart = { start: '', closed: false }
): Promise<monacoTypes.languages.CompletionItem[]> {
  let results: monacoTypes.languages.CompletionItem[] = [];

  if (data.database && (data.database.includes('"') || data.database.includes('`'))) {
    data.database = data.database.substring(1, data.database.length - 1);
  }
  if (data.table && (data.table.includes('"') || data.table.includes('`'))) {
    data.table = data.table.substring(1, data.table.length - 1);
  }

  const mapping = {
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
    [ClauseType.Identifier]: 'column',
  };

  if (data.database && !data.table) {
    mapping[ClauseType.From] = 'table';
    mapping[ClauseType.Join] = 'table';
  } else if (data.table && !data.database) {
    mapping[ClauseType.From] = 'database_or_table';
    mapping[ClauseType.Join] = 'database_or_table';
  } else if (data.database && data.table) {
    mapping[ClauseType.From] = 'table';
    mapping[ClauseType.Join] = 'table';
  }

  const contextType = mapping[data.clause];

  const db = data.database || schema.defaultDatabase || 'default';
  // A `$`-prefixed FROM target means the user is typing a Grafana variable as
  // the table (e.g. the shipped `FROM ${database}.otel_traces`), so offer
  // variables there alongside databases and tables.
  const typingVariable = (data.table || data.database || '').startsWith('$');
  switch (contextType) {
    case 'database':
      results = await fetchDatabaseSuggestions(schema, range);
      break;

    case 'database_or_table':
      const databases = await fetchDatabaseSuggestions(schema, range, data.prefix);
      const defaultTables = await fetchTableSuggestions(schema, range, db, data.prefix);

      results = [...databases, ...defaultTables];
      if (typingVariable) {
        results.push(...(await getVariableSuggestions(range, typed)));
      }
      break;

    case 'table':
      results = await fetchTableSuggestions(schema, range, db, data.prefix);
      if (typingVariable) {
        results.push(...(await getVariableSuggestions(range, typed)));
      }
      break;

    case 'column':
      const macros = await getMacroSuggestions(range, data.prefix);
      results.push(...macros);
      const variables = await getVariableSuggestions(range, typed);
      results.push(...variables);

      // After a bare `$` Monaco has an empty word to match on, because `$` is a word
      // separator, so it filters nothing and the order is pure sortText. NULL sorts above
      // every macro there, so it has to exclude itself by prefix the way columns already do.
      if (!data.prefix || 'null'.startsWith(data.prefix.toLowerCase())) {
        results.push({
          label: 'NULL',
          insertText: 'NULL',
          sortText: '!!!NULL',
          kind: monaco.languages.CompletionItemKind.Keyword,
          documentation: '',
          range,
        });
      }

      const sqlFunctions = await fetchFunctionSuggestions(schema, range);
      results.push(...sqlFunctions);

      if (data.cte) {
        results.push(...(await fetchCteFieldSuggestions(schema, range, text, data.cte, data.prefix)));
      } else if (data.table) {
        const database = data.database || schema.defaultDatabase || 'default';
        const columns = await fetchFieldSuggestions(schema, range, database, data.table, data.prefix);
        results.push(...columns);
      }

      break;
    case 'keyword':
      results = Array.from(keywords).map((keyword) => ({
        label: keyword,
        insertText: keyword,
        kind: monaco.languages.CompletionItemKind.Keyword,
        documentation: '',
        range,
      }));
      break;
  }

  return results;
}

async function fetchDatabaseSuggestions(schema: Schema, range: Range, prefix?: string) {
  const databases = await schema.databases();
  return databases.map((val) => {
    let quoteType = '';
    if (prefix && prefix.startsWith('"')) {
      quoteType = '"';
    } else if (prefix && prefix.startsWith('`')) {
      quoteType = '`';
    }
    const quoteClosed = val.endsWith(quoteType);

    return {
      label: val,
      kind: monaco.languages.CompletionItemKind.Module,
      detail: 'Database',
      documentation: 'Database',
      insertText: quoteType ? `${val}${quoteClosed ? '' : quoteType}` : val,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
    };
  });
}

async function fetchTableSuggestions(schema: Schema, range: Range, database: string, prefix?: string) {
  const tables = await schema.tables(database);
  return tables.map((val) => {
    let quoteType = '';
    if (prefix && prefix.startsWith('"')) {
      quoteType = '"';
    } else if (prefix && prefix.startsWith('`')) {
      quoteType = '`';
    }
    const quoteClosed = val.endsWith(quoteType);

    return {
      label: val,
      kind: monaco.languages.CompletionItemKind.Class,
      detail: 'Table',
      documentation: 'Table',
      insertText: quoteType ? `${val}${quoteClosed ? '' : quoteType}` : val,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
    };
  });
}

// Backtick-quote the segments that are not plain identifiers, so an inserted
// JSON path such as payload.`weird key` parses.
const quoteColumnSegments = (name: string): string => name.split('.').map(quoteColumnIfUnsafe).join('.');

async function fetchFieldSuggestions(schema: Schema, range: Range, db: string, table: string, prefix?: string) {
  return columnSuggestions(await schema.columns(db, table), range, prefix);
}

// The CTE an unqualified FROM target names, when one with that name is in scope.
function cteNamedBy(from: FromQueryNode, scope: Map<string, SelectQueryNode>): SelectQueryNode | undefined {
  if (!from.table || from.database || from.isTableFunction) {
    return undefined;
  }
  return scope.get(from.table);
}

// The end offset of the last token under `node`.
function nodeEnd(node: QueryNode): number {
  return Math.max(node.token?.end ?? 0, ...(node.children ?? []).map(nodeEnd));
}

interface CteColumns {
  // The names the CTE's select list gives: aliases and lone column names.
  names: string[];
  // The tables whose columns reach the CTE through `*`.
  tables: Array<{ database?: string; table: string }>;
}

// The columns a CTE body exposes. `*` is followed through CTEs and FROM subqueries to the tables
// they read. `seen` holds the CTEs being resolved.
function cteColumns(
  text: string,
  body: SelectQueryNode,
  outerScope: Map<string, SelectQueryNode>,
  seen = new Set<SelectQueryNode>()
): CteColumns {
  const columns: CteColumns = { names: [], tables: [] };
  if (!body.token || seen.has(body)) {
    return columns;
  }
  seen.add(body);

  const scope = new Map([...outerScope, ...(body.withAliases ?? [])]);
  // In a UNION or another set operation, the first select names the columns.
  const select = body.firstSelect ?? body.token;
  const end = body.firstSetOperator?.begin ?? nodeEnd(body);
  const from = body.from && body.from.token.begin < end ? body.from : undefined;
  for (const item of selectListItems(text, select.end, from?.token.begin ?? end)) {
    if (item.outputName) {
      columns.names.push(item.outputName);
    }
    if (!item.wildcard || !from) {
      continue;
    }
    // A CTE that is still being resolved names the table there, as in ClickHouse: the inner `logs` of
    // `WITH logs AS (SELECT * FROM logs)` reads the table.
    const cte = cteNamedBy(from, scope);
    const source = (cte && !seen.has(cte) ? cte : undefined) ?? from.subquery;
    if (source) {
      const inner = cteColumns(text, source, scope, seen);
      columns.names.push(...inner.names);
      columns.tables.push(...inner.tables);
    } else if (from.table && !from.isTableFunction) {
      const table = unquoteIdentifier(from.table);
      const database = from.database === undefined ? undefined : unquoteIdentifier(from.database);
      if (table !== undefined && (from.database === undefined || database !== undefined)) {
        columns.tables.push({ database, table });
      }
    }
  }
  return columns;
}

async function fetchCteFieldSuggestions(schema: Schema, range: Range, text: string, cte: CursorCte, prefix?: string) {
  const { names, tables } = cteColumns(text, cte.body, cte.scope);
  const suggestions: monacoTypes.languages.CompletionItem[] = [];
  for (const { database, table } of tables) {
    const db = database || schema.defaultDatabase || 'default';
    suggestions.push(...(await fetchFieldSuggestions(schema, range, db, table, prefix)));
  }
  // The schema knows no type for a column the CTE computes, so the detail names the CTE instead.
  const named = names.map((name): TableColumn => ({
    name,
    label: name,
    type: `Column of ${cte.name}`,
    picklistValues: [],
  }));
  suggestions.push(...columnSuggestions(named, range, prefix));
  return suggestions;
}

function columnSuggestions(columns: TableColumn[], range: Range, prefix?: string) {
  // Monaco replaces and scores only the word at the cursor, and `.` ends a word,
  // so the insert and filter texts start after the last dot of the prefix.
  const typedSegments = prefix ? prefix.lastIndexOf('.') + 1 : 0;
  return columns
    .map((c) => ({
      label: c.label!,
      kind: monaco.languages.CompletionItemKind.Field,
      sortText: `!!!!${c.label}`,
      detail: c.type,
      documentation: c.type,
      filterText: c.name.substring(typedSegments),
      insertText: quoteColumnSegments(c.name.substring(typedSegments)),
      range,
    }))
    .filter((c) => !prefix || c.label.toLowerCase().startsWith(prefix.toLowerCase()));
}

async function fetchFunctionSuggestions(schema: Schema, range: Range) {
  // ClickHouse's `__`-prefixed built-ins are query planner helpers, not user-facing SQL.
  // `origin` keeps a user-defined function of the same shape, which reports SQLUserDefined.
  // Matching on the name rather than `categories === 'Internal'` because that category only
  // exists from 26.6, and older servers report it empty for the same functions.
  const sqlFunctions = (await schema.functions()).filter((c) => !(c.name.startsWith('__') && c.origin === 'System'));
  return sqlFunctions.map((c) => ({
    label: c.name,
    kind: monaco.languages.CompletionItemKind.Function,
    sortText: `${c.name}`,
    detail: c.categories || (c.isAggregate && 'Aggregate') || '',
    documentation: [
      `Category: ${c.categories || '(none)'}`,
      `Alias: ${c.aliasTo || '(none)'}`,
      `Aggregate: ${c.isAggregate}`,
      `Case insensitive: ${c.caseInsensitive}`,
      `Origin: ${c.origin}`,
      `Description: ${c.description || '(none)'}`,
      `Syntax: ${c.syntax || '(none)'}`,
      `Arguments: ${c.arguments || '(none)'}`,
      `Returned value: ${c.returnedValue || '(none)'}`,
    ].join('\n'),
    insertText: `${c.name}(\${1})`,
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    range,
  }));
}

export function getVariableSuggestions(range: Range, typed: TypedVariableStart = { start: '', closed: false }) {
  const templateSrv = getTemplateSrv();
  if (!templateSrv) {
    return [];
  }
  return templateSrv.getVariables().map((variable) => {
    const label = `\${${variable.name}}`;
    const val = templateSrv.replace(label);
    // Only what is not typed yet, so picking `${service}` after `$` doesn't give `$${service}`.
    // After a bare `$` a `}` at the cursor closes something else, as in `{'a': $}`, so the insert
    // brings its own. After `${` it is the one the editor added when `{` was typed.
    const closing = typed.start === '${' && typed.closed ? '' : '}';
    const insertText =
      typed.start === '${' ? `${variable.name}${closing}` : typed.start === '$' ? `{${variable.name}${closing}` : label;
    return {
      label,
      detail: `(Template Variable) ${val}`,
      kind: monaco.languages.CompletionItemKind.Variable,
      // Monaco matches the word after `$` or `${`, which is part of the name.
      filterText: variable.name,
      sortText: `!!!${label}`,
      documentation: `(Template Variable) ${val}`,
      insertText,
      range,
    };
  });
}

export function getMacroSuggestions(range: Range, prefix?: string) {
  return pluginMacros.map((macro) => {
    const hasPrefix = (prefix || '').includes('$');
    const nameNoPrefix = macro.name.substring(1);

    return {
      label: macro.name,
      detail: `(Plugin Macro) ${macro.columnType || ''}`,
      kind: macro.isFunction
        ? monaco.languages.CompletionItemKind.Function
        : monaco.languages.CompletionItemKind.Variable,
      // Monaco scores candidates against the word under the cursor, and `$` is a word
      // separator, so typing `$__` is scored as `__`. Without this the label only matches
      // at offset 1 and ClickHouse's own `__*` internal functions outrank every macro.
      filterText: nameNoPrefix,
      sortText: `!!${macro.name.substring(3)}`,
      documentation: macro.documentation + (macro.example ? '\nExample output: ' + macro.example : ''),
      insertText: macro.isFunction
        ? `${hasPrefix ? nameNoPrefix : macro.name.replaceAll('$', '\\$')}(\${1})`
        : hasPrefix
          ? nameNoPrefix
          : macro.name,
      insertTextRules: macro.isFunction ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
      range,
    };
  });
}
