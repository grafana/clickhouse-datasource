import { Monaco, MonacoEditor, monacoTypes } from '@grafana/ui'

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

export function registerSQL(lang: string, editor: MonacoEditor, fetchSuggestions: Fetcher) {
  // so options are visible outside query editor
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
      // const textUntilPosition = model.getValueInRange({
      //   startLineNumber: 1,
      //   startColumn: 1,
      //   endLineNumber: position.lineNumber,
      //   endColumn: position.column,
      // });

      const range: Range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      return fetchSuggestions(model.getValue(), range, model.getOffsetAt(position));
    },
  });

  return monaco.editor;
}
