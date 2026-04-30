import { SqlFunction, TableColumn } from 'types/queryBuilder';
import { getSuggestions, Schema } from './suggestions';
import { Range } from './sqlProvider';
import { pluginMacros } from 'ch-parser/pluginMacros';

describe('Suggestions', () => {
  it('matches columns case-insensitively when a prefix is typed', async () => {
    // User types lowercase "codefile" but the column is named "CodeFile"
    const sql = 'SELECT codefile FROM system.query_log';
    //                          ^ cursor here (position 15, end of "codefile")
    const cursorPosition = 15;
    const range: Range = {
      startLineNumber: 0,
      endLineNumber: 0,
      startColumn: cursorPosition,
      endColumn: cursorPosition + 1,
    };

    const schema: Schema = {
      databases: async (): Promise<string[]> => ['system'],
      tables: async (): Promise<string[]> => ['query_log'],
      columns: async (): Promise<TableColumn[]> => [
        { label: 'CodeFile', name: 'CodeFile', type: 'String' } as TableColumn,
        { label: 'EventDate', name: 'EventDate', type: 'DateTime' } as TableColumn,
      ],
      functions: async (): Promise<SqlFunction[]> => [],
      defaultDatabase: 'system',
    };

    (window as any).monaco = {
      languages: {
        CompletionItemKind: { Function: 1, Field: 3, Variable: 4, Class: 5, Module: 8 },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      },
    };

    const suggestions = await getSuggestions(sql, schema, range, cursorPosition);
    const labels = suggestions.map((s) => s.label);

    // "CodeFile" should appear even though the user typed "codefile"
    expect(labels).toContain('CodeFile');
    // "EventDate" should not appear — it doesn't start with "codefile"
    expect(labels).not.toContain('EventDate');
  });

  it('dedupes suggestions sharing the same label, kind, and insertText', async () => {
    const sql = 'SELECT  FROM system.query_log';
    //                  ^ cursor here (position 7, inside SELECT clause)
    const cursorPosition = 7;
    const range: Range = {
      startLineNumber: 0,
      endLineNumber: 0,
      startColumn: cursorPosition,
      endColumn: cursorPosition + 1,
    };

    const schema: Schema = {
      databases: async (): Promise<string[]> => ['system'],
      tables: async (): Promise<string[]> => ['query_log'],
      columns: async (): Promise<TableColumn[]> => [
        { label: 'CodeFile', name: 'CodeFile', type: 'String' } as TableColumn,
        { label: 'CodeFile', name: 'CodeFile', type: 'String' } as TableColumn,
        { label: 'EventDate', name: 'EventDate', type: 'DateTime' } as TableColumn,
      ],
      functions: async (): Promise<SqlFunction[]> => [
        { name: 'toDateTime' } as SqlFunction,
        { name: 'toDateTime' } as SqlFunction,
      ],
      defaultDatabase: 'system',
    };

    (window as any).monaco = {
      languages: {
        CompletionItemKind: { Function: 1, Field: 3, Variable: 4, Class: 5, Module: 8, Keyword: 13 },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      },
    };

    const suggestions = await getSuggestions(sql, schema, range, cursorPosition);
    const codeFileMatches = suggestions.filter((s) => s.label === 'CodeFile');
    const toDateTimeMatches = suggestions.filter((s) => s.label === 'toDateTime');

    expect(codeFileMatches).toHaveLength(1);
    expect(toDateTimeMatches).toHaveLength(1);
  });

  it('shows suggestions', async () => {
    const sql = `SELECT number, (SELECT query,  FROM system.query_log LIMIT 1) FROM system.numbers LIMIT 1`;
    const cursorPosition = 30; //         here ^ after "query"
    const range: Range = {
      startLineNumber: 0,
      endLineNumber: 0,
      startColumn: cursorPosition,
      endColumn: cursorPosition + 1,
    };

    const schema: Schema = {
      databases: async (): Promise<string[]> => ['default', 'system'],
      tables: async (db?: string): Promise<string[]> => ['numbers', 'query_log'],
      columns: async (db: string, table: string): Promise<TableColumn[]> => [
        { label: 'query', type: 'String' } as TableColumn,
        { label: 'EventDate', type: 'DateTime' } as TableColumn,
      ],
      functions: async (): Promise<SqlFunction[]> => [{ name: 'toDateTime' } as SqlFunction],
      defaultDatabase: 'default',
    };

    (window as any).monaco = {
      languages: {
        CompletionItemKind: {
          Function: 1,
          Field: 3,
          Variable: 4,
          Class: 5,
          Module: 8,
        },
        CompletionItemInsertTextRule: {
          InsertAsSnippet: 4,
        },
      },
    };

    const suggestions = await getSuggestions(sql, schema, range, cursorPosition);
    const suggestionsByLabel = new Map(suggestions.map((s) => [s.label, s]));

    const columnNumber = suggestionsByLabel.get('number');
    expect(columnNumber).toBeUndefined(); // number is out of scope of the provided subquery

    // Should show all macros
    for (let macro of pluginMacros) {
      const macroSuggestion = suggestionsByLabel.get(macro.name);
      expect(macroSuggestion).not.toBeUndefined();
    }

    // Should have current columns in context
    const columnQuery = suggestionsByLabel.get('query');
    expect(columnQuery).not.toBeUndefined();

    // Should show unused columns from table
    const columnEventDate = suggestionsByLabel.get('EventDate');
    expect(columnEventDate).not.toBeUndefined();

    // Should show functions
    const functionToDateTime = suggestionsByLabel.get('toDateTime');
    expect(functionToDateTime).not.toBeUndefined();
  });
});
