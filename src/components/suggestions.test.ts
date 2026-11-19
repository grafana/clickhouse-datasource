import { SqlFunction, TableColumn } from 'types/queryBuilder';
import { getSuggestions, Schema } from './suggestions';
import { Range } from './sqlProvider';
import { pluginMacros } from 'ch-parser/pluginMacros';

jest.mock('@grafana/runtime', () => ({
  getTemplateSrv: () => ({
    getVariables: () => [{ name: 'table' }, { name: 'database' }],
    replace: (s: string) => s,
  }),
}));

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
        { name: 'toDateTime', origin: 'System' } as SqlFunction,
        { name: 'toDateTime', origin: 'System' } as SqlFunction,
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
        { label: 'query', name: 'query', type: 'String' } as TableColumn,
        { label: 'EventDate', name: 'EventDate', type: 'DateTime' } as TableColumn,
      ],
      functions: async (): Promise<SqlFunction[]> => [
        { name: 'toDateTime', origin: 'System' } as SqlFunction,
        { name: '__actionName', origin: 'System' } as SqlFunction,
        { name: '__my_helper', origin: 'SQLUserDefined' } as SqlFunction,
      ],
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
          Keyword: 13,
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
      // Monaco never includes `$` in the word it scores against, so macros must be
      // filtered on their name without it.
      expect(macroSuggestion?.filterText).toBe(macro.name.substring(1));
    }

    // Should have current columns in context
    const columnQuery = suggestionsByLabel.get('query');
    expect(columnQuery).not.toBeUndefined();

    // Should show unused columns from table
    const columnEventDate = suggestionsByLabel.get('EventDate');
    expect(columnEventDate).not.toBeUndefined();

    // Should show functions. Every built-in reports `origin: 'System'`, including ordinary
    // ones, so this guards against the internal-function filter keying on origin alone.
    const functionToDateTime = suggestionsByLabel.get('toDateTime');
    expect(functionToDateTime).not.toBeUndefined();

    // Should hide ClickHouse internal functions, but keep a user-defined one named like them
    expect(suggestionsByLabel.get('__actionName')).toBeUndefined();
    expect(suggestionsByLabel.get('__my_helper')).not.toBeUndefined();

    // Should show NULL where nothing has been typed to exclude it
    expect(suggestionsByLabel.get('NULL')).not.toBeUndefined();
  });

  it('omits NULL when the typed prefix cannot match it', async () => {
    const sql = 'SELECT * FROM system.query_log WHERE $';
    const cursorPosition = sql.length;
    const range: Range = {
      startLineNumber: 0,
      endLineNumber: 0,
      startColumn: cursorPosition,
      endColumn: cursorPosition + 1,
    };

    const schema: Schema = {
      databases: async (): Promise<string[]> => ['system'],
      tables: async (): Promise<string[]> => ['query_log'],
      columns: async (): Promise<TableColumn[]> => [],
      functions: async (): Promise<SqlFunction[]> => [],
      defaultDatabase: 'system',
    };

    (window as any).monaco = {
      languages: {
        CompletionItemKind: { Function: 1, Field: 3, Variable: 4, Class: 5, Module: 8, Keyword: 13 },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      },
    };

    const suggestions = await getSuggestions(sql, schema, range, cursorPosition);
    const labels = suggestions.map((s) => s.label);

    expect(labels).not.toContain('NULL');
    expect(labels).toContain('$__dateFilter');
  });

  it('resolves columns for a keyword-named table (e.g. FROM sample)', async () => {
    // `sample` is a ClickHouse keyword; the parser must still treat it as the
    // FROM table so column suggestions resolve to it.
    const sql = 'SELECT * FROM sample WHERE ';
    const cursorPosition = 27; // end of string, in the WHERE clause
    const range: Range = {
      startLineNumber: 0,
      endLineNumber: 0,
      startColumn: cursorPosition,
      endColumn: cursorPosition + 1,
    };

    const schema: Schema = {
      databases: async (): Promise<string[]> => ['default'],
      tables: async (): Promise<string[]> => ['sample'],
      columns: async (_db: string, table: string): Promise<TableColumn[]> =>
        table === 'sample'
          ? [{ label: 'ServiceName', name: 'ServiceName', type: 'String' } as TableColumn]
          : [{ label: 'WRONG_TABLE', name: 'WRONG_TABLE', type: 'String' } as TableColumn],
      functions: async (): Promise<SqlFunction[]> => [],
      defaultDatabase: 'default',
    };

    (window as any).monaco = {
      languages: {
        CompletionItemKind: { Function: 1, Field: 3, Variable: 4, Class: 5, Module: 8 },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      },
    };

    const labels = (await getSuggestions(sql, schema, range, cursorPosition)).map((s) => s.label);
    expect(labels).toContain('ServiceName');
    expect(labels).not.toContain('WRONG_TABLE');
  });

  it('offers Grafana variables when a variable is typed as the FROM table', async () => {
    // The shipped OTel dashboards use `FROM ${database}.otel_traces`, so a
    // `$`-prefixed FROM target must still offer variable completions.
    const sql = 'SELECT * FROM ${';
    const cursorPosition = sql.length;
    const range: Range = {
      startLineNumber: 0,
      endLineNumber: 0,
      startColumn: cursorPosition,
      endColumn: cursorPosition + 1,
    };

    const schema: Schema = {
      databases: async (): Promise<string[]> => ['default'],
      tables: async (): Promise<string[]> => ['otel_logs'],
      columns: async (): Promise<TableColumn[]> => [],
      functions: async (): Promise<SqlFunction[]> => [],
      defaultDatabase: 'default',
    };

    (window as any).monaco = {
      languages: {
        CompletionItemKind: { Function: 1, Field: 3, Variable: 4, Class: 5, Module: 8, Keyword: 13 },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      },
    };

    const labels = (await getSuggestions(sql, schema, range, cursorPosition)).map((s) =>
      typeof s.label === 'string' ? s.label : s.label.label
    );
    expect(labels).toContain('${table}');
    expect(labels).toContain('${database}');
  });
});

describe('Inserting a Grafana variable', () => {
  const schema: Schema = {
    databases: async (): Promise<string[]> => ['otel'],
    tables: async (): Promise<string[]> => ['otel_logs'],
    columns: async (): Promise<TableColumn[]> => [],
    functions: async (): Promise<SqlFunction[]> => [],
    defaultDatabase: 'otel',
  };

  // `sql` marks the cursor with `|`. Returns what picking `${table}` would insert.
  const inserted = async (sql: string) => {
    (window as any).monaco = {
      languages: {
        CompletionItemKind: { Function: 1, Field: 3, Variable: 4, Class: 5, Module: 8, Keyword: 13 },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      },
    };
    const cursorPosition = sql.indexOf('|');
    const range: Range = {
      startLineNumber: 0,
      endLineNumber: 0,
      startColumn: cursorPosition,
      endColumn: cursorPosition,
    };
    const suggestions = await getSuggestions(sql.replace('|', ''), schema, range, cursorPosition);
    return suggestions.find((s) => s.label === '${table}');
  };

  it.each([
    ['nothing of it is typed', 'SELECT * FROM otel_logs WHERE x = |', '${table}'],
    ['a `$` is typed', 'SELECT * FROM otel_logs WHERE x = $|', '{table}'],
    ['part of the name is typed after `$`', 'SELECT * FROM otel_logs WHERE x = $ta|', '{table}'],
    ['`${` is typed as the FROM table', 'SELECT * FROM ${|', 'table}'],
    ['the editor closed the brace after `${`', 'SELECT * FROM ${|}', 'table'],
  ])('inserts only what is missing when %s', async (_label, sql, insertText) => {
    expect(await inserted(sql)).toMatchObject({ insertText, filterText: 'table' });
  });

  // What the query reads after picking `${table}` at `|`. Monaco replaces the word typed before the
  // cursor, which stops at `$` and `{`, and keeps the text after the cursor.
  const afterPicking = async (sql: string) => {
    const [before, after] = sql.split('|');
    const { insertText } = (await inserted(sql))!;
    return before.replace(/\w*$/, () => insertText) + after;
  };

  it.each([
    ['after `$`', 'SELECT * FROM otel_logs WHERE x = $|', 'SELECT * FROM otel_logs WHERE x = ${table}'],
    ['after `${`', 'SELECT * FROM ${|', 'SELECT * FROM ${table}'],
    ['after `${` with the brace the editor closed', 'SELECT * FROM ${|}', 'SELECT * FROM ${table}'],
    [
      'after `$` in a map, keeping the map brace',
      "SELECT * FROM otel_logs WHERE x = {'a': $|}",
      "SELECT * FROM otel_logs WHERE x = {'a': ${table}}",
    ],
    [
      'after `${` in a map, with the brace the editor closed',
      "SELECT * FROM otel_logs WHERE x = {'a': ${|}}",
      "SELECT * FROM otel_logs WHERE x = {'a': ${table}}",
    ],
  ])('closes the variable once %s', async (_label, sql, result) => {
    expect(await afterPicking(sql)).toBe(result);
  });
});

describe('Suggestions for JOIN targets and set operations', () => {
  const column = (name: string): TableColumn => ({ name, label: name, type: 'String', picklistValues: [] });
  const schema: Schema = {
    databases: async () => ['default'],
    tables: async () => ['otel_logs', 'otel_traces'],
    columns: async (_db: string, table: string) =>
      table === 'otel_logs' ? [column('ServiceName')] : [column('WRONG_TABLE')],
    functions: async () => [],
    defaultDatabase: 'default',
  };

  const labelsAt = async (sql: string, cursorPosition = sql.length) => {
    (window as any).monaco = {
      languages: {
        CompletionItemKind: { Function: 1, Field: 3, Variable: 4, Class: 5, Module: 8, Keyword: 13 },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      },
    };
    const range: Range = {
      startLineNumber: 0,
      endLineNumber: 0,
      startColumn: cursorPosition,
      endColumn: cursorPosition + 1,
    };
    const suggestions = await getSuggestions(sql, schema, range, cursorPosition);
    return suggestions.map((s) => (typeof s.label === 'string' ? s.label : s.label.label));
  };

  it.each([
    ['a variable', 'SELECT * FROM otel_logs JOIN ${'],
    ['a variable database', 'SELECT * FROM otel_logs JOIN ${db}.'],
  ])('offers Grafana variables when %s is typed as a JOIN target', async (_label, sql) => {
    const labels = await labelsAt(sql);
    expect(labels).toContain('${table}');
    expect(labels).toContain('${database}');
  });

  it('offers no Grafana variables before the cursor reaches a variable JOIN target', async () => {
    const sql = 'SELECT * FROM otel_logs JOIN ${t}';
    const labels = await labelsAt(sql, sql.indexOf('JOIN'));
    expect(labels).not.toContain('${table}');
  });

  it('does not take a FROM inside a function call for the target being typed', async () => {
    const labels = await labelsAt('SELECT * FROM otel_logs WHERE EXTRACT(DAY FROM ${ts}) = 1');
    expect(labels).not.toContain('${table}');
  });

  it('takes columns from the FROM table in a clause after a variable JOIN target', async () => {
    // A `$`-prefixed JOIN target only stands in while the cursor is in a FROM
    // position, so a later clause keeps the FROM table's columns.
    const labels = await labelsAt('SELECT * FROM otel_logs JOIN ${t} ON a = b WHERE ');
    expect(labels).toContain('ServiceName');
    expect(labels).not.toContain('WRONG_TABLE');
  });

  it.each(['INTERSECT', 'EXCEPT'])('suggests columns after a top-level %s', async (operator) => {
    // Detecting a set operation must keep the column context after it.
    const labels = await labelsAt(`SELECT ServiceName FROM otel_logs ${operator} SELECT `);
    expect(labels).toContain('ServiceName');
  });
});

describe('Suggestions for JSON path columns (#2193)', () => {
  const column = (name: string, type: string): TableColumn => ({ name, label: name, type, picklistValues: [] });
  const schema: Schema = {
    databases: async () => ['e2e_test'],
    tables: async () => ['json_events'],
    columns: async () => [
      column('timestamp', 'DateTime'),
      column('attributes', 'JSON'),
      column('attributes.http.status_code', 'String'),
      column('attributes.level', 'String'),
      column('attributes.weird key', 'Int64'),
    ],
    functions: async () => [],
    defaultDatabase: 'e2e_test',
  };

  const fieldSuggestions = async (sql: string) => {
    (window as any).monaco = {
      languages: {
        CompletionItemKind: { Function: 1, Field: 3, Variable: 4, Class: 5, Module: 8, Keyword: 13 },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      },
    };
    const cursorPosition = sql.length;
    const range: Range = {
      startLineNumber: 0,
      endLineNumber: 0,
      startColumn: cursorPosition,
      endColumn: cursorPosition + 1,
    };
    const suggestions = await getSuggestions(sql, schema, range, cursorPosition);
    return suggestions.filter((s) => s.kind === 3).map((s) => [s.label, s.filterText, s.insertText]);
  };

  it('lists only the paths under the typed column after `column.`', async () => {
    expect(await fieldSuggestions('SELECT * FROM e2e_test.json_events WHERE attributes.')).toEqual([
      ['attributes.http.status_code', 'http.status_code', 'http.status_code'],
      ['attributes.level', 'level', 'level'],
      ['attributes.weird key', 'weird key', '`weird key`'],
    ]);
  });

  it('filters and inserts the rest of the path after a partly typed segment', async () => {
    expect(await fieldSuggestions('SELECT * FROM e2e_test.json_events WHERE attributes.ht')).toEqual([
      ['attributes.http.status_code', 'http.status_code', 'http.status_code'],
    ]);
  });

  it('starts the insert text after the last dot of a nested prefix', async () => {
    expect(await fieldSuggestions('SELECT * FROM e2e_test.json_events WHERE attributes.http.')).toEqual([
      ['attributes.http.status_code', 'status_code', 'status_code'],
    ]);
  });

  it('inserts the whole name when no segment is typed', async () => {
    const suggestions = await fieldSuggestions('SELECT * FROM e2e_test.json_events WHERE ');

    expect(suggestions).toContainEqual(['attributes.level', 'attributes.level', 'attributes.level']);
    expect(suggestions).toContainEqual(['attributes.weird key', 'attributes.weird key', 'attributes.`weird key`']);
  });
});

describe('Suggestions for Map keys', () => {
  const column = (name: string, type: string): TableColumn => ({ name, label: name, type, picklistValues: [] });
  const mapKeys = jest.fn(async (_db: string, _table: string, mapColumn: string) =>
    mapColumn === 'LogAttributes' ? ['service.name', 'http.status_code', "it's", 'back\\slash'] : ['host.name']
  );
  const schema: Schema = {
    databases: async () => ['otel'],
    tables: async () => ['otel_logs'],
    columns: async () => [
      column('Timestamp', 'DateTime64(9)'),
      column('Body', 'String'),
      column('LogAttributes', 'Map(LowCardinality(String), String)'),
      column('ResourceAttributes', 'Map(LowCardinality(String), String)'),
      column('Tags', 'Array(String)'),
    ],
    functions: async () => [],
    mapKeys,
    defaultDatabase: 'otel',
  };

  const suggest = async (sql: string, cursorPosition = sql.length) => {
    (window as any).monaco = {
      languages: {
        CompletionItemKind: { Function: 1, Field: 3, Variable: 4, Class: 5, Module: 8, Keyword: 13 },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      },
    };
    const range: Range = {
      startLineNumber: 0,
      endLineNumber: 0,
      startColumn: cursorPosition,
      endColumn: cursorPosition + 1,
    };
    return getSuggestions(sql, schema, range, cursorPosition);
  };
  const keys = (items: Array<{ label: unknown; insertText: string }>) => items.map((s) => [s.label, s.insertText]);

  beforeEach(() => mapKeys.mockClear());

  it("lists the keys of the Map column after `column['`", async () => {
    const suggestions = await suggest("SELECT count() FROM otel.otel_logs WHERE LogAttributes['");

    expect(keys(suggestions)).toEqual([
      ['service.name', 'service.name'],
      ['http.status_code', 'http.status_code'],
      ["it's", "it\\'s"],
      ['back\\slash', 'back\\\\slash'],
    ]);
    expect(mapKeys).toHaveBeenCalledWith('otel', 'otel_logs', 'LogAttributes');
  });

  it('lists the keys between the quote and bracket the editor closes automatically', async () => {
    const sql = "SELECT count() FROM otel.otel_logs WHERE ResourceAttributes['']";

    expect(keys(await suggest(sql, sql.length - 2))).toEqual([['host.name', 'host.name']]);
  });

  it('filters by the typed key and replaces all of it, dots included', async () => {
    const sql = "SELECT count() FROM otel.otel_logs WHERE LogAttributes['service.n']";
    const cursorPosition = sql.length - 2;

    const suggestions = await suggest(sql, cursorPosition);

    expect(keys(suggestions)).toEqual([['service.name', 'service.name']]);
    expect(suggestions[0].range).toEqual({
      startLineNumber: 0,
      endLineNumber: 0,
      startColumn: sql.indexOf("['") + 3,
      endColumn: cursorPosition + 1,
    });
  });

  it('reads a backtick-quoted Map column', async () => {
    const suggestions = await suggest("SELECT count() FROM otel.otel_logs WHERE `LogAttributes`['ht");

    expect(keys(suggestions)).toEqual([['http.status_code', 'http.status_code']]);
  });

  it('keeps the usual suggestions for a column that is not a Map', async () => {
    const suggestions = await suggest("SELECT count() FROM otel.otel_logs WHERE Tags['");

    expect(suggestions.map((s) => s.label)).toContain('Body');
    expect(mapKeys).not.toHaveBeenCalled();
  });

  it('keeps the usual suggestions in a value string after a subscript', async () => {
    const suggestions = await suggest("SELECT count() FROM otel.otel_logs WHERE LogAttributes['service.name'] = '");

    expect(suggestions.map((s) => s.label)).not.toContain('service.name');
    expect(mapKeys).not.toHaveBeenCalled();
  });

  it('keeps the usual suggestions outside a subscript', async () => {
    const suggestions = await suggest('SELECT count() FROM otel.otel_logs WHERE ');
    const labels = suggestions.map((s) => s.label);

    expect(labels).toEqual(expect.arrayContaining(['Body', 'LogAttributes']));
    expect(labels).not.toContain('service.name');
    expect(mapKeys).not.toHaveBeenCalled();
  });
});

describe('Suggestions in queries with CTEs', () => {
  const column = (name: string): TableColumn => ({ name, label: name, type: 'String', picklistValues: [] });
  const tableColumns: Record<string, TableColumn[]> = {
    'otel.otel_logs': [column('ServiceName'), column('Body'), column('Timestamp')],
    'telemetry.otel_metrics_histogram': [column('TimeUnix'), column('MetricName'), column('Count')],
    'default.logs': [column('Severity'), column('Message')],
  };
  const schema: Schema = {
    databases: async () => ['otel', 'telemetry'],
    tables: async () => ['otel_logs'],
    columns: async (db: string, table: string) => tableColumns[`${db}.${table}`] ?? [column('WRONG_TABLE')],
    functions: async () => [],
    defaultDatabase: 'default',
  };

  // `sql` marks the cursor with `|`.
  const fieldsAt = async (sql: string) => {
    (window as any).monaco = {
      languages: {
        CompletionItemKind: { Function: 1, Field: 3, Variable: 4, Class: 5, Module: 8, Keyword: 13 },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      },
    };
    const cursorPosition = sql.indexOf('|');
    const range: Range = {
      startLineNumber: 0,
      endLineNumber: 0,
      startColumn: cursorPosition,
      endColumn: cursorPosition + 1,
    };
    const suggestions = await getSuggestions(sql.replace('|', ''), schema, range, cursorPosition);
    return suggestions.filter((s) => s.kind === 3);
  };
  const labels = async (sql: string) => (await fieldsAt(sql)).map((s) => s.label);

  it('suggests the table columns inside a CTE body that is still being typed', async () => {
    expect(await labels('WITH per_series AS (SELECT count() FROM otel.otel_logs WHERE |')).toEqual([
      'ServiceName',
      'Body',
      'Timestamp',
    ]);
  });

  it('suggests the table columns inside a finished CTE body', async () => {
    expect(await labels('WITH x AS (SELECT count() FROM otel.otel_logs WHERE |) SELECT * FROM x')).toContain(
      'ServiceName'
    );
  });

  it('suggests the columns a CTE passes through with *', async () => {
    expect(await labels('WITH x AS (SELECT * FROM otel.otel_logs) SELECT * FROM x WHERE |')).toEqual([
      'ServiceName',
      'Body',
      'Timestamp',
    ]);
  });

  it('suggests only the columns and aliases a CTE selects', async () => {
    const sql =
      'WITH x AS (SELECT ServiceName, count() AS n, toStartOfHour(Timestamp) AS h FROM otel.otel_logs GROUP BY ServiceName, h) SELECT * FROM x WHERE |';
    expect(await labels(sql)).toEqual(['ServiceName', 'n', 'h']);
  });

  it('follows chained CTEs to the table', async () => {
    const sql = 'WITH a AS (SELECT * FROM otel.otel_logs), b AS (SELECT *, 1 AS one FROM a) SELECT * FROM b WHERE |';
    expect(await labels(sql)).toEqual(['ServiceName', 'Body', 'Timestamp', 'one']);
  });

  it('resolves a CTE named in the FROM of another CTE body', async () => {
    const sql = 'WITH a AS (SELECT ServiceName AS svc FROM otel.otel_logs), b AS (SELECT * FROM a WHERE |';
    expect(await labels(sql)).toEqual(['svc']);
  });

  it('takes the columns of the CTE the FROM names when there are several', async () => {
    const sql =
      'WITH a AS (SELECT 1 AS from_a FROM otel.otel_logs), b AS (SELECT 2 AS from_b FROM otel.otel_logs) SELECT * FROM b WHERE |';
    expect(await labels(sql)).toEqual(['from_b']);
  });

  it('ranks CTE columns with table columns', async () => {
    const [first] = await fieldsAt('WITH x AS (SELECT 1 AS n FROM otel.otel_logs) SELECT * FROM x WHERE |');
    expect(first.sortText).toBe('!!!!n');
  });

  // ClickHouse resolves a CTE that is still being resolved as a table, so the inner `logs` reads the
  // table `logs`.
  it('reads the table a CTE names inside its own body', async () => {
    expect(await labels('WITH logs AS (SELECT * FROM logs) SELECT * FROM logs WHERE |')).toEqual([
      'Severity',
      'Message',
    ]);
  });

  it.each([
    ['in its select list', 'WITH logs AS (SELECT | FROM logs) SELECT * FROM logs'],
    ['in its select list while the body is still being typed', 'WITH logs AS (SELECT | FROM logs'],
    ['in a subquery of its body', 'WITH logs AS (SELECT * FROM (SELECT | FROM logs)) SELECT * FROM logs'],
  ])('suggests the table columns inside a CTE body that names the CTE %s', async (_label, sql) => {
    expect(await labels(sql)).toEqual(['Severity', 'Message']);
  });

  it('reads the table when two CTEs name each other', async () => {
    const sql = 'WITH logs AS (SELECT * FROM b), b AS (SELECT * FROM logs) SELECT * FROM logs WHERE |';
    expect(await labels(sql)).toEqual(['Severity', 'Message']);
  });

  // In the body of `logs`, `b` reads the CTE, and the `logs` that `b` reads is the table, because
  // `logs` is still being defined there.
  it('reads the table when two CTEs name each other, inside the first body', async () => {
    const sql = 'WITH logs AS (SELECT | FROM b), b AS (SELECT * FROM logs) SELECT * FROM logs';
    expect(await labels(sql)).toEqual(['Severity', 'Message']);
  });

  // In a set operation the first select names the columns.
  it.each([
    [
      'its select list',
      'WITH x AS (SELECT ServiceName AS svc FROM otel.otel_logs UNION ALL SELECT MetricName FROM telemetry.otel_metrics_histogram) SELECT * FROM x WHERE |',
      ['svc'],
    ],
    [
      'the table its * reads',
      'WITH x AS (SELECT * FROM otel.otel_logs UNION ALL SELECT * FROM telemetry.otel_metrics_histogram) SELECT * FROM x WHERE |',
      ['ServiceName', 'Body', 'Timestamp'],
    ],
    [
      'its select list when it has no FROM',
      'WITH x AS (SELECT 1 AS one UNION ALL SELECT MetricName FROM telemetry.otel_metrics_histogram) SELECT * FROM x WHERE |',
      ['one'],
    ],
  ])('takes the columns of the first select of a UNION in a CTE: %s', async (_label, sql, expected) => {
    expect(await labels(sql)).toEqual(expected);
  });

  describe('in an OTel histogram query built from CTEs', () => {
    const query = (perSeriesCursor: string, finalCursor: string) => `WITH 60 AS step_s,
per_series AS (
  SELECT toStartOfInterval(TimeUnix, INTERVAL step_s SECOND) AS t, SeriesHash AS sh,
    multiIf(Attributes['success'] = 'false', 'failed', 'success') AS outcome,
    argMax(toFloat64(Count), TimeUnix) AS v
  FROM telemetry.otel_metrics_histogram
  WHERE MetricName = 'm' AND $__conditionalAll(ServiceName IN (\${service:singlequote}), $service) AND ${perSeriesCursor}
  GROUP BY t, sh, outcome
),
lagged AS (
  SELECT t, outcome, v,
    lagInFrame(v, 1, toFloat64(-1)) OVER (PARTITION BY sh ORDER BY t ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS pv
  FROM per_series
)
SELECT t AS time, outcome AS series, sum(multiIf(pv < 0, 0, v >= pv, v - pv, v)) / step_s AS value
FROM lagged WHERE t >= $__fromTime AND ${finalCursor}
GROUP BY time, series ORDER BY time`;

    it('suggests the histogram table columns in the WHERE of per_series', async () => {
      expect(await labels(query('|', ''))).toEqual(['TimeUnix', 'MetricName', 'Count']);
    });

    it('suggests the columns of lagged in the outer WHERE', async () => {
      expect(await labels(query('', '|'))).toEqual(['t', 'outcome', 'v', 'pv']);
    });
  });
});
