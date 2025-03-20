import { Monaco, MonacoEditor } from '@grafana/ui'
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
  suggestions: Suggestion[];
}

export interface Suggestion {
  label: string;
  kind: number;
  documentation: string;
  insertText: string;
  range: Range;
  detail?: string;
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

  monaco.languages.registerDocumentFormattingEditProvider('sql', {
    provideDocumentFormattingEdits(model, options) {
      const formatted = format(model.getValue(), {
        indent: ' '.repeat(options.tabSize)
      } as any);
      return [
        {
          range: model.getFullModelRange(),
          text: formatted
        }
      ];
    }
  });

  return monaco.editor;
}

export enum SchemaKind {
  FIELD = 3, // monaco.languages.CompletionItemKind.Field,
  DATABASE = 8, // monaco.languages.CompletionItemKind.Module,
  TABLE = 5, // monaco.languages.CompletionItemKind.Class,
  VARIABLE = 4, // monaco.languages.CompletionItemKind.Variable,
}
