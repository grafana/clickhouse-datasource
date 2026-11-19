import { Monaco, MonacoEditor, monacoTypes } from '@grafana/ui';
import { format } from 'sql-formatter';
import { Lexer } from 'ch-parser/lexer';
import { TokenType } from 'ch-parser/types';

declare const monaco: Monaco;

interface Model {
  getValueInRange: Function;
  getWordUntilPosition: Function;
  getValue: Function;
  getOffsetAt: Function;
}

interface Position {
  lineNumber: number;
  column: number;
}

export interface Range {
  startLineNumber: number;
  endLineNumber: number;
  startColumn: number;
  endColumn: number;
}

export interface SuggestionResponse {
  suggestions: monacoTypes.languages.CompletionItem[];
}

export interface Suggestion {
  label: string;
  kind: number;
  documentation: string;
  insertText: string;
  range: Range;
  detail?: string;
  sortText?: string;
}

export type Fetcher = {
  (text: string, range: Range, cursorPosition: number): Promise<SuggestionResponse>;
};

// Tokens the formatter keeps exactly as typed, so template syntax inside them is left alone.
const verbatimTokenTypes = new Set([TokenType.Comment, TokenType.StringLiteral, TokenType.QuotedIdentifier]);

// A word holding Grafana template syntax: a macro ($__timeFilter), a variable ($var, ${var},
// ${var:singlequote}) or a name built from them (otel_${env}_logs).
const templateWordRegex = /(?:\w|\$\{[^}]*\}|\$)+/g;

interface TemplateProtection {
  sql: string;
  restore: (formatted: string) => string;
}

/**
 * Swaps Grafana template syntax and here-documents for placeholder identifiers, so the formatter
 * only sees ClickHouse SQL it can parse. Returns undefined when the query does not tokenize.
 */
function protectTemplateSyntax(rawSql: string): TemplateProtection | undefined {
  let prefix = 'grafana_template_';
  while (rawSql.includes(prefix)) {
    prefix = `_${prefix}`;
  }

  const originals: string[] = [];
  const calls: boolean[] = [];
  const placeholder = (original: string, call: boolean): string => {
    originals.push(original);
    calls.push(call);
    return `${prefix}${originals.length - 1}_`;
  };

  let sql = '';
  let code = '';
  const flushCode = () => {
    sql += code.replace(templateWordRegex, (word: string, offset: number) =>
      word.includes('$') ? placeholder(word, code[offset + word.length] === '(') : word
    );
    code = '';
  };

  const lexer = new Lexer(rawSql);
  let pos = 0;
  for (let token = lexer.nextToken(); !token.isEnd(); token = lexer.nextToken()) {
    if (token.isError()) {
      return undefined;
    }

    const text = rawSql.substring(pos, token.end);
    pos = token.end;
    if (token.type === TokenType.HereDoc) {
      flushCode();
      sql += placeholder(text, false);
    } else if (verbatimTokenTypes.has(token.type)) {
      flushCode();
      sql += text;
    } else {
      code += text;
    }
  }
  code += rawSql.substring(pos);
  flushCode();

  const placeholderRegex = new RegExp(`${prefix}(\\d+)_(\\s*\\()?`, 'g');
  const restore = (formatted: string) =>
    formatted.replace(placeholderRegex, (_match: string, index: string, paren?: string) => {
      const i = Number(index);
      // Macro arguments only parse when the bracket follows the name: $__timeFilter(ts), not $__timeFilter (ts).
      if (paren && calls[i]) {
        return `${originals[i]}(`;
      }
      return originals[i] + (paren ?? '');
    });

  return { sql, restore };
}

/**
 * Formats a query with the ClickHouse dialect of sql-formatter. Grafana macros and variables come
 * back exactly as typed. A query that cannot be formatted is returned unchanged.
 */
export function formatSql(rawSql: string, tabWidth = 4): string {
  const protection = protectTemplateSyntax(rawSql);
  if (!protection) {
    return rawSql;
  }

  try {
    return protection.restore(format(protection.sql, { language: 'clickhouse', tabWidth }));
  } catch {
    return rawSql;
  }
}

export interface SqlRegistration {
  monacoEditor: typeof monaco.editor;
  dispose: () => void;
}

export function registerSQL(lang: string, editor: MonacoEditor, fetchSuggestions: Fetcher): SqlRegistration {
  // show options outside query editor
  editor.updateOptions({ fixedOverflowWidgets: true, scrollBeyondLastLine: false });

  // const registeredLang = monaco.languages.getLanguages().find((l: Lang) => l.id === lang);
  // if (registeredLang !== undefined) {
  //   return monaco.editor;
  // }

  // monaco.languages.register({ id: lang });

  // just extend sql for now so we get syntax highlighting
  const completionProvider = monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: [' ', '.', '$'],
    provideCompletionItems: async (model: Model, position: Position) => {
      const word = model.getWordUntilPosition(position);
      const range: Range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      return fetchSuggestions(model.getValue(), range, model.getOffsetAt(position));
    },
  });

  const formattingProvider = monaco.languages.registerDocumentFormattingEditProvider('sql', {
    provideDocumentFormattingEdits(model, options) {
      return [
        {
          range: model.getFullModelRange(),
          text: formatSql(model.getValue(), options.tabSize),
        },
      ];
    },
  });

  return {
    monacoEditor: monaco.editor,
    dispose: () => {
      completionProvider.dispose();
      formattingProvider.dispose();
    },
  };
}
