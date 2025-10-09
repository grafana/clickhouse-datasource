import { getTemplateSrv } from '@grafana/runtime';
import { Monaco, monacoTypes } from '@grafana/ui';
import { Range } from './sqlProvider';
import { Lexer } from 'ch-parser/lexer';
import { keywords, TokenType } from 'ch-parser/types';
import { SqlFunction, TableColumn } from 'types/queryBuilder';
import { pluginMacros } from 'ch-parser/pluginMacros';
import {
  ClauseType,
  FromQueryNode,
  IdentifierQueryNode,
  parseSelectQueryNode,
  QueryNodeParser,
  QueryNodeType,
  SelectQueryNode,
} from 'ch-parser/parser';

declare const monaco: Monaco;
export interface Schema {
  databases: () => Promise<string[]>;
  tables: (db?: string) => Promise<string[]>;
  columns: (db: string, table: string) => Promise<TableColumn[]>;
  functions: () => Promise<SqlFunction[]>;
  defaultDatabase?: string;
}

interface CursorData {
  clause: ClauseType;
  identifiers: string[];
  database?: string;
  table?: string;
  prefix?: string;

  begin: number;
  end: number;
}

function getCursorInSelectQueryNode(root: SelectQueryNode, cursorPosition: number): CursorData {
  const cursorData: CursorData = {
    clause: ClauseType.None,
    identifiers: [],
    begin: root.token.begin,
    end: root.token.end,
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

  return cursorData;
}

export async function getSuggestions(
  text: string,
  schema: Schema,
  range: Range,
  cursorPosition: number
): Promise<monacoTypes.languages.CompletionItem[]> {
  const lexer = new Lexer(text);
  const tokens = [];
  while (true) {
    const token = lexer.nextToken();
    if (token.isEnd()) {
      break;
    }

    if (!token.isSignificant()) {
      continue;
    }

    tokens.push(token);
  }

  const parser = new QueryNodeParser(tokens);
  const selectNode = parseSelectQueryNode(parser);
  // console.log(selectNode);

  if (!selectNode) {
    return [];
  }

  const cursorData = getCursorInSelectQueryNode(selectNode, cursorPosition);
  // console.log('database:', cursorData.database, 'table:', cursorData.table, 'identifiers:', cursorData.identifiers, 'prefix:', cursorData.prefix, 'clause:', cursorData.clause);

  return await getSuggestionsFromCursorData(cursorData, schema, range);
}

async function getSuggestionsFromCursorData(
  data: CursorData,
  schema: Schema,
  range: Range
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
  // console.log(contextType);

  const db = data.database || schema.defaultDatabase || 'default';
  switch (contextType) {
    case 'database':
      results = await fetchDatabaseSuggestions(schema, range);
      break;

    case 'database_or_table':
      const databases = await fetchDatabaseSuggestions(schema, range, data.prefix);
      const defaultTables = await fetchTableSuggestions(schema, range, db, data.prefix);

      results = [...databases, ...defaultTables];
      break;

    case 'table':
      results = await fetchTableSuggestions(schema, range, db, data.prefix);
      break;

    case 'column':
      const macros = await getMacroSuggestions(range, data.prefix);
      results.push(...macros);
      const variables = await getVariableSuggestions(range);
      results.push(...variables);

      // Causes duplicates. Must fix identifier parsing first, or filter/dupe check.
      // results.push(...data.identifiers.map(id => ({
      //   label: id,
      //   insertText: id,
      //   sortText: `!!${id}`,
      //   kind: monaco.languages.CompletionItemKind.Field,
      //   documentation: '',
      //   range
      // })));

      results.push({
        label: 'NULL',
        insertText: 'NULL',
        sortText: '!!!NULL',
        kind: monaco.languages.CompletionItemKind.Keyword,
        documentation: '',
        range,
      });

      const sqlFunctions = await fetchFunctionSuggestions(schema, range);
      results.push(...sqlFunctions);

      if (data.table) {
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

async function fetchFieldSuggestions(schema: Schema, range: Range, db: string, table: string, prefix?: string) {
  const columns = await schema.columns(db, table);
  return columns
    .map((c) => ({
      label: c.label!,
      kind: monaco.languages.CompletionItemKind.Field,
      sortText: `!!!!${c.label}`,
      detail: c.type,
      documentation: c.type,
      insertText: prefix && prefix.includes('.') ? c.name.substring(prefix?.length || 0) : c.name,
      range,
    }))
    .filter((c) => !prefix || c.label.startsWith(prefix));
}

async function fetchFunctionSuggestions(schema: Schema, range: Range) {
  const sqlFunctions = await schema.functions();
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
