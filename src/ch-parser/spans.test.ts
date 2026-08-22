import { scanTopLevelSelect, SelectShapeProblem, unquoteIdentifier } from './spans';

/** Returns the scanned select, failing loudly when the scan declined. */
const scanOk = (sql: string) => {
  const result = scanTopLevelSelect(sql);
  if (!result.ok) {
    throw new Error(`expected "${sql}" to scan as a single top-level SELECT, got problem "${result.problem}"`);
  }
  return result.select;
};

/** Returns the problem the scanner reported, or undefined when it accepted the statement. */
const scanProblem = (sql: string): SelectShapeProblem | undefined => {
  const result = scanTopLevelSelect(sql);
  return result.ok ? undefined : result.problem;
};

describe('unquoteIdentifier', () => {
  it('leaves a bare identifier untouched', () => {
    expect(unquoteIdentifier('Timestamp')).toBe('Timestamp');
  });

  it('strips surrounding double quotes', () => {
    expect(unquoteIdentifier('"Timestamp"')).toBe('Timestamp');
  });

  it('strips surrounding backticks', () => {
    expect(unquoteIdentifier('`Timestamp`')).toBe('Timestamp');
  });

  it('unescapes doubled double quotes', () => {
    expect(unquoteIdentifier('"a""b"')).toBe('a"b');
  });

  it('unescapes doubled backticks', () => {
    expect(unquoteIdentifier('`a``b`')).toBe('a`b');
  });

  it('unescapes several doubled quotes in one identifier', () => {
    expect(unquoteIdentifier('"a""b""c"')).toBe('a"b"c');
  });

  it('returns an empty quoted identifier as an empty string', () => {
    expect(unquoteIdentifier('""')).toBe('');
  });

  it('returns strings too short to be quoted as-is', () => {
    expect(unquoteIdentifier('')).toBe('');
    expect(unquoteIdentifier('"')).toBe('"');
    expect(unquoteIdentifier('`')).toBe('`');
  });

  it('does not strip mismatched quote characters', () => {
    expect(unquoteIdentifier('"a`')).toBe('"a`');
    expect(unquoteIdentifier('"a')).toBe('"a');
    expect(unquoteIdentifier('a"')).toBe('a"');
  });

  it('leaves interior quotes alone when the identifier is unquoted', () => {
    expect(unquoteIdentifier('a"b')).toBe('a"b');
  });
});

describe('scanTopLevelSelect', () => {
  describe('happy path', () => {
    const sql =
      'SELECT Timestamp as "timestamp", Body as "body", SeverityText as "level" ' +
      'FROM otel.otel_logs WHERE x = 1 ORDER BY timestamp DESC LIMIT 100';

    it('drops everything from the top-level ORDER BY onwards', () => {
      expect(scanOk(sql).head).toBe(
        'SELECT Timestamp as "timestamp", Body as "body", SeverityText as "level" ' +
          'FROM otel.otel_logs WHERE x = 1\n'
      );
    });

    it('describes each aliased lone identifier in the select list', () => {
      expect(scanOk(sql).items).toEqual([
        { outputName: 'timestamp', sourceIdentifier: 'Timestamp' },
        { outputName: 'body', sourceIdentifier: 'Body' },
        { outputName: 'level', sourceIdentifier: 'SeverityText' },
      ]);
    });
  });

  describe('head', () => {
    const queries = [
      'SELECT a FROM t',
      'SELECT a FROM t   ',
      'SELECT a FROM t\n\n',
      'SELECT a FROM t;',
      'SELECT a FROM t LIMIT 5',
      'SELECT a FROM t ORDER BY a',
      'SELECT a FROM t -- trailing comment',
      'SELECT a FROM (SELECT a FROM u LIMIT 1)',
    ];

    it.each(queries)('always ends with exactly one newline: %s', (sql) => {
      const { head } = scanOk(sql);
      expect(head.endsWith('\n')).toBe(true);
      expect(head.endsWith('\n\n')).toBe(false);
    });

    it('keeps a trailing line comment but terminates it so it cannot swallow what follows', () => {
      const { head } = scanOk('SELECT a FROM t -- pick a column\nORDER BY a LIMIT 5');
      expect(head).toBe('SELECT a FROM t -- pick a column\n');
      // The whole point of the trailing newline: appending is safe.
      expect(`${head})`).toBe('SELECT a FROM t -- pick a column\n)');
    });

    it('terminates a line comment that ends the whole statement', () => {
      expect(scanOk('SELECT a FROM t -- nothing after me').head).toBe('SELECT a FROM t -- nothing after me\n');
    });

    it('strips trailing whitespace before appending the newline', () => {
      expect(scanOk('SELECT a FROM t \t\n  ').head).toBe('SELECT a FROM t\n');
      expect(scanOk('SELECT a FROM t   LIMIT 5').head).toBe('SELECT a FROM t\n');
    });

    it('preserves internal formatting verbatim', () => {
      expect(scanOk('SELECT a,\n  b\nFROM t\nORDER BY a\nLIMIT 5').head).toBe('SELECT a,\n  b\nFROM t\n');
    });
  });

  describe('tail stripping', () => {
    const base = 'SELECT Timestamp FROM otel.otel_logs WHERE x = 1';
    const expected = `${base}\n`;

    it.each([
      ['ORDER BY', `${base} ORDER BY Timestamp DESC`],
      ['LIMIT n', `${base} LIMIT 100`],
      ['LIMIT n, m', `${base} LIMIT 10, 20`],
      ['LIMIT n OFFSET m', `${base} LIMIT 10 OFFSET 20`],
      ['OFFSET on its own', `${base} OFFSET 20`],
      ['FORMAT', `${base} FORMAT JSON`],
      ['a terminating semicolon', `${base};`],
      ['ORDER BY + LIMIT', `${base} ORDER BY Timestamp DESC LIMIT 100`],
      [
        'ORDER BY + LIMIT + OFFSET + FORMAT + semicolon',
        `${base} ORDER BY Timestamp LIMIT 10 OFFSET 5 FORMAT JSONEachRow;`,
      ],
      ['LIMIT + FORMAT + semicolon', `${base} LIMIT 10 FORMAT JSON;`],
      ['lowercase clauses', `${base} order by Timestamp desc limit 5`],
      ['clauses on their own lines', `${base}\nORDER BY Timestamp\nLIMIT 5`],
      ['whitespace after the tail', `${base} LIMIT 5   `],
    ])('strips %s', (_name, sql) => {
      expect(scanOk(sql).head).toBe(expected);
    });

    it('keeps GROUP BY, which is not a droppable tail', () => {
      const sql = 'SELECT toStartOfHour(Timestamp) AS t, count() AS c FROM otel.otel_logs GROUP BY t';
      expect(scanOk(sql).head).toBe(`${sql}\n`);
    });

    it('keeps HAVING, which is not a droppable tail', () => {
      const sql = 'SELECT host, count() AS c FROM t GROUP BY host HAVING c > 1';
      expect(scanOk(sql).head).toBe(`${sql}\n`);
    });

    it('keeps the select list and FROM even when the tail starts immediately', () => {
      expect(scanOk('SELECT a FROM t LIMIT 1').head).toBe('SELECT a FROM t\n');
    });

    it('still reports the select list when a tail is stripped', () => {
      expect(scanOk('SELECT Timestamp, Body FROM t ORDER BY Timestamp LIMIT 5').items).toEqual([
        { outputName: 'Timestamp', sourceIdentifier: 'Timestamp' },
        { outputName: 'Body', sourceIdentifier: 'Body' },
      ]);
    });
  });

  describe('subquery and CTE isolation', () => {
    it('ignores ORDER BY and LIMIT inside a FROM subquery', () => {
      const sql = 'SELECT a FROM (SELECT a FROM t ORDER BY a LIMIT 5)';
      expect(scanOk(sql).head).toBe(`${sql}\n`);
    });

    it('ignores a WHERE inside a FROM subquery and still strips the top-level tail', () => {
      const sql = 'SELECT a FROM (SELECT a FROM t WHERE b = 1) AS x LIMIT 5';
      expect(scanOk(sql).head).toBe('SELECT a FROM (SELECT a FROM t WHERE b = 1) AS x\n');
    });

    it('ignores ORDER BY and LIMIT inside a WITH CTE', () => {
      const sql = 'WITH c AS (SELECT a FROM t WHERE b = 1 ORDER BY a LIMIT 5) SELECT a FROM c';
      expect(scanOk(sql).head).toBe(`${sql}\n`);
    });

    it('ignores SETTINGS inside a subquery', () => {
      const sql = 'SELECT a FROM (SELECT a FROM t SETTINGS max_threads = 4)';
      expect(scanOk(sql).head).toBe(`${sql}\n`);
    });

    it('ignores a set operation inside a subquery', () => {
      const sql = 'SELECT a FROM (SELECT a FROM t UNION ALL SELECT a FROM u)';
      expect(scanOk(sql).head).toBe(`${sql}\n`);
    });

    it('ignores LIMIT BY inside a subquery', () => {
      const sql = 'SELECT a FROM (SELECT a FROM t LIMIT 1 BY a)';
      expect(scanOk(sql).head).toBe(`${sql}\n`);
    });

    it('ignores WITH TOTALS inside a subquery', () => {
      const sql = 'SELECT a, c FROM (SELECT a, count() AS c FROM t GROUP BY a WITH TOTALS)';
      expect(scanOk(sql).head).toBe(`${sql}\n`);
    });

    it('does not count a subquery SELECT towards the single-SELECT rule', () => {
      const sql = 'SELECT a FROM (SELECT a FROM (SELECT a FROM t))';
      expect(scanOk(sql).items).toEqual([{ outputName: 'a', sourceIdentifier: 'a' }]);
    });

    it('takes the top-level FROM, not one nested in the select list', () => {
      const sql = 'SELECT (SELECT max(a) FROM u LIMIT 1) AS m, b FROM t LIMIT 5';
      const select = scanOk(sql);
      expect(select.head).toBe('SELECT (SELECT max(a) FROM u LIMIT 1) AS m, b FROM t\n');
      expect(select.items).toEqual([{ outputName: 'm' }, { outputName: 'b', sourceIdentifier: 'b' }]);
    });
  });

  describe('CTE prefixes', () => {
    it('accepts a table CTE and strips the top-level tail', () => {
      const select = scanOk('WITH x AS (SELECT * FROM t) SELECT Timestamp FROM x LIMIT 5');
      expect(select.head).toBe('WITH x AS (SELECT * FROM t) SELECT Timestamp FROM x\n');
      expect(select.items).toEqual([{ outputName: 'Timestamp', sourceIdentifier: 'Timestamp' }]);
    });

    it('accepts a scalar CTE', () => {
      const sql = 'WITH 5 AS lim SELECT Timestamp FROM t WHERE n >= lim';
      const select = scanOk(sql);
      expect(select.head).toBe(`${sql}\n`);
      expect(select.items).toEqual([{ outputName: 'Timestamp', sourceIdentifier: 'Timestamp' }]);
    });

    it('accepts several CTEs', () => {
      const sql = 'WITH a AS (SELECT 1), b AS (SELECT 2) SELECT x FROM t ORDER BY x';
      expect(scanOk(sql).head).toBe('WITH a AS (SELECT 1), b AS (SELECT 2) SELECT x FROM t\n');
    });

    it('accepts a lowercase with prefix', () => {
      const sql = 'with x as (select * from t) select Timestamp from x limit 5';
      expect(scanOk(sql).head).toBe('with x as (select * from t) select Timestamp from x\n');
    });
  });

  describe('wildcards', () => {
    it('reports a bare asterisk as a wildcard', () => {
      expect(scanOk('SELECT * FROM t').items).toEqual([{ wildcard: true }]);
    });

    it('reports a wildcard alongside other items', () => {
      expect(scanOk('SELECT *, Timestamp FROM t').items).toEqual([
        { wildcard: true },
        { outputName: 'Timestamp', sourceIdentifier: 'Timestamp' },
      ]);
    });

    it('does not report a qualified wildcard as a plain wildcard', () => {
      expect(scanOk('SELECT t.* FROM t').items).toEqual([{}]);
    });

    it('does not report `* EXCEPT (...)` as a plain wildcard', () => {
      // NOTE: the scanner currently declines this statement outright (EXCEPT is matched by text
      // at depth 0, so it is reported as a set operation) rather than returning an item with no
      // names. Either way the caller must not believe it selected every column, which is the
      // property asserted here.
      const result = scanTopLevelSelect('SELECT * EXCEPT (Body) FROM t');
      const items = result.ok ? result.select.items : [];
      expect(items.some((item) => item.wildcard === true)).toBe(false);
    });
  });

  describe('select list items', () => {
    it('reports a lone identifier as both output name and source identifier', () => {
      expect(scanOk('SELECT Timestamp FROM t').items).toEqual([
        { outputName: 'Timestamp', sourceIdentifier: 'Timestamp' },
      ]);
    });

    it('unquotes a double-quoted identifier and its alias', () => {
      expect(scanOk('SELECT "Timestamp" AS "ts" FROM t').items).toEqual([
        { outputName: 'ts', sourceIdentifier: 'Timestamp' },
      ]);
    });

    it('unquotes a backticked identifier and its alias', () => {
      expect(scanOk('SELECT `Timestamp` AS `ts` FROM t').items).toEqual([
        { outputName: 'ts', sourceIdentifier: 'Timestamp' },
      ]);
    });

    it('accepts a lowercase as keyword', () => {
      expect(scanOk('SELECT Timestamp as ts FROM t').items).toEqual([
        { outputName: 'ts', sourceIdentifier: 'Timestamp' },
      ]);
    });

    it('reports no names for an unaliased qualified name', () => {
      expect(scanOk('SELECT l.Timestamp FROM otel.otel_logs AS l').items).toEqual([{}]);
    });

    it('reports no source identifier for an aliased qualified name', () => {
      expect(scanOk('SELECT l.Timestamp AS ts FROM otel.otel_logs AS l').items).toEqual([{ outputName: 'ts' }]);
    });

    it('reports no source identifier for an aliased expression', () => {
      expect(scanOk('SELECT Timestamp - INTERVAL 5 HOUR AS timestamp FROM t').items).toEqual([
        { outputName: 'timestamp' },
      ]);
    });

    it('reports no source identifier for an aliased function call', () => {
      expect(scanOk('SELECT toStartOfHour(Timestamp) AS timestamp FROM t').items).toEqual([
        { outputName: 'timestamp' },
      ]);
    });

    it('reports no names for an unaliased expression', () => {
      expect(scanOk('SELECT count() FROM t').items).toEqual([{}]);
    });

    it('reports no source identifier for an aliased keyword literal', () => {
      expect(scanOk('SELECT NULL AS x FROM t').items).toEqual([{ outputName: 'x' }]);
    });

    it('reports no names when the alias is not a single identifier', () => {
      expect(scanOk("SELECT count() AS 'c' FROM t").items).toEqual([{}]);
    });

    it('does not interpret an implicit (AS-less) alias', () => {
      expect(scanOk('SELECT Timestamp ts FROM t').items).toEqual([{}]);
    });

    it('does not split items on commas inside a function call', () => {
      expect(scanOk('SELECT f(a, b) AS x, Timestamp FROM t').items).toEqual([
        { outputName: 'x' },
        { outputName: 'Timestamp', sourceIdentifier: 'Timestamp' },
      ]);
    });

    it('does not split items on commas inside a tuple', () => {
      expect(scanOk('SELECT (a, b) AS pair, Timestamp FROM t').items).toEqual([
        { outputName: 'pair' },
        { outputName: 'Timestamp', sourceIdentifier: 'Timestamp' },
      ]);
    });

    it('does not treat a nested AS as the item alias', () => {
      expect(scanOk('SELECT f(cast(a AS UInt8)) AS x FROM t').items).toEqual([{ outputName: 'x' }]);
    });

    it('does not attach a leading DISTINCT to the first item', () => {
      expect(scanOk('SELECT DISTINCT Timestamp FROM t').items).toEqual([
        { outputName: 'Timestamp', sourceIdentifier: 'Timestamp' },
      ]);
    });

    it('does not attach a leading DISTINCT to the first item of several', () => {
      expect(scanOk('SELECT DISTINCT Timestamp, Body FROM t').items).toEqual([
        { outputName: 'Timestamp', sourceIdentifier: 'Timestamp' },
        { outputName: 'Body', sourceIdentifier: 'Body' },
      ]);
    });

    it('keeps items in source order', () => {
      expect(scanOk('SELECT c, a, b FROM t').items.map((item) => item.outputName)).toEqual(['c', 'a', 'b']);
    });
  });

  describe('problems', () => {
    describe('LexError', () => {
      it.each([
        ['an unterminated string literal', "SELECT Body FROM t WHERE Body = 'oops"],
        ['an unterminated double-quoted identifier', 'SELECT "Timestamp FROM t'],
        ['an unterminated backquoted identifier', 'SELECT `Timestamp FROM t'],
        ['an unterminated block comment', 'SELECT Timestamp FROM t /* oops'],
      ])('reports %s', (_name, sql) => {
        expect(scanProblem(sql)).toBe(SelectShapeProblem.LexError);
      });
    });

    describe('Unbalanced', () => {
      it('reports an extra closing bracket', () => {
        expect(scanProblem('SELECT a FROM t)')).toBe(SelectShapeProblem.Unbalanced);
      });

      it('reports a missing closing bracket', () => {
        expect(scanProblem('SELECT a FROM (SELECT a FROM t')).toBe(SelectShapeProblem.Unbalanced);
      });

      it('reports a closing bracket that precedes its opener', () => {
        expect(scanProblem('SELECT a FROM t WHERE a IN )1(')).toBe(SelectShapeProblem.Unbalanced);
      });
    });

    describe('NotSingleSelect', () => {
      it.each([
        ['an INSERT', 'INSERT INTO t VALUES (1)'],
        ['a parenthesized SELECT', '(SELECT 1 FROM t)'],
        ['a DESCRIBE', 'DESCRIBE t'],
        ['a SHOW', 'SHOW TABLES'],
        ['two depth-0 SELECTs', 'SELECT a FROM t SELECT b FROM u'],
        ['an empty statement', ''],
        ['whitespace only', '   \n  '],
        ['a comment only', '-- just a comment'],
        ['a FROM before the top-level SELECT', 'WITH a FROM t SELECT b'],
      ])('reports %s', (_name, sql) => {
        expect(scanProblem(sql)).toBe(SelectShapeProblem.NotSingleSelect);
      });
    });

    describe('MultiStatement', () => {
      it('reports two statements separated by a semicolon', () => {
        expect(scanProblem('SELECT 1 FROM t; SELECT 2 FROM t')).toBe(SelectShapeProblem.MultiStatement);
      });

      it('reports a trailing statement even when it is not a SELECT', () => {
        expect(scanProblem('SELECT 1 FROM t; DROP TABLE t')).toBe(SelectShapeProblem.MultiStatement);
      });

      it('does not report a lone terminating semicolon', () => {
        expect(scanOk('SELECT a FROM t;').head).toBe('SELECT a FROM t\n');
      });

      it('does not report a terminating semicolon after a stripped tail', () => {
        expect(scanOk('SELECT a FROM t ORDER BY a LIMIT 5;').head).toBe('SELECT a FROM t\n');
      });
    });

    describe('NoFrom', () => {
      it.each([
        ['a constant select', 'SELECT 1'],
        ['a function select', 'SELECT now()'],
        ['a CTE with no FROM', 'WITH 5 AS x SELECT x'],
      ])('reports %s', (_name, sql) => {
        expect(scanProblem(sql)).toBe(SelectShapeProblem.NoFrom);
      });
    });

    describe('SetOperation', () => {
      it.each([
        ['UNION ALL', 'SELECT a FROM t UNION ALL SELECT a FROM u'],
        ['UNION DISTINCT', 'SELECT a FROM t UNION DISTINCT SELECT a FROM u'],
        ['EXCEPT', 'SELECT a FROM t EXCEPT SELECT a FROM u'],
        ['INTERSECT', 'SELECT a FROM t INTERSECT SELECT a FROM u'],
      ])('reports %s', (_name, sql) => {
        expect(scanProblem(sql)).toBe(SelectShapeProblem.SetOperation);
      });
    });

    describe('IntoOutfile', () => {
      it('reports INTO OUTFILE', () => {
        expect(scanProblem("SELECT a FROM t INTO OUTFILE 'out.csv'")).toBe(SelectShapeProblem.IntoOutfile);
      });

      it('reports INTO OUTFILE followed by FORMAT', () => {
        expect(scanProblem("SELECT a FROM t INTO OUTFILE 'out.csv' FORMAT CSV")).toBe(SelectShapeProblem.IntoOutfile);
      });
    });

    describe('LimitBy', () => {
      it('reports LIMIT n BY', () => {
        expect(scanProblem('SELECT a FROM t LIMIT 2 BY host')).toBe(SelectShapeProblem.LimitBy);
      });

      it('reports LIMIT n, m BY', () => {
        expect(scanProblem('SELECT a FROM t LIMIT 1, 2 BY host')).toBe(SelectShapeProblem.LimitBy);
      });

      it('reports LIMIT BY that follows an ORDER BY tail', () => {
        expect(scanProblem('SELECT a FROM t ORDER BY a LIMIT 2 BY host')).toBe(SelectShapeProblem.LimitBy);
      });

      it('does not confuse a following GROUP BY with LIMIT BY', () => {
        expect(scanOk('SELECT a, count() FROM t GROUP BY a LIMIT 5').head).toBe(
          'SELECT a, count() FROM t GROUP BY a\n'
        );
      });

      it('does not confuse LIMIT n FORMAT with LIMIT BY', () => {
        expect(scanOk('SELECT a FROM t LIMIT 5 FORMAT JSON').head).toBe('SELECT a FROM t\n');
      });
    });

    describe('WithFill', () => {
      it('reports ORDER BY ... WITH FILL', () => {
        expect(scanProblem('SELECT a FROM t ORDER BY t WITH FILL STEP 1')).toBe(SelectShapeProblem.WithFill);
      });

      it('reports WITH FILL with FROM/TO bounds', () => {
        expect(scanProblem('SELECT a FROM t ORDER BY t WITH FILL FROM 1 TO 10 STEP 1')).toBe(
          SelectShapeProblem.WithFill
        );
      });
    });

    describe('WithTotalsRollupCube', () => {
      it.each([
        ['WITH TOTALS', 'SELECT x, count() FROM t GROUP BY x WITH TOTALS'],
        ['WITH ROLLUP', 'SELECT x, count() FROM t GROUP BY x WITH ROLLUP'],
        ['WITH CUBE', 'SELECT x, count() FROM t GROUP BY x WITH CUBE'],
      ])('reports %s', (_name, sql) => {
        expect(scanProblem(sql)).toBe(SelectShapeProblem.WithTotalsRollupCube);
      });
    });

    describe('Settings', () => {
      it('reports a top-level SETTINGS clause', () => {
        expect(scanProblem('SELECT a FROM t SETTINGS max_threads = 4')).toBe(SelectShapeProblem.Settings);
      });

      it('reports SETTINGS even when it follows a droppable tail', () => {
        expect(scanProblem('SELECT a FROM t ORDER BY a LIMIT 5 SETTINGS max_threads = 4')).toBe(
          SelectShapeProblem.Settings
        );
      });
    });
  });

  describe('strings and comments are not clauses', () => {
    it('ignores LIMIT inside a string literal', () => {
      expect(scanOk("SELECT Timestamp FROM t WHERE Body = 'no LIMIT here' ORDER BY Timestamp").head).toBe(
        "SELECT Timestamp FROM t WHERE Body = 'no LIMIT here'\n"
      );
    });

    it('ignores ORDER BY, WHERE and SETTINGS inside string literals', () => {
      const sql = "SELECT Timestamp FROM t WHERE Body = 'ORDER BY x' AND Body != 'SETTINGS y' AND Body != 'WHERE z'";
      expect(scanOk(sql).head).toBe(`${sql}\n`);
    });

    it('ignores a set operation keyword inside a string literal', () => {
      const select = scanOk("SELECT 'UNION ALL' AS x, Timestamp FROM t");
      expect(select.head).toBe("SELECT 'UNION ALL' AS x, Timestamp FROM t\n");
      expect(select.items).toEqual([{ outputName: 'x' }, { outputName: 'Timestamp', sourceIdentifier: 'Timestamp' }]);
    });

    it('ignores SETTINGS inside a block comment', () => {
      const sql = 'SELECT a FROM t /* SETTINGS max_threads = 4 */';
      expect(scanOk(sql).head).toBe(`${sql}\n`);
    });

    it('ignores LIMIT inside a line comment', () => {
      const sql = 'SELECT Timestamp FROM t\n-- LIMIT 10 in a comment\nWHERE x = 1';
      expect(scanOk(sql).head).toBe(`${sql}\n`);
    });

    it('ignores clause keywords inside a quoted identifier', () => {
      const sql = 'SELECT "ORDER BY" AS o FROM t';
      const select = scanOk(sql);
      expect(select.head).toBe(`${sql}\n`);
      expect(select.items).toEqual([{ outputName: 'o', sourceIdentifier: 'ORDER BY' }]);
    });

    it('still strips a real tail that follows a comment mentioning one', () => {
      expect(scanOk('SELECT a FROM t /* LIMIT 1 */ LIMIT 5').head).toBe('SELECT a FROM t /* LIMIT 1 */\n');
    });
  });

  describe('ClickHouse and Grafana syntax carried verbatim', () => {
    it('carries a macro call in the WHERE clause', () => {
      const select = scanOk(
        'SELECT Timestamp FROM otel.otel_logs WHERE $__timeFilter(Timestamp) ORDER BY Timestamp DESC LIMIT 100'
      );
      expect(select.head).toBe('SELECT Timestamp FROM otel.otel_logs WHERE $__timeFilter(Timestamp)\n');
      expect(select.items).toEqual([{ outputName: 'Timestamp', sourceIdentifier: 'Timestamp' }]);
    });

    it('carries $__fromTime / $__toTime macros', () => {
      const sql = 'SELECT Timestamp FROM t WHERE Timestamp >= $__fromTime AND Timestamp <= $__toTime';
      expect(scanOk(sql).head).toBe(`${sql}\n`);
    });

    it('carries template variables, including the ${var:format} form', () => {
      const sql = 'SELECT Timestamp FROM ${table:sqltable} WHERE host = $host LIMIT 5';
      expect(scanOk(sql).head).toBe('SELECT Timestamp FROM ${table:sqltable} WHERE host = $host\n');
    });

    it('handles map access in the select list', () => {
      const select = scanOk("SELECT LogAttributes['k'] AS k, Timestamp FROM t LIMIT 5");
      expect(select.head).toBe("SELECT LogAttributes['k'] AS k, Timestamp FROM t\n");
      expect(select.items).toEqual([{ outputName: 'k' }, { outputName: 'Timestamp', sourceIdentifier: 'Timestamp' }]);
    });

    it('handles a parametric aggregate function', () => {
      const select = scanOk('SELECT quantile(0.9)(Duration) AS p90 FROM t ORDER BY p90');
      expect(select.head).toBe('SELECT quantile(0.9)(Duration) AS p90 FROM t\n');
      expect(select.items).toEqual([{ outputName: 'p90' }]);
    });

    it('handles FINAL and PREWHERE', () => {
      expect(scanOk('SELECT Timestamp FROM t FINAL PREWHERE Timestamp > 0 WHERE x = 1 LIMIT 5').head).toBe(
        'SELECT Timestamp FROM t FINAL PREWHERE Timestamp > 0 WHERE x = 1\n'
      );
    });

    it('handles ARRAY JOIN', () => {
      expect(scanOk('SELECT arr FROM t ARRAY JOIN arr AS x LIMIT 5').head).toBe(
        'SELECT arr FROM t ARRAY JOIN arr AS x\n'
      );
    });

    it('handles a tuple IN list', () => {
      expect(scanOk('SELECT a FROM t WHERE (a, b) IN ((1, 2), (3, 4)) ORDER BY a').head).toBe(
        'SELECT a FROM t WHERE (a, b) IN ((1, 2), (3, 4))\n'
      );
    });

    it('handles a JOIN with a qualified select list', () => {
      const sql =
        'SELECT l.Timestamp AS ts, r.name AS name FROM otel.otel_logs AS l JOIN dim AS r ON l.id = r.id LIMIT 5';
      const select = scanOk(sql);
      expect(select.head).toBe(
        'SELECT l.Timestamp AS ts, r.name AS name FROM otel.otel_logs AS l JOIN dim AS r ON l.id = r.id\n'
      );
      expect(select.items).toEqual([{ outputName: 'ts' }, { outputName: 'name' }]);
    });

    it('handles an interval macro inside a function call', () => {
      const sql =
        'SELECT toStartOfInterval(Timestamp, INTERVAL $__interval_ms millisecond) AS time, count() AS c ' +
        'FROM t GROUP BY time ORDER BY time';
      const select = scanOk(sql);
      expect(select.head).toBe(
        'SELECT toStartOfInterval(Timestamp, INTERVAL $__interval_ms millisecond) AS time, count() AS c ' +
          'FROM t GROUP BY time\n'
      );
      expect(select.items).toEqual([{ outputName: 'time' }, { outputName: 'c' }]);
    });
  });
});

describe('tail keywords used as ordinary identifiers', () => {
  // `format` is a real ClickHouse function and `limit`/`offset` are legal column names, so
  // matching them anywhere would truncate the statement and hand back invalid SQL while
  // still reporting success.
  it.each([
    ['a FORMAT function call in the select list', "SELECT format('{}', x) FROM t"],
    ['an aliased FORMAT call in the select list', "SELECT a, format('{}', b) AS f FROM t"],
    ['a column named format in the WHERE', 'SELECT a FROM t WHERE format = 1'],
    ['a column named limit in the WHERE', 'SELECT a FROM t WHERE limit = 1'],
    ['a column named offset in the WHERE', 'SELECT a FROM t WHERE offset = 1'],
    ['an alias named format', 'SELECT toString(a) AS format FROM t'],
  ])('keeps the whole statement as the head for %s', (_name, sql) => {
    expect(scanOk(sql).head).toBe(`${sql}\n`);
  });

  it('still strips a real trailing LIMIT after a FORMAT call in the select list', () => {
    expect(scanOk("SELECT a, format('{}', b) AS f FROM t LIMIT 5").head).toBe(
      "SELECT a, format('{}', b) AS f FROM t\n"
    );
  });

  it('still strips a real trailing FORMAT clause', () => {
    expect(scanOk('SELECT a FROM t FORMAT JSON').head).toBe('SELECT a FROM t\n');
  });
});

describe('LIMIT BY detection', () => {
  it.each([
    'SELECT a FROM t LIMIT 2 BY host',
    'SELECT a FROM t LIMIT 5, 2 BY host',
    // OFFSET may sit between LIMIT and BY, so the scan must look past it.
    'SELECT a FROM t LIMIT 1 OFFSET 2 BY host',
    'SELECT a FROM t ORDER BY a LIMIT 1 OFFSET 2 BY host, service',
  ])('rejects %s', (sql) => {
    // LIMIT n BY is a per-key row filter. Dropping it as if it were a trailing row cap would
    // inflate every bucket in the histogram.
    expect(scanProblem(sql)).toBe(SelectShapeProblem.LimitBy);
  });

  it('does not confuse a plain trailing LIMIT with LIMIT BY', () => {
    expect(scanOk('SELECT a FROM t LIMIT 1 OFFSET 2').head).toBe('SELECT a FROM t\n');
  });
});

describe('EXCEPT disambiguation', () => {
  it('treats EXCEPT before the FROM as the column exclusion modifier', () => {
    // `* EXCEPT (col)` is harmless to carry along verbatim; only a set operator changes the
    // row set in a way we cannot aggregate over.
    const result = scanTopLevelSelect('SELECT * EXCEPT (Body) FROM t');
    expect(result.ok).toBe(true);
  });

  it('still reads the first item when a wildcard exclusion follows it', () => {
    const select = scanOk('SELECT Timestamp, * EXCEPT (Body) FROM t');
    expect(select.items[0]).toEqual({ outputName: 'Timestamp', sourceIdentifier: 'Timestamp' });
  });

  it('treats EXCEPT after the FROM as a set operation', () => {
    expect(scanProblem('SELECT a FROM t EXCEPT SELECT a FROM u')).toBe(SelectShapeProblem.SetOperation);
  });
});
