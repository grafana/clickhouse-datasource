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

    const actual = formatSql(input, 2);
    expect(actual).toContain('$__conditionalAll(');
    expect(actual).toContain('ServiceName IN (${service:singlequote})');
    expect(actual).toContain('$service');
    expect(actual).not.toContain('$ {');
  });

  it('keeps variables that are part of a table name', () => {
    const input = 'SELECT * FROM ${database}.otel_${env}_logs WHERE x = 1';
    const expected = 'SELECT\n  *\nFROM\n  ${database}.otel_${env}_logs\nWHERE\n  x = 1';

    expect(formatSql(input, 2)).toBe(expected);
  });

  it('leaves template syntax inside strings and comments alone', () => {
    const input = "-- $__timeFilter(x) in a comment\nSELECT a /* ${v} */ FROM t WHERE ServiceName = '${service}'";

    const actual = formatSql(input, 2);
    expect(actual).toContain('-- $__timeFilter(x) in a comment');
    expect(actual).toContain('/* ${v} */');
    expect(actual).toContain("ServiceName = '${service}'");
  });

  it('formats ClickHouse syntax', () => {
    const input =
      "SELECT arrayMap(x -> x * 2, arr) AS d, ResourceAttributes['service.name'] AS svc FROM t ARRAY JOIN arr WHERE id = {id:UInt32} SETTINGS max_threads = 1";
    const expected =
      "SELECT\n  arrayMap(x -> x * 2, arr) AS d,\n  ResourceAttributes['service.name'] AS svc\nFROM\n  t\n  ARRAY JOIN arr\nWHERE\n  id = {id:UInt32}\nSETTINGS\n  max_threads = 1";

    expect(formatSql(input, 2)).toBe(expected);
  });

  it('keeps here-documents as typed', () => {
    const input = "SELECT $$it's a heredoc$$ AS s, $doc$tagged 'one'$doc$ AS t";

    const actual = formatSql(input, 2);
    expect(actual).toContain("$$it's a heredoc$$ AS s");
    expect(actual).toContain("$doc$tagged 'one'$doc$ AS t");
  });

  it('returns a query it cannot format unchanged', () => {
    const input = "SELECT 'unterminated FROM t";

    expect(formatSql(input, 2)).toBe(input);
  });

  it('does not confuse its placeholders with names already in the query', () => {
    const input = 'SELECT grafana_template_0_ FROM t WHERE $__timeFilter(ts)';
    const expected = 'SELECT\n  grafana_template_0_\nFROM\n  t\nWHERE\n  $__timeFilter(ts)';

    expect(formatSql(input, 2)).toBe(expected);
  });

  it('only joins the bracket to a macro when it was joined in the query', () => {
    const input = 'SELECT 1 FROM t WHERE $__timeFilter (ts)';

    expect(formatSql(input, 2)).toContain('$__timeFilter (ts)');
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
});
