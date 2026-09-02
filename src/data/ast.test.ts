import { getFields, getTable, sqlToStatement } from './ast';
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
    // ClickHouse-specific syntax that the previous pgsql-based parser threw on,
    // which silently dropped the ad-hoc filter (grafana/clickhouse-datasource#958).
    it.each([
      ['SAMPLE', 'SELECT * FROM otel_logs SAMPLE 0.1', 'otel_logs'],
      ['INTERVAL', 'SELECT * FROM otel_logs WHERE ts > now() - INTERVAL 1 MINUTE', 'otel_logs'],
      ['lambda', 'SELECT arrayMap(x -> x + 1, arr) AS a FROM otel_logs', 'otel_logs'],
      ['qualified name + SAMPLE', 'SELECT * FROM db.otel_logs SAMPLE 1/10 WHERE x > 1', 'db.otel_logs'],
      ['subquery with ClickHouse syntax', 'SELECT * FROM (SELECT * FROM physical SAMPLE 0.1) sub', 'physical'],
      ['backtick-quoted name', 'SELECT * FROM `my-db`.`my-table`', 'my-db.my-table'],
      [
        'CTE + JOIN',
        'WITH lookup AS (SELECT id FROM dim_services) SELECT * FROM otel_logs JOIN lookup ON otel_logs.id = lookup.id',
        'otel_logs',
      ],
      ['existing SETTINGS clause', 'SELECT * FROM otel_logs SETTINGS max_threads = 1', 'otel_logs'],
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
      ['the outer table, not the trim operand', "SELECT trim(BOTH ' ' FROM col) FROM otel_logs", 'otel_logs'],
      ['a Grafana variable used as the table', 'SELECT * FROM ${table}', '${table}'],
      ['a keyword-named table', 'SELECT * FROM default.values', 'default.values'],
      ['an unqualified keyword table', 'SELECT * FROM sample', 'sample'],
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
      ['UNION ALL (first table)', 'SELECT * FROM t1 UNION ALL SELECT * FROM t2', 't1'],
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
    ])('resolves the table for %s', (_label, sql, expected) => {
      expect(getTable(sql)).toBe(expected);
    });
  });
});
