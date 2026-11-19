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
  (text: string, range: Range, cursorPosition: number, onlyMapKeys?: boolean): Promise<SuggestionResponse>;
};

// Tokens that reach the formatter without placeholders, even when they hold template syntax.
const verbatimTokenTypes = new Set([TokenType.Comment, TokenType.StringLiteral, TokenType.QuotedIdentifier]);

// A word holding Grafana template syntax: a macro ($__timeFilter), a variable ($var, ${var},
// ${var:singlequote}, [[var]], [[var:csv]]) or a name built from them (otel_${env}_logs).
const templateWordRegex = /(?:\w|\$\{[^}]*\}|\$|\[\[\w+(?::\w+)?\]\])+/g;

// The formatter reads a hex or binary string (x'4142', b'0101') as a name followed by a string,
// and puts a space between them, so these strings get placeholders like here-documents.
const hexOrBinaryStringRegex = /^[xb]'/i;

// ClickHouse reads a word that starts with a digit as a name, and so does the plugin's lexer, as in
// the interval of $__timeGroup(ts, 5m). The formatter can't parse such a word and gives up on the
// whole query, so these words get placeholders too.
const digitWordRegex = /^\d/;

// ClickHouse nests block comments, and so does the plugin's lexer: `/* a /* b */ c */` is one
// comment token, so a block comment that holds another `/*` nests. The formatter ends a block
// comment at the first `*/` instead, which turns the end of this one into `c * /`. It doesn't
// read `//` as a comment either.
const formatterBreaksComment = (comment: string): boolean =>
  comment.startsWith('//') || (comment.startsWith('/*') && comment.includes('/*', 2));

interface TemplateProtection {
  sql: string;
  restore: (formatted: string) => string;
}

/**
 * Swaps Grafana template syntax, here-documents and other ClickHouse syntax the formatter misreads
 * for placeholder identifiers, so the formatter only sees ClickHouse SQL it can parse. Returns
 * undefined when the query does not tokenize or has a comment the formatter would break.
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
      word.includes('$') || word.includes('[[') ? placeholder(word, code[offset + word.length] === '(') : word
    );
    code = '';
  };

  const lexer = new Lexer(rawSql);
  let pos = 0;
  // A `^` or `:` right after a dot, held until the name or type that follows it.
  let pathPart: string | undefined;
  for (let token = lexer.nextToken(); !token.isEnd(); token = lexer.nextToken()) {
    // The token as typed. The lexer starts a line comment token after its `--`, `#` or `//`.
    const text = rawSql.substring(pos, token.end);
    if (token.isError() || (token.type === TokenType.Comment && formatterBreaksComment(text))) {
      return undefined;
    }

    pos = token.end;
    if (pathPart !== undefined) {
      const held = pathPart;
      pathPart = undefined;
      if (token.type === TokenType.BareWord || token.type === TokenType.QuotedIdentifier) {
        // JSON path syntax the formatter can't parse: json.^a, json.a.:Int64, json.a.:`Array(Int64)`.
        code += placeholder(held + text, false);
        continue;
      }
      code += held;
    }
    if ((token.type === TokenType.Caret || token.type === TokenType.Colon) && code.endsWith('.')) {
      pathPart = text;
      continue;
    }
    if (
      token.type === TokenType.HereDoc ||
      (token.type === TokenType.StringLiteral && hexOrBinaryStringRegex.test(text)) ||
      (token.type === TokenType.BareWord && digitWordRegex.test(text))
    ) {
      flushCode();
      sql += placeholder(text, false);
    } else if (verbatimTokenTypes.has(token.type)) {
      flushCode();
      sql += text;
    } else {
      code += text;
    }
  }
  code += (pathPart ?? '') + rawSql.substring(pos);
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
    // Not a space: Enter accepts the selected suggestion, so a list that opens on a space turns Enter
    // after `FROM t ` into a suggestion instead of a new line. Typing a letter opens the list anyway.
    // A quote opens the key list right after `column['`, and asks for nothing anywhere else.
    triggerCharacters: ['.', '$', "'"],
    provideCompletionItems: async (model: Model, position: Position, context?: { triggerCharacter?: string }) => {
      // Every SQL editor registers a provider for the shared sql language and Monaco asks all of
      // them, so answer only for this editor's model. Otherwise each open editor repeats every
      // suggestion, and an editor on another data source adds its own tables and columns.
      if (model !== editor.getModel()) {
        return { suggestions: [] };
      }

      const word = model.getWordUntilPosition(position);
      const range: Range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      return fetchSuggestions(model.getValue(), range, model.getOffsetAt(position), context?.triggerCharacter === "'");
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
