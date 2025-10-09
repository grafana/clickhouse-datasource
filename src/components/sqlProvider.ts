import { Monaco, MonacoEditor, monacoTypes } from '@grafana/ui';
import { format } from 'sql-formatter';

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

export function formatSql(rawSql: string, tabWidth = 4): string {
  // The default formatter doesn't like the $, so we swap it out
  const macroPrefix = '$';
  const swapIdentifier = 'GRAFANA_DOLLAR_TOKEN';
  const removedVariables = rawSql.replaceAll(macroPrefix, swapIdentifier);
  const formattedRaw = format(removedVariables, {
    language: 'postgresql',
    tabWidth,
  });

  const formatted = formattedRaw.replaceAll(swapIdentifier, macroPrefix);
  return formatted;
}

export function registerSQL(lang: string, editor: MonacoEditor, fetchSuggestions: Fetcher) {
  // show options outside query editor
  editor.updateOptions({ fixedOverflowWidgets: true, scrollBeyondLastLine: false });

  // const registeredLang = monaco.languages.getLanguages().find((l: Lang) => l.id === lang);
  // if (registeredLang !== undefined) {
  //   return monaco.editor;
  // }

  // monaco.languages.register({ id: lang });

  // just extend sql for now so we get syntax highlighting
  monaco.languages.registerCompletionItemProvider('sql', {
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

  monaco.languages.registerDocumentFormattingEditProvider('sql', {
    provideDocumentFormattingEdits(model, options) {
      return [
        {
          range: model.getFullModelRange(),
          text: formatSql(model.getValue(), options.tabSize),
        },
      ];
    },
  });

  return monaco.editor;
}
