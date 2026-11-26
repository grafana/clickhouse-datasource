import { formatSql, registerSQL } from './sqlProvider';

describe('SQL Formatter', () => {
  it('formats SQL', () => {
    const input = 'SELECT 1, 2, 3 FROM test LIMIT 1';
    const expected = 'SELECT\n 1,\n 2,\n 3\nFROM\n test\nLIMIT\n 1';

    const actual = formatSql(input, 1);
    expect(actual).toBe(expected);
  });

  it('keeps macro arguments attached to the macro name', () => {
    const input =
      'SELECT $__timeInterval(Timestamp) AS time, count() FROM t WHERE $__timeFilter(Timestamp) GROUP BY time';
    const expected =
      'SELECT\n  $__timeInterval(Timestamp) AS time,\n  count()\nFROM\n  t\nWHERE\n  $__timeFilter(Timestamp)\nGROUP BY\n  time';

    expect(formatSql(input, 2)).toBe(expected);
  });

  it('keeps template variables with a format option intact', () => {
    const input = 'SELECT t FROM x WHERE $__conditionalAll(ServiceName IN (${service:singlequote}), $service)';
    const expected =
      'SELECT\n  t\nFROM\n  x\nWHERE\n  $__conditionalAll(\n    ServiceName IN (${service:singlequote}),\n    $service\n  )';

    expect(formatSql(input, 2)).toBe(expected);
  });

  it('formats queries with backtick-quoted columns', () => {
    const input = 'SELECT count() FROM otel_logs WHERE `deployment.environment.name` IN (${env:singlequote})';
    const expected =
      'SELECT\n  count()\nFROM\n  otel_logs\nWHERE\n  `deployment.environment.name` IN (${env:singlequote})';

    expect(formatSql(input, 2)).toBe(expected);
  });

  it('keeps variables that are part of a table name', () => {
    const input = 'SELECT * FROM ${database}.otel_${env}_logs WHERE x = 1';
    const expected = 'SELECT\n  *\nFROM\n  ${database}.otel_${env}_logs\nWHERE\n  x = 1';

    expect(formatSql(input, 2)).toBe(expected);
  });

  it('keeps bracket variables intact', () => {
    const input = 'SELECT * FROM otel_[[env]]_logs WHERE a IN ([[v:csv]]) AND b = [[w]]';
    const expected = 'SELECT\n  *\nFROM\n  otel_[[env]]_logs\nWHERE\n  a IN ([[v:csv]])\n  AND b = [[w]]';

    expect(formatSql(input, 2)).toBe(expected);
  });

  it('leaves template syntax inside strings and comments alone', () => {
    const input = "-- $__timeFilter(x) in a comment\nSELECT a /* ${v} */ FROM t WHERE ServiceName = '${service}'";
    const expected =
      "-- $__timeFilter(x) in a comment\nSELECT\n  a /* ${v} */\nFROM\n  t\nWHERE\n  ServiceName = '${service}'";

    expect(formatSql(input, 2)).toBe(expected);
  });

  it('formats ClickHouse syntax', () => {
    const input =
      "SELECT arrayMap(x -> x * 2, arr) AS d, ResourceAttributes['service.name'] AS svc FROM t ARRAY JOIN arr WHERE id = {id:UInt32} SETTINGS max_threads = 1";
    const expected =
      "SELECT\n  arrayMap(x -> x * 2, arr) AS d,\n  ResourceAttributes['service.name'] AS svc\nFROM\n  t\n  ARRAY JOIN arr\nWHERE\n  id = {id:UInt32}\nSETTINGS\n  max_threads = 1";

    expect(formatSql(input, 2)).toBe(expected);
  });

  it('formats queries with JSON path syntax', () => {
    const input =
      'SELECT json.^a, json.a.b.:Int64, json.c.:`Array(Nullable(Int64))` FROM t WHERE json.^a.b IS NOT NULL';
    const expected =
      'SELECT\n  json.^a,\n  json.a.b.:Int64,\n  json.c.:`Array(Nullable(Int64))`\nFROM\n  t\nWHERE\n  json.^a.b IS NOT NULL';

    expect(formatSql(input, 2)).toBe(expected);
  });

  it('keeps here-documents as typed', () => {
    const input = "SELECT $$it's a heredoc$$ AS s, $doc$tagged 'one'$doc$ AS t";
    const expected = "SELECT\n  $$it's a heredoc$$ AS s,\n  $doc$tagged 'one'$doc$ AS t";

    expect(formatSql(input, 2)).toBe(expected);
  });

  it('keeps hex and binary strings whole', () => {
    const input = "SELECT x'4142' AS h, b'01000001' AS b FROM t WHERE c = X'43'";
    const expected = "SELECT\n  x'4142' AS h,\n  b'01000001' AS b\nFROM\n  t\nWHERE\n  c = X'43'";

    expect(formatSql(input, 2)).toBe(expected);
  });

  it('keeps a bare interval in a macro', () => {
    const input =
      'SELECT $__timeGroup(Timestamp, 5m) AS time, count() FROM t WHERE $__timeFilter(Timestamp) GROUP BY time';
    const expected =
      'SELECT\n  $__timeGroup(Timestamp, 5m) AS time,\n  count()\nFROM\n  t\nWHERE\n  $__timeFilter(Timestamp)\nGROUP BY\n  time';

    expect(formatSql(input, 2)).toBe(expected);
  });

  it.each([
    [
      'a compound duration',
      'SELECT $__timeGroup(ts, 1h30m) AS time FROM t',
      'SELECT\n  $__timeGroup(ts, 1h30m) AS time\nFROM\n  t',
    ],
    [
      'the interval in $__fromGrafanaInterval',
      'SELECT toStartOfInterval(ts, INTERVAL $__fromGrafanaInterval(500ms)) AS time FROM t',
      'SELECT\n  toStartOfInterval(\n    ts,\n    INTERVAL $__fromGrafanaInterval(500ms)\n  ) AS time\nFROM\n  t',
    ],
    ['a name that starts with a digit', 'SELECT 5m, t.1h AS x FROM t', 'SELECT\n  5m,\n  t.1h AS x\nFROM\n  t'],
    ['a digit word joined to a variable', 'SELECT 5m_${env} FROM t', 'SELECT\n  5m_${env}\nFROM\n  t'],
  ])('keeps %s intact', (_label, input, expected) => {
    expect(formatSql(input, 2)).toBe(expected);
  });

  it('returns a query it cannot format unchanged', () => {
    const input = "SELECT 'unterminated FROM t";

    expect(formatSql(input, 2)).toBe(input);
  });

  it('returns a query with a nested block comment unchanged', () => {
    const input = 'SELECT a /* x /* y */ z */ FROM t WHERE $__timeFilter(ts)';

    expect(formatSql(input, 2)).toBe(input);
  });

  it('returns a query with a // comment unchanged', () => {
    const input = 'SELECT a // why\nFROM t WHERE $__timeFilter(ts)';

    expect(formatSql(input, 2)).toBe(input);
  });

  it('does not confuse its placeholders with names already in the query', () => {
    const input = 'SELECT grafana_template_0_ FROM t WHERE $__timeFilter(ts)';
    const expected = 'SELECT\n  grafana_template_0_\nFROM\n  t\nWHERE\n  $__timeFilter(ts)';

    expect(formatSql(input, 2)).toBe(expected);
  });

  it('only joins the bracket to a macro when it was joined in the query', () => {
    const input = 'SELECT 1 FROM t WHERE $__timeFilter (ts)';
    const expected = 'SELECT\n  1\nFROM\n  t\nWHERE\n  $__timeFilter (ts)';

    expect(formatSql(input, 2)).toBe(expected);
  });
});

describe('registerSQL', () => {
  it('disposes the completion and formatting providers when dispose() is called', () => {
    const disposables: Array<{ dispose: jest.Mock }> = [];
    const makeDisposable = () => {
      const d = { dispose: jest.fn() };
      disposables.push(d);
      return d;
    };

    (window as any).monaco = {
      languages: {
        registerCompletionItemProvider: jest.fn(makeDisposable),
        registerDocumentFormattingEditProvider: jest.fn(makeDisposable),
      },
      editor: {} as any,
    };

    const editor: any = { updateOptions: jest.fn() };
    const fetcher = jest.fn();

    const registration = registerSQL('sql', editor, fetcher);
    expect(disposables).toHaveLength(2);
    disposables.forEach((d) => expect(d.dispose).not.toHaveBeenCalled());

    registration.dispose();
    disposables.forEach((d) => expect(d.dispose).toHaveBeenCalledTimes(1));
  });

  it('registers a fresh pair of providers on each call (caller must dispose)', () => {
    const completionRegister = jest.fn(() => ({ dispose: jest.fn() }));
    const formattingRegister = jest.fn(() => ({ dispose: jest.fn() }));

    (window as any).monaco = {
      languages: {
        registerCompletionItemProvider: completionRegister,
        registerDocumentFormattingEditProvider: formattingRegister,
      },
      editor: {} as any,
    };

    const editor: any = { updateOptions: jest.fn() };

    registerSQL('sql', editor, jest.fn());
    registerSQL('sql', editor, jest.fn());

    expect(completionRegister).toHaveBeenCalledTimes(2);
    expect(formattingRegister).toHaveBeenCalledTimes(2);
  });

  it('does not open suggestions on a space, so Enter after one starts a new line', () => {
    const completionRegister = jest.fn((_lang: string, _provider: { triggerCharacters: string[] }) => ({
      dispose: jest.fn(),
    }));
    (window as any).monaco = {
      languages: {
        registerCompletionItemProvider: completionRegister,
        registerDocumentFormattingEditProvider: jest.fn(() => ({ dispose: jest.fn() })),
      },
      editor: {} as any,
    };

    registerSQL('sql', { updateOptions: jest.fn() } as any, jest.fn());

    expect(completionRegister.mock.calls[0][1].triggerCharacters).toEqual(['.', '$']);
  });
});
