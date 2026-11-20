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

// A CTE that a FROM or JOIN of the cursor's select level reads from, with the CTEs visible there.
interface CursorCte {
  name: string;
  body: SelectQueryNode;
  scope: Map<string, SelectQueryNode>;
}

// A table, or a CTE, that a FROM or JOIN of the cursor's select reads, with its names unquoted.
interface ColumnSource {
  database?: string;
  table: string;
  alias?: string;
  // What a column of this source is qualified with: its alias, else its table, as written.
  qualifier: string;
  cte?: CursorCte;
}

// The alias of an ARRAY JOIN (`ARRAY JOIN Events AS e`) and the array column it reads.
interface ArrayJoinAlias {
  alias: string;
  column: string;
}

interface CursorData {
  clause: ClauseType;
  identifiers: string[];
  database?: string;
  table?: string;
  prefix?: string;
  // The tables and CTEs that the FROM and JOINs of the cursor's select read.
  sources: ColumnSource[];
  arrayJoins: ArrayJoinAlias[];
  // Where the select list of the cursor's select runs, once its FROM is typed.
  selectList?: { begin: number; end: number };

  begin: number;
  end: number;
}

function getCursorInSelectQueryNode(
  root: SelectQueryNode,
  cursorPosition: number,
  outerScope: Map<string, SelectQueryNode> = new Map()
): CursorData {
  // The selects at this level: those of a set operation (UNION, INTERSECT, EXCEPT), else just one.
  // Each has its own SELECT, clauses and tables, so the cursor is read in the one it is in.
  const branches = root.branches ?? [{ begin: 0, token: root.token, from: root.from }];
  let index = 0;
  while (index + 1 < branches.length && branches[index + 1].begin <= cursorPosition) {
    index++;
  }
  const { begin: branchBegin, token: select, from } = branches[index];

  // A query that starts with WITH has no SELECT token until its outer SELECT is typed, for example
  // while the cursor is still in the first CTE body.
  const head = select ?? root.children?.[0]?.token;
  const cursorData: CursorData = {
    clause: ClauseType.None,
    identifiers: [],
    sources: [],
    arrayJoins: [],
    begin: head?.begin ?? 0,
    end: head?.end ?? 0,
  };

  if (select && cursorPosition > select.end) {
    cursorData.clause = ClauseType.Select;
  }

  // The CTEs defined at this level and the ones around it; an inner name wins.
  const scope = new Map([...outerScope, ...(root.withAliases ?? [])]);
  if (from) {
    cursorData.database = from.database;
    cursorData.table = from.table;
  }
  if (select && from) {
    cursorData.selectList = { begin: select.end, end: from.token.begin };
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
        // The clauses of an earlier select do not carry over to the cursor's.
        if (node.token.begin < branchBegin) {
          break;
        }
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

  // The FROM and JOIN targets of the cursor's select. While its FROM is not typed yet, the select
  // before it lends its tables, since the selects of a set operation return the same columns.
  let targetIndex = index;
  while (targetIndex > 0 && !branches[targetIndex].from) {
    targetIndex--;
  }
  const targetBranch = branches[targetIndex];
  const targetEnd = branches[targetIndex + 1]?.begin ?? Infinity;
  const targets = root.children.filter(
    (node): node is FromQueryNode =>
      node.type === QueryNodeType.From &&
      // The parser reads a JOIN target as a From node too, as it does a FROM inside a function
      // call (`EXTRACT(DAY FROM ts)`), which is not a target.
      (node === targetBranch.from || node.token.matchKeyword('JOIN')) &&
      node.token.begin >= targetBranch.begin &&
      node.token.begin < targetEnd
  );
  for (const target of targets) {
    if (!target.arrayJoin) {
      const source = columnSource(target, scope);
      if (source) {
        cursorData.sources.push(source);
      }
    } else if (target.alias && target.table) {
      const column = [target.database, target.table].filter((part) => part !== undefined).join('.');
      cursorData.arrayJoins.push({ alias: target.alias, column });
    }
  }

  // In a FROM position the target being typed is the outer FROM or the last JOIN
  // whose keyword the cursor has passed. When the target is `$`-prefixed (`${t}`
  // or `${db}.`, as in the typingVariable check below), surface it so a JOIN
  // target gets variable completions, not just the first FROM. The clause guard
  // keeps this from changing a later clause's column context.
  if (cursorData.clause === ClauseType.From) {
    const target = targets.filter((node) => node.token.end < cursorPosition).pop();
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

  const results = await getSuggestionsFromCursorData(cursorData, schema, range, text);
  return dedupeSuggestions(results);
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
  text: string
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
    [ClauseType.On]: 'column',
    [ClauseType.Using]: 'column',
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
        results.push(...(await getVariableSuggestions(range)));
      }
      break;

    case 'table':
      results = await fetchTableSuggestions(schema, range, db, data.prefix);
      if (typingVariable) {
        results.push(...(await getVariableSuggestions(range)));
      }
      break;

    case 'column':
      // After a qualifier that names a table (`l.`, `otel_logs.`), only that table's columns can follow.
      const qualified = await fetchQualifiedFieldSuggestions(schema, range, text, data);
      if (qualified) {
        results = qualified;
        break;
      }

      const macros = await getMacroSuggestions(range, data.prefix);
      results.push(...macros);
      const variables = await getVariableSuggestions(range);
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

      const inUsing = data.clause === ClauseType.Using;
      results.push(...(await fetchSourceFieldSuggestions(schema, range, text, data.sources, data.prefix, inUsing)));
      results.push(...selectAliasSuggestions(text, data, range));

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

// The table, CTE or subquery that a FROM or JOIN target reads, or undefined for a table function or
// a table name that is not typed yet.
function columnSource(target: FromQueryNode, scope: Map<string, SelectQueryNode>): ColumnSource | undefined {
  if (target.subquery) {
    // A subquery has no table name, so its columns are qualified with its alias, if it has one.
    const alias = target.alias === undefined ? undefined : unquoteIdentifier(target.alias);
    return {
      table: alias ?? '',
      alias,
      qualifier: target.alias ?? '',
      cte: { name: alias ?? 'the subquery', body: target.subquery, scope },
    };
  }
  if (!target.table || target.isTableFunction) {
    return undefined;
  }
  const table = unquoteIdentifier(target.table);
  const database = target.database === undefined ? undefined : unquoteIdentifier(target.database);
  if (table === undefined || (target.database !== undefined && database === undefined)) {
    return undefined;
  }
  const body = cteNamedBy(target, scope);
  return {
    database,
    table,
    alias: target.alias === undefined ? undefined : unquoteIdentifier(target.alias),
    qualifier: target.alias ?? target.table,
    cte: body && { name: target.table, body, scope },
  };
}

// The source that the qualifier of a prefix names (`l.Sev`, `otel_logs.`, `otel.otel_logs.`), by its
// alias, its table or its database and table, with the rest of the prefix after the qualifier.
function qualifiedSource(prefix: string, sources: ColumnSource[], defaultDatabase: string) {
  const [first, ...rest] = prefix.split('.');
  if (!rest.length) {
    return undefined;
  }
  const [second, ...more] = rest;
  const byDatabase = more.length
    ? sources.find((s) => s.table === second && (s.database ?? defaultDatabase) === first)
    : undefined;
  if (byDatabase) {
    return { source: byDatabase, rest: more.join('.') };
  }
  const source = sources.find((s) => s.alias === first) ?? sources.find((s) => s.table === first);
  return source && { source, rest: rest.join('.') };
}

async function sourceColumns(schema: Schema, text: string, source: ColumnSource): Promise<TableColumn[]> {
  if (source.cte) {
    return cteSourceColumns(schema, text, source.cte);
  }
  return schema.columns(source.database || schema.defaultDatabase || 'default', source.table);
}

// The columns of every table that the cursor's select reads. A name that several of them have is
// offered once for each, qualified with its alias or table name, because ClickHouse silently reads
// a bare shared name from the left table of the join, which may not be the one meant.
async function fetchSourceFieldSuggestions(
  schema: Schema,
  range: Range,
  text: string,
  sources: ColumnSource[],
  prefix?: string,
  inUsing = false
) {
  const columns = await Promise.all(sources.map((source) => sourceColumns(schema, text, source)));
  const owners = new Map<string, number>();
  for (const names of columns.map((list) => new Set(list.map((c) => c.name)))) {
    names.forEach((name) => owners.set(name, (owners.get(name) ?? 0) + 1));
  }
  // USING takes bare names, and a dotted prefix is a path inside one column (`Events.`), which a
  // qualifier cannot precede.
  const qualifyShared = !inUsing && !prefix?.includes('.');
  const shared = (c: TableColumn) => qualifyShared && (owners.get(c.name) ?? 0) > 1;
  const own = (c: TableColumn) => !shared(c);
  return sources.flatMap((source, i) => [
    ...columnSuggestions(columns[i].filter(own), range, prefix),
    ...columnSuggestions(columns[i].filter(shared), range, prefix, source.qualifier),
  ]);
}

// After a qualifier that names a table of the cursor's select (`l.`, `otel_logs.`,
// `otel.otel_logs.`), or an ARRAY JOIN alias, only its columns can follow. Undefined for any other
// prefix.
async function fetchQualifiedFieldSuggestions(schema: Schema, range: Range, text: string, data: CursorData) {
  if (!data.prefix) {
    return undefined;
  }
  const defaultDatabase = schema.defaultDatabase || 'default';
  const qualified = qualifiedSource(data.prefix, data.sources, defaultDatabase);
  if (qualified) {
    return columnSuggestions(await sourceColumns(schema, text, qualified.source), range, qualified.rest);
  }
  const [alias, ...rest] = data.prefix.split('.');
  const arrayJoin = rest.length ? data.arrayJoins.find((a) => a.alias === alias) : undefined;
  if (!arrayJoin) {
    return undefined;
  }
  // `ARRAY JOIN Events AS e` reads one element of Events per row, so the columns under it, such as
  // `Events.Name`, become `e.Name`, typed as one element. A qualified column (`ARRAY JOIN t.Events`)
  // is in that table; a bare one can be in any of them.
  const owner = qualifiedSource(`${arrayJoin.column}.`, data.sources, defaultDatabase);
  const path = owner?.rest ?? `${arrayJoin.column}.`;
  const columns = await Promise.all(
    (owner ? [owner.source] : data.sources).map((source) => sourceColumns(schema, text, source))
  );
  const fields = columns
    .flat()
    .filter((c) => c.name.startsWith(path))
    .map((c) => ({
      ...c,
      name: c.name.substring(path.length),
      label: c.name.substring(path.length),
      type: c.type.replace(/^Array\((.*)\)$/, '$1'),
    }));
  return columnSuggestions(fields, range, rest.join('.'));
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
// they read; `seen` stops a CTE that reads from itself.
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
  const from = body.from;
  for (const item of selectListItems(text, body.token.end, from?.token.begin ?? nodeEnd(body))) {
    if (item.outputName) {
      columns.names.push(item.outputName);
    }
    if (!item.wildcard || !from) {
      continue;
    }
    const source = cteNamedBy(from, scope) ?? from.subquery;
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

async function cteSourceColumns(schema: Schema, text: string, cte: CursorCte): Promise<TableColumn[]> {
  const { names, tables } = cteColumns(text, cte.body, cte.scope);
  const columns: TableColumn[] = [];
  for (const { database, table } of tables) {
    const db = database || schema.defaultDatabase || 'default';
    columns.push(...(await schema.columns(db, table)));
  }
  // The schema knows no type for a column the CTE computes, so the detail names the CTE instead.
  const named = names.map((name): TableColumn => ({
    name,
    label: name,
    type: `Column of ${cte.name}`,
    picklistValues: [],
  }));
  columns.push(...named);
  return columns;
}

// The clauses after the select list, which can name the aliases it defines.
const ALIAS_CLAUSES = new Set([ClauseType.Where, ClauseType.GroupBy, ClauseType.Having, ClauseType.OrderBy]);

// The aliases that the select list of the cursor's select defines (`count() AS cnt`), in the
// clauses after it. A lone column, aliased or not, is already offered as a column of its table.
function selectAliasSuggestions(text: string, data: CursorData, range: Range) {
  if (!data.selectList || !ALIAS_CLAUSES.has(data.clause)) {
    return [];
  }
  const aliases = selectListItems(text, data.selectList.begin, data.selectList.end).flatMap(
    ({ outputName, sourceIdentifier }): TableColumn[] =>
      outputName !== undefined && outputName !== sourceIdentifier
        ? [{ name: outputName, label: outputName, type: 'Alias in SELECT', picklistValues: [] }]
        : []
  );
  return columnSuggestions(aliases, range, data.prefix);
}

// `qualifier` prefixes the label and the inserted name, as in `l.TraceId`.
function columnSuggestions(columns: TableColumn[], range: Range, prefix?: string, qualifier?: string) {
  // Monaco replaces and scores only the word at the cursor, and `.` ends a word,
  // so the insert and filter texts start after the last dot of the prefix.
  const typedSegments = prefix ? prefix.lastIndexOf('.') + 1 : 0;
  const qualify = (name: string) => (qualifier ? `${qualifier}.${name}` : name);
  return columns
    .filter((c) => !prefix || c.label!.toLowerCase().startsWith(prefix.toLowerCase()))
    .map((c) => ({
      label: qualify(c.label!),
      kind: monaco.languages.CompletionItemKind.Field,
      sortText: `!!!!${c.label}`,
      detail: c.type,
      documentation: c.type,
      filterText: c.name.substring(typedSegments),
      insertText: qualify(quoteColumnSegments(c.name.substring(typedSegments))),
      range,
    }));
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
      kind: monaco.languages.CompletionItemKind.Variable,
      sortText: `!!!${label}`,
      documentation: `(Template Variable) ${val}`,
      insertText: `\${${variable.name}}`,
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
