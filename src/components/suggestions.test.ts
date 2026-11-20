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

describe('Suggestions in queries with CTEs', () => {
  const column = (name: string): TableColumn => ({ name, label: name, type: 'String', picklistValues: [] });
  const tableColumns: Record<string, TableColumn[]> = {
    'otel.otel_logs': [column('ServiceName'), column('Body'), column('Timestamp')],
    'telemetry.otel_metrics_histogram': [column('TimeUnix'), column('MetricName'), column('Count')],
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

  it('stops at a CTE that reads from itself', async () => {
    expect(await labels('WITH x AS (SELECT * FROM x) SELECT * FROM x WHERE |')).toEqual([]);
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

describe('Suggestions for qualified names, JOINs and set operations', () => {
  const column = (name: string, type = 'String'): TableColumn => ({ name, label: name, type, picklistValues: [] });
  const logs = ['Timestamp', 'TraceId', 'ServiceName', 'Body'];
  const tableColumns: Record<string, TableColumn[]> = {
    'otel.otel_logs': logs.map((name) => column(name)),
    'otel.otel_traces': [
      column('Timestamp'),
      column('TraceId'),
      column('ServiceName'),
      column('SpanName'),
      column('SpanKind'),
      column('Events.Name', 'Array(LowCardinality(String))'),
      column('Events.Timestamp', 'Array(DateTime64(9))'),
    ],
  };
  const schema: Schema = {
    databases: async () => ['otel'],
    tables: async () => ['otel_logs', 'otel_traces'],
    columns: async (db: string, table: string) => tableColumns[`${db}.${table}`] ?? [column('WRONG_TABLE')],
    functions: async () => [{ name: 'toDateTime', origin: 'System' } as SqlFunction],
    defaultDatabase: 'otel',
  };
  const join = 'FROM otel.otel_logs AS l JOIN otel.otel_traces AS t ON l.TraceId = t.TraceId';

  // `sql` marks the cursor with `|`.
  const suggestionsAt = async (sql: string) => {
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
    return getSuggestions(sql.replace('|', ''), schema, range, cursorPosition);
  };
  const fieldsAt = async (sql: string) => (await suggestionsAt(sql)).filter((s) => s.kind === 3);
  const labels = async (sql: string) => (await fieldsAt(sql)).map((s) => s.label);

  it.each([
    ['an AS alias', `SELECT l.| ${join}`],
    ['an alias without AS', 'SELECT l.| FROM otel.otel_logs l JOIN otel.otel_traces t ON l.TraceId = t.TraceId'],
    ['the table name', 'SELECT otel_logs.| FROM otel.otel_logs'],
    ['the table name of an aliased table', 'SELECT * FROM otel.otel_logs AS l WHERE otel_logs.|'],
    ['the database and table', 'SELECT otel.otel_logs.| FROM otel.otel_logs'],
  ])('offers only the columns of the table that %s names', async (_label, sql) => {
    expect((await suggestionsAt(sql)).map((s) => [s.label, s.insertText])).toEqual(logs.map((name) => [name, name]));
  });

  it.each([
    ['in the select list', `SELECT t.Span| ${join}`],
    [
      'in the ON of a JOIN without AS',
      'SELECT * FROM otel.otel_logs l LEFT JOIN otel.otel_traces t ON l.TraceId = t.Span|',
    ],
  ])('offers the columns of a JOIN target after its alias %s', async (_label, sql) => {
    expect((await suggestionsAt(sql)).map((s) => [s.label, s.insertText])).toEqual([
      ['SpanName', 'SpanName'],
      ['SpanKind', 'SpanKind'],
    ]);
  });

  it('offers the paths under a column after its table alias', async () => {
    const fields = await fieldsAt('SELECT t.Events.| FROM otel.otel_traces AS t');
    expect(fields.map((s) => [s.label, s.insertText])).toEqual([
      ['Events.Name', 'Name'],
      ['Events.Timestamp', 'Timestamp'],
    ]);
  });

  it.each([
    ['the select list', `SELECT | ${join}`],
    ['WHERE', `SELECT * ${join} WHERE |`],
    ['ON', 'SELECT * FROM otel.otel_logs AS l JOIN otel.otel_traces AS t ON |'],
    ['GROUP BY', `SELECT count() ${join} GROUP BY |`],
    ['HAVING', `SELECT count() ${join} GROUP BY ServiceName HAVING |`],
    ['ORDER BY', `SELECT * ${join} ORDER BY |`],
  ])('offers the columns of every joined table in %s', async (_label, sql) => {
    expect(await labels(sql)).toEqual(expect.arrayContaining(['Body', 'SpanName', 'Events.Name']));
  });

  it('offers a column that both tables have once for each, qualified with its alias', async () => {
    const fields = await fieldsAt(`SELECT * ${join} WHERE Trace|`);
    expect(fields.map((s) => [s.label, s.insertText, s.filterText])).toEqual([
      ['l.TraceId', 'l.TraceId', 'TraceId'],
      ['t.TraceId', 't.TraceId', 'TraceId'],
    ]);
  });

  it('qualifies a shared column with the table name when the tables have no alias', async () => {
    const offered = await labels('SELECT * FROM otel.otel_logs JOIN otel.otel_traces ON |');
    expect(offered).toEqual(expect.arrayContaining(['Body', 'SpanName', 'otel_logs.TraceId', 'otel_traces.TraceId']));
    expect(offered).not.toContain('TraceId');
  });

  it.each([
    ['with aliases', 'SELECT * FROM otel.otel_logs AS l JOIN otel.otel_traces AS t USING (|'],
    ['without aliases', 'SELECT * FROM otel.otel_logs JOIN otel.otel_traces USING (|'],
  ])('offers bare names in USING %s', async (_label, sql) => {
    const offered = await labels(sql);
    expect(offered).toEqual(expect.arrayContaining(['TraceId', 'SpanName']));
    expect(offered).not.toContain('l.TraceId');
    expect(offered).not.toContain('otel_logs.TraceId');
  });

  it('offers the columns of a joined CTE', async () => {
    const sql =
      'WITH s AS (SELECT ServiceName AS svc FROM otel.otel_logs) SELECT * FROM otel.otel_traces AS t JOIN s ON t.ServiceName = s.|';
    expect(await labels(sql)).toEqual(['svc']);
  });

  it.each(['UNION', 'UNION ALL', 'EXCEPT', 'INTERSECT'])(
    'reads the second select of %s against its own FROM',
    async (operator) => {
      expect(
        await labels(`SELECT ServiceName FROM otel.otel_logs ${operator} SELECT Span| FROM otel.otel_traces`)
      ).toEqual(['SpanName', 'SpanKind']);
    }
  );

  it('reads the first select of a set operation against its own FROM', async () => {
    expect(await labels('SELECT | FROM otel.otel_logs UNION ALL SELECT SpanName FROM otel.otel_traces')).toEqual(logs);
  });

  it('reads a set operation in a subquery against the select the cursor is in', async () => {
    const sql = 'SELECT * FROM (SELECT Body FROM otel.otel_logs UNION ALL SELECT | FROM otel.otel_traces WHERE 1)';
    expect(await labels(sql)).toEqual(expect.arrayContaining(['SpanName']));
    expect(await labels(sql)).not.toContain('Body');
  });

  it('lends the tables of the select before to one whose FROM is not typed yet', async () => {
    expect(await labels('SELECT ServiceName FROM otel.otel_logs UNION ALL SELECT |')).toEqual(logs);
  });

  it('offers the fields of an ARRAY JOIN element after its alias', async () => {
    const fields = await fieldsAt('SELECT e.| FROM otel.otel_traces ARRAY JOIN Events AS e');
    expect(fields.map((s) => [s.label, s.insertText, s.detail])).toEqual([
      ['Name', 'Name', 'LowCardinality(String)'],
      ['Timestamp', 'Timestamp', 'DateTime64(9)'],
    ]);
  });

  it('does not read an ARRAY JOIN column as a table', async () => {
    expect(await labels('SELECT * FROM otel.otel_traces ARRAY JOIN Events AS e WHERE |')).not.toContain('WRONG_TABLE');
  });
});

describe('Suggestions for SELECT aliases and FROM subqueries', () => {
  const column = (name: string): TableColumn => ({ name, label: name, type: 'String', picklistValues: [] });
  const logs = ['Timestamp', 'TraceId', 'ServiceName', 'Body'];
  const tableColumns: Record<string, TableColumn[]> = {
    'otel.otel_logs': logs.map(column),
    'otel.otel_traces': ['Timestamp', 'TraceId', 'SpanName'].map(column),
  };
  const schema: Schema = {
    databases: async () => ['otel'],
    tables: async () => ['otel_logs', 'otel_traces'],
    columns: async (db: string, table: string) => tableColumns[`${db}.${table}`] ?? [column('WRONG_TABLE')],
    functions: async () => [{ name: 'count', origin: 'System' } as SqlFunction],
    defaultDatabase: 'otel',
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
  const aliases = 'SELECT ServiceName AS svc, count() AS cnt, toStartOfMinute(Timestamp) AS minute FROM otel.otel_logs';

  it.each([
    ['WHERE', `${aliases} WHERE |`],
    ['GROUP BY', `${aliases} GROUP BY |`],
    ['HAVING', `${aliases} GROUP BY svc, minute HAVING |`],
    ['ORDER BY', `${aliases} GROUP BY svc, minute ORDER BY |`],
  ])('offers the aliases of the select list in %s, next to the columns', async (_label, sql) => {
    expect(await labels(sql)).toEqual([...logs, 'svc', 'cnt', 'minute']);
  });

  it('completes an alias from its first letters', async () => {
    const fields = await fieldsAt(`${aliases} GROUP BY svc ORDER BY cn|`);
    expect(fields.map((s) => [s.label, s.insertText, s.detail])).toEqual([['cnt', 'cnt', 'Alias in SELECT']]);
  });

  it('quotes an alias that is not a plain name', async () => {
    const fields = await fieldsAt('SELECT count() AS "total rows" FROM otel.otel_logs ORDER BY tot|');
    expect(fields.map((s) => [s.label, s.insertText])).toEqual([['total rows', '`total rows`']]);
  });

  it('offers a column once when the select list only names or renames it to itself', async () => {
    const sql = 'SELECT ServiceName, Body AS Body, max(Timestamp) AS Timestamp FROM otel.otel_logs ORDER BY |';
    expect(await labels(sql)).toEqual(logs);
  });

  it('offers no aliases in the select list itself', async () => {
    expect(await labels('SELECT count() AS cnt, | FROM otel.otel_logs')).toEqual(logs);
  });

  it('offers the aliases of the select the cursor is in', async () => {
    const union = 'SELECT count() AS a FROM otel.otel_logs UNION ALL SELECT count() AS b FROM otel.otel_traces';
    expect(await labels(`${union} ORDER BY |`)).toEqual(['Timestamp', 'TraceId', 'SpanName', 'b']);
    expect(await labels(`SELECT * FROM (SELECT ServiceName AS svc FROM otel.otel_logs ORDER BY |)`)).toEqual([
      ...logs,
      'svc',
    ]);
  });

  it('offers the columns a FROM subquery returns', async () => {
    const fields = await fieldsAt(
      'SELECT | FROM (SELECT ServiceName AS svc, count() AS n FROM otel.otel_logs GROUP BY svc)'
    );
    expect(fields.map((s) => [s.label, s.detail])).toEqual([
      ['svc', 'Column of the subquery'],
      ['n', 'Column of the subquery'],
    ]);
  });

  it('offers the table columns that a FROM subquery returns through *', async () => {
    expect(await labels('SELECT * FROM (SELECT * FROM otel.otel_logs) WHERE |')).toEqual(logs);
  });

  it('offers only the columns of a subquery after its alias', async () => {
    const sql = 'SELECT s.| FROM (SELECT ServiceName AS svc, Body FROM otel.otel_logs) AS s';
    expect((await fieldsAt(sql)).map((s) => [s.label, s.insertText, s.detail])).toEqual([
      ['svc', 'svc', 'Column of s'],
      ['Body', 'Body', 'Column of s'],
    ]);
  });

  it('offers the columns of a JOIN subquery after its alias', async () => {
    const sql =
      'SELECT * FROM otel.otel_logs AS l JOIN (SELECT TraceId, SpanName AS span FROM otel.otel_traces) AS t ON l.TraceId = t.|';
    expect(await labels(sql)).toEqual(['TraceId', 'span']);
  });
});
