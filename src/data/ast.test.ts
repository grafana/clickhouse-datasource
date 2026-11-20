import { getFields, getSelectAliases, getTable, sqlToStatement } from './ast';
import { toSql } from 'pgsql-ast-parser';

describe('ast', () => {
  describe('getFields', () => {
    it('return 1 expression if statement does not have an alias', () => {
      const stm = getFields(`select foo from bar`);
      expect(stm.length).toBe(1);
    });
  });
  describe('sqlToStatement', () => {
    it('settings parse correctly', () => {
      const sql = 'SELECT count(*) FROM foo SETTINGS setting1=stuff setting2=stuff';
      const stm = sqlToStatement(sql);
      // this is formatted like this to match how pgsql generates its sql
      expect(toSql.statement(stm)).toEqual('SELECT (count (*) )  FROM foo');
    });

    // https://github.com/grafana/clickhouse-datasource/issues/714
    it('does not error when brackets/macros/variables are present', () => {
      const errLog = jest.spyOn(console, 'error');
      const sql = `
        /* \${__variable} \${__variable.key} */
        SELECT
          *,
          \$__timeInterval(timestamp),
          '{"a": 1, "b": { "c": 2, "d": [1, 2, 3] }}'::json as bracketTest
        FROM default.table
        WHERE $__timeFilter(timestamp)
        AND col != \${variable}
        AND col != \${variable.key}
        AND col != \${variable.key:singlequote}
        AND col != '\${variable}'
        AND col != '\${__variable}'
        AND col != ('\${__variable.key}')
        AND col != \${variable:singlequote}
      `;

      const stm = sqlToStatement(sql);
      const astSql = toSql.statement(stm);
      expect(errLog).toHaveBeenCalledTimes(0);
      expect(stm).not.toEqual({});
      expect(astSql).not.toBeFalsy();
    });
  });

  describe('getTable', () => {
    // Shapes the previous pgsql-based parser dropped the ad-hoc filter on, by
    // throwing on ClickHouse syntax or resolving to '' (grafana/clickhouse-datasource#958).
    it.each([
      ['SAMPLE', 'SELECT * FROM otel_logs SAMPLE 0.1', 'otel_logs'],
      ['INTERVAL', 'SELECT * FROM otel_logs WHERE ts > now() - INTERVAL 1 MINUTE', 'otel_logs'],
      ['lambda', 'SELECT arrayMap(x -> x + 1, arr) AS a FROM otel_logs', 'otel_logs'],
      ['a db-qualified keyword table name', 'SELECT * FROM default.order', 'default.order'],
      ['a quoted keyword table name', 'SELECT * FROM `order`', 'order'],
      ['an unqualified FORMAT table (pgsql did not reserve it)', 'SELECT * FROM format', 'format'],
      ['an unqualified PREWHERE table', 'SELECT * FROM prewhere', 'prewhere'],
      ['Grafana variables on both sides of the dot', 'SELECT * FROM ${db}.${table}', '${db}.${table}'],
      ['qualified name + SAMPLE', 'SELECT * FROM db.otel_logs SAMPLE 1/10 WHERE x > 1', 'db.otel_logs'],
      ['subquery with ClickHouse syntax', 'SELECT * FROM (SELECT * FROM physical SAMPLE 0.1) sub', 'physical'],
      ['backtick-quoted name', 'SELECT * FROM `my-db`.`my-table`', 'my-db.my-table'],
      [
        'CTE + JOIN',
        'WITH lookup AS (SELECT id FROM dim_services) SELECT * FROM otel_logs JOIN lookup ON otel_logs.id = lookup.id',
        'otel_logs',
      ],
      [
        'trim(BOTH ... FROM ...), which the Postgres grammar rejected',
        "SELECT trim(BOTH ' ' FROM col) FROM otel_logs",
        'otel_logs',
      ],
      ['table-name casing preserved', 'SELECT * FROM OtelLogs SAMPLE 0.1', 'OtelLogs'],
    ])('resolves the table for %s', (_label, sql, expected) => {
      expect(getTable(sql)).toBe(expected);
    });

    // Shapes the previous implementation already handled correctly. These must
    // not regress; the expected values match the previous parser's output.
    it.each([
      ['a single table', 'SELECT * FROM otel_logs', 'otel_logs'],
      ['the first table of a join', 'SELECT * FROM a JOIN b ON a.id = b.id', 'a'],
      ['the physical table behind a leading subquery', 'SELECT * FROM (SELECT * FROM foo) bar', 'foo'],
      [
        'the outer table, not a scalar subquery in the SELECT list',
        'SELECT (SELECT max(ts) FROM other_table) AS m, col FROM main_table',
        'main_table',
      ],
      [
        'the outer table, not the EXTRACT operand',
        'SELECT EXTRACT(YEAR FROM Timestamp) AS y FROM otel_logs',
        'otel_logs',
      ],
      ['a Grafana variable used as the table', 'SELECT * FROM ${table}', '${table}'],
      ['a Grafana variable as the qualified table', 'SELECT * FROM my_db.${table}', 'my_db.${table}'],
      ['a Grafana variable as the database', 'SELECT * FROM ${db}.my_table', '${db}.my_table'],
      ['a keyword-named table', 'SELECT * FROM default.values', 'default.values'],
      ['an unqualified keyword table', 'SELECT * FROM sample', 'sample'],
      ['an existing SETTINGS clause', 'SELECT * FROM otel_logs SETTINGS max_threads = 1', 'otel_logs'],
    ])('matches the previous parser for %s', (_label, sql, expected) => {
      expect(getTable(sql)).toBe(expected);
    });

    // Shapes that must resolve to no table, so no bogus additional_table_filters
    // clause is emitted for a name ClickHouse would ignore.
    it.each([
      ['a table function', "SELECT * FROM merge('default', '^otel')", ''],
      ['a table function combined with ClickHouse syntax', "SELECT * FROM merge('default', '^otel') SAMPLE 0.1", ''],
      ['the first statement only, which has no table', 'SELECT 1; SELECT * FROM second_table', ''],
      ['a query with no table', 'SELECT 1', ''],
      ['a non-select statement', 'INSERT INTO foo VALUES (1)', ''],
      ['an empty string', '', ''],
      ['the cluster() table function', 'SELECT * FROM cluster(staging, default, otel_logs)', ''],
      ['the remote() table function', 'SELECT * FROM remote(addr, default.otel_logs)', ''],
      ['the numbers() table function', 'SELECT * FROM numbers(10)', ''],
      [
        'a table function with an IN subquery (no descent into the subquery)',
        "SELECT * FROM merge('default', '^otel') WHERE id IN (SELECT id FROM inner_t)",
        '',
      ],
      [
        'numbers() with an IN subquery (no descent into the subquery)',
        'SELECT * FROM numbers(10) WHERE id IN (SELECT id FROM users)',
        '',
      ],
      ['a clause keyword in place of a missing table', 'SELECT * FROM WHERE Timestamp > now()', ''],
      ['a missing table before WHERE', 'SELECT * FROM  WHERE ', ''],
      ['a top-level UNION (per-branch keying is a follow-up)', 'SELECT a FROM t1 UNION ALL SELECT a FROM t2', ''],
      ['a top-level INTERSECT', 'SELECT a FROM t1 INTERSECT SELECT a FROM t2', ''],
      ['a top-level EXCEPT', 'SELECT a FROM t1 EXCEPT SELECT a FROM t2', ''],
      [
        'an INTERSECT after GROUP BY',
        'SELECT ServiceName FROM otel_logs GROUP BY ServiceName INTERSECT SELECT ServiceName FROM otel_traces',
        '',
      ],
      ['an EXCEPT after a table alias', 'SELECT a FROM t1 AS x EXCEPT SELECT a FROM t2', ''],
      ['a CTE with no underlying table', 'WITH x AS (SELECT 1) SELECT * FROM x', ''],
    ])('returns no table for %s', (_label, sql, expected) => {
      expect(getTable(sql)).toBe(expected);
    });

    // Broader parsing edge cases; the outer physical table must still resolve.
    it.each([
      ['a FINAL modifier', 'SELECT * FROM otel_logs FINAL', 'otel_logs'],
      ['FINAL combined with SAMPLE', 'SELECT * FROM otel_logs FINAL SAMPLE 0.1', 'otel_logs'],
      ['an ARRAY JOIN', 'SELECT * FROM otel_logs ARRAY JOIN LogAttributes', 'otel_logs'],
      ['lowercase keywords', 'select * from otel_logs sample 0.1', 'otel_logs'],
      ['a leading block comment', '/* lead */ SELECT * FROM otel_logs', 'otel_logs'],
      ['a leading line comment', '-- lead\nSELECT * FROM otel_logs', 'otel_logs'],
      ['newlines between clauses', 'SELECT *\nFROM\n  otel_logs\nSAMPLE 0.1', 'otel_logs'],
      ['a lambda in the WHERE clause', 'SELECT count() FROM otel_logs WHERE arrayExists(x -> x > 1, arr)', 'otel_logs'],
      [
        'nested subqueries (innermost physical table)',
        'SELECT * FROM (SELECT * FROM (SELECT * FROM deep) a) b',
        'deep',
      ],
      [
        'a join with a subquery on the right',
        'SELECT * FROM main JOIN (SELECT * FROM sub) x ON main.id = x.id',
        'main',
      ],
      [
        'multiple CTEs before the outer FROM',
        'WITH a AS (SELECT 1), b AS (SELECT 2) SELECT * FROM real_table',
        'real_table',
      ],
      ['a double-quoted qualified name', 'SELECT * FROM "default"."otel_logs"', 'default.otel_logs'],
      ['a mixed backtick-quoted name', 'SELECT * FROM db.`weird-table`', 'db.weird-table'],
      ['an EXCEPT column modifier (not a set operation)', 'SELECT * EXCEPT (secret) FROM otel_logs', 'otel_logs'],
      [
        'an EXCEPT modifier on a COLUMNS matcher',
        "SELECT COLUMNS('^Span') EXCEPT (SpanId) FROM otel_traces",
        'otel_traces',
      ],
      ['a column named except (not a set operation)', 'SELECT a FROM otel_logs WHERE except = 2', 'otel_logs'],
      ['a column named union (not a set operation)', 'SELECT union FROM otel_logs', 'otel_logs'],
      [
        "the outer FROM's own subquery, not a scalar subquery in the SELECT list",
        'SELECT (SELECT max(ts) FROM other_table) AS m, col FROM (SELECT * FROM main_table) x',
        'main_table',
      ],
      [
        "the outer FROM's own subquery, not a sibling CTE body",
        'WITH x AS (SELECT a FROM cte_table) SELECT * FROM (SELECT * FROM inner_t) y',
        'inner_t',
      ],
    ])('resolves the table for %s', (_label, sql, expected) => {
      expect(getTable(sql)).toBe(expected);
    });

    // A FROM that references a CTE resolves to the CTE's underlying table.
    it.each([
      [
        'a query selecting directly from a CTE',
        'WITH lookup AS (SELECT id FROM dim_services) SELECT * FROM lookup',
        'dim_services',
      ],
      [
        'the referenced CTE among several',
        'WITH a AS (SELECT * FROM t_a), b AS (SELECT * FROM t_b) SELECT * FROM b',
        't_b',
      ],
    ])('resolves the table for %s', (_label, sql, expected) => {
      expect(getTable(sql)).toBe(expected);
    });
  });
});

describe('getSelectAliases', () => {
  const aliasesOf = (sql: string) => Object.fromEntries(getSelectAliases(sql)?.aliases ?? []);

  it('maps each alias of the outer SELECT to its expression, with the table it reads', () => {
    const select = getSelectAliases(
      "SELECT Timestamp AS timestamp, SeverityText AS level, ServiceName, ResourceAttributes['k8s.pod.name'] AS pod FROM otel.otel_logs WHERE ServiceName = 'cart'"
    );
    expect(select?.table).toBe('otel.otel_logs');
    expect(Object.fromEntries(select?.aliases ?? [])).toEqual({
      timestamp: { expression: 'Timestamp', rowValue: true },
      level: { expression: 'SeverityText', rowValue: true },
      pod: { expression: "ResourceAttributes['k8s.pod.name']", rowValue: true },
    });
  });

  it('reads the quoted aliases of a query builder logs query', () => {
    const select = getSelectAliases(
      'SELECT Timestamp as "timestamp", Body as "body", SeverityText as "level" FROM "otel"."otel_logs" WHERE ( timestamp >= $__fromTime_ms ) ORDER BY timestamp DESC LIMIT 1000'
    );
    expect(select?.table).toBe('otel.otel_logs');
    expect(select?.aliases.get('level')).toEqual({ expression: 'SeverityText', rowValue: true });
  });

  it.each([
    ['a function call', 'SELECT lower(SeverityText) AS level FROM t', 'lower(SeverityText)'],
    [
      'a cast',
      'SELECT ResourceAttributes.k8s.pod.name::String AS k8s_pod FROM t',
      'ResourceAttributes.k8s.pod.name::String',
    ],
    ['an expression with spaces', "SELECT if(x = 'a', 'b', 'c') AS v FROM t", "if(x = 'a', 'b', 'c')"],
    ['a quoted alias', 'SELECT SeverityText AS "level" FROM t', 'SeverityText'],
    ['the first item after DISTINCT', 'SELECT DISTINCT SeverityText AS level FROM t', 'SeverityText'],
    ['the first item after DISTINCT ON', 'SELECT DISTINCT ON (a) SeverityText AS level FROM t', 'SeverityText'],
    [
      'an expression with an inner AS',
      'SELECT CAST(SeverityNumber AS String) AS level FROM t',
      'CAST(SeverityNumber AS String)',
    ],
    [
      'an expression over lines with comments',
      'SELECT\n  SeverityText -- the level\n  AS level\nFROM t',
      'SeverityText',
    ],
    [
      'a qualifier naming the FROM alias',
      'SELECT lower(l.SeverityText) AS level FROM otel.otel_logs AS l',
      'lower(SeverityText)',
    ],
    ['a FROM alias without AS', 'SELECT l.SeverityText AS level FROM otel_logs l', 'SeverityText'],
  ])('reads %s', (_label, sql, expression) => {
    expect(aliasesOf(sql).level ?? aliasesOf(sql).k8s_pod ?? aliasesOf(sql).v).toEqual({ expression, rowValue: true });
  });

  it('reads the aliases of a WITH query that selects from a table', () => {
    expect(getSelectAliases("WITH 'x' AS c SELECT SeverityText AS level FROM otel_logs")?.aliases.get('level')).toEqual(
      {
        expression: 'SeverityText',
        rowValue: true,
      }
    );
  });

  it.each([
    ['an aggregate', 'SELECT max(Duration) AS Duration FROM t GROUP BY TraceId'],
    ['an aggregate with a suffix', 'SELECT countIf(Duration > 1) AS Duration FROM t'],
    ['an aggregate family member', 'SELECT uniqCombined64(TraceId) AS Duration FROM t'],
    ['an aggregate with stacked suffixes', 'SELECT avgMergeState(x) AS Duration FROM t'],
    ['an upper-case aggregate', 'SELECT COUNT(*) AS Duration FROM t'],
    ['a parametric aggregate', 'SELECT quantileTDigest(0.9)(Duration) AS Duration FROM t'],
    ['a window function', 'SELECT row_number() OVER (PARTITION BY TraceId) AS Duration FROM t'],
    ['a subquery', 'SELECT (SELECT 1) AS Duration FROM t'],
    ['arrayJoin', 'SELECT arrayJoin(Events.Name) AS Duration FROM t'],
    ['a macro', 'SELECT $__timeInterval(Timestamp) AS Duration FROM t'],
  ])('marks %s as not a row value', (_label, sql) => {
    expect(aliasesOf(sql).Duration?.rowValue).toBe(false);
  });

  it.each([
    ['countSubstrings', "SELECT countSubstrings(Body, 'x') AS n FROM t"],
    ['minus', 'SELECT minus(a, b) AS n FROM t'],
    ['arrayMap', 'SELECT arrayMap(x -> x, arr) AS n FROM t'],
    ['ifNull', 'SELECT ifNull(a, 0) AS n FROM t'],
    ['toUInt64OrNull', 'SELECT toUInt64OrNull(a) AS n FROM t'],
  ])('keeps %s, which only looks like an aggregate, as a row value', (_label, sql) => {
    expect(aliasesOf(sql).n?.rowValue).toBe(true);
  });

  it.each([
    ['a FROM subquery', 'SELECT level FROM (SELECT SeverityText AS level FROM otel_logs)'],
    ['a CTE', 'WITH logs AS (SELECT * FROM otel_logs) SELECT SeverityText AS level FROM logs'],
    ['a JOIN', 'SELECT SeverityText AS level FROM otel_logs l JOIN otel_traces t ON l.TraceId = t.TraceId'],
    ['an ARRAY JOIN', 'SELECT e AS level FROM otel_traces ARRAY JOIN Events.Name AS e'],
    ['a set operation', 'SELECT SeverityText AS level FROM a UNION ALL SELECT SeverityText AS level FROM b'],
    ['a table function', "SELECT SeverityText AS level FROM merge('otel', 'logs')"],
    ['a statement that is not a SELECT', 'SHOW TABLES'],
  ])('reads no aliases over %s', (_label, sql) => {
    expect(getSelectAliases(sql)).toBeUndefined();
  });

  it('skips items without an alias and keeps the first of a repeated alias', () => {
    expect(aliasesOf('SELECT *, ServiceName, a AS x, b AS x, c + 1 FROM t')).toEqual({
      x: { expression: 'a', rowValue: true },
    });
  });
});
