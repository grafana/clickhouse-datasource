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
    // Each case asserts the physical table an ad-hoc filter targets. The
    // ClickHouse-specific shapes (and UNION / CTE) returned '' on the previous
    // pgsql-ast-parser implementation: it threw on valid ClickHouse syntax, so
    // the ad-hoc filter was silently dropped. See
    // grafana/clickhouse-datasource#958 and #714.
    const cases: Array<{ group: string; label: string; sql: string; expected: string }> = [
      // Baseline: the previous implementation handled these too.
      {
        group: 'baseline',
        label: 'simple select',
        sql: 'SELECT ServiceName FROM otel_logs LIMIT 10',
        expected: 'otel_logs',
      },
      {
        group: 'baseline',
        label: 'database-qualified',
        sql: 'SELECT * FROM default.otel_logs',
        expected: 'default.otel_logs',
      },
      {
        group: 'baseline',
        label: 'double-quoted identifiers',
        sql: 'SELECT * FROM "default"."otel_logs"',
        expected: 'default.otel_logs',
      },
      { group: 'baseline', label: 'preserves table casing', sql: 'SELECT * FROM fooTable', expected: 'fooTable' },

      // ClickHouse-specific syntax: pgsql-ast-parser threw on each of these.
      {
        group: 'ch-syntax',
        label: 'SAMPLE clause',
        sql: 'SELECT ServiceName FROM otel_traces SAMPLE 0.1',
        expected: 'otel_traces',
      },
      { group: 'ch-syntax', label: 'FINAL modifier', sql: 'SELECT * FROM otel_logs FINAL', expected: 'otel_logs' },
      {
        group: 'ch-syntax',
        label: 'INTERVAL literal',
        sql: 'SELECT * FROM otel_logs WHERE Timestamp >= now() - INTERVAL 1 HOUR',
        expected: 'otel_logs',
      },
      {
        group: 'ch-syntax',
        label: 'Map access in SELECT',
        sql: `SELECT ResourceAttributes['service.name'] FROM otel_logs`,
        expected: 'otel_logs',
      },
      {
        group: 'ch-syntax',
        label: 'lambda expression',
        sql: 'SELECT arrayMap(x -> x * 2, [1, 2, 3]) FROM otel_logs',
        expected: 'otel_logs',
      },
      {
        group: 'ch-syntax',
        label: 'existing SETTINGS clause',
        sql: 'SELECT * FROM otel_logs SETTINGS max_threads = 4',
        expected: 'otel_logs',
      },

      // Multi-table: the contract is the first physical table.
      {
        group: 'multi-table',
        label: 'JOIN returns the first table',
        sql: 'SELECT l.Body, t.SpanName FROM otel_logs AS l JOIN otel_traces AS t ON l.TraceId = t.TraceId',
        expected: 'otel_logs',
      },
      {
        group: 'multi-table',
        label: 'subquery in FROM descends to the physical table',
        sql: 'SELECT * FROM (SELECT ServiceName FROM otel_logs) AS sub',
        expected: 'otel_logs',
      },
      {
        group: 'multi-table',
        label: 'UNION ALL returns the first table',
        sql: 'SELECT ServiceName FROM otel_logs UNION ALL SELECT ServiceName FROM otel_traces',
        expected: 'otel_logs',
      },
      {
        group: 'multi-table',
        label: 'CTE resolves to the underlying physical table',
        sql: 'WITH recent AS (SELECT * FROM otel_logs) SELECT * FROM recent',
        expected: 'otel_logs',
      },

      // Grafana macros embedded (the real dashboard-panel shape).
      {
        group: 'grafana-macros',
        label: 'timeFilter + timeInterval',
        sql: 'SELECT $__timeInterval(Timestamp) AS t, count() FROM otel_logs WHERE $__timeFilter(Timestamp) GROUP BY t',
        expected: 'otel_logs',
      },
    ];

    it.each(cases)('[$group] $label', ({ sql, expected }) => {
      expect(getTable(sql)).toBe(expected);
    });

    it('returns an empty string when the query has no table', () => {
      expect(getTable('SELECT 1')).toBe('');
    });

    it('returns an empty string when the input cannot be parsed as a select', () => {
      expect(getTable('select not sql')).toBe('');
    });

    // Regression guard for the silent-drop bug: each of these returned '' on
    // the previous implementation, which made AdHocFilter.apply() a no-op.
    it.each([
      ['SAMPLE', 'SELECT ServiceName FROM otel_traces SAMPLE 0.1'],
      ['INTERVAL', 'SELECT * FROM otel_logs WHERE Timestamp >= now() - INTERVAL 1 HOUR'],
      ['lambda', 'SELECT arrayMap(x -> x * 2, [1, 2, 3]) FROM otel_logs'],
      ['UNION', 'SELECT ServiceName FROM otel_logs UNION ALL SELECT ServiceName FROM otel_traces'],
      ['CTE', 'WITH recent AS (SELECT * FROM otel_logs) SELECT * FROM recent'],
    ])('now resolves a table for the previously-dropped %s shape', (_label, sql) => {
      expect(getTable(sql)).not.toBe('');
    });
  });
});
