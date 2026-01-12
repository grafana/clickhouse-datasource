import {
  getFields,
  sqlToStatement,
  getTableInfo,
  getSelectColumnNames,
  getWhereColumnNames,
  getAllQueriedColumns,
  hasAggregateFunction,
  hasGroupBy,
  canAutoAddWhereColumns,
} from './ast';
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

  describe('getTableInfo', () => {
    it('extracts table without database', () => {
      expect(getTableInfo('SELECT * FROM logs')).toEqual({ table: 'logs' });
    });

    it('extracts database and table', () => {
      expect(getTableInfo('SELECT * FROM default.logs')).toEqual({
        database: 'default',
        table: 'logs',
      });
    });

    it('preserves original casing', () => {
      expect(getTableInfo('SELECT * FROM MyDatabase.MyTable')).toEqual({
        database: 'MyDatabase',
        table: 'MyTable',
      });
    });

    it('handles quoted identifiers', () => {
      expect(getTableInfo('SELECT * FROM "default"."logs"')).toEqual({
        database: 'default',
        table: 'logs',
      });
    });

    it('returns null for invalid queries', () => {
      expect(getTableInfo('INSERT INTO logs VALUES (1)')).toBeNull();
      expect(getTableInfo('SELECT 1')).toBeNull();
    });
  });

  describe('getSelectColumnNames', () => {
    it('extracts simple column names', () => {
      expect(getSelectColumnNames('SELECT a, b, c FROM t')).toEqual(new Set(['a', 'b', 'c']));
    });

    it('extracts column names from aliases', () => {
      expect(getSelectColumnNames('SELECT a AS alias, b FROM t')).toEqual(new Set(['a', 'b']));
    });

    it('returns empty set for SELECT *', () => {
      expect(getSelectColumnNames('SELECT * FROM t')).toEqual(new Set());
    });

    it('extracts columns from functions', () => {
      expect(getSelectColumnNames('SELECT count(id), timestamp FROM t')).toEqual(new Set(['id', 'timestamp']));
    });

    it('handles complex expressions', () => {
      expect(getSelectColumnNames('SELECT a + b AS sum, c FROM t')).toEqual(new Set(['a', 'b', 'c']));
    });
  });

  describe('getWhereColumnNames', () => {
    it('extracts column from simple condition', () => {
      expect(getWhereColumnNames("SELECT * FROM t WHERE service = 'auth'")).toEqual(new Set(['service']));
    });

    it('extracts columns from AND/OR conditions', () => {
      expect(getWhereColumnNames('SELECT * FROM t WHERE a = 1 AND b = 2 OR c = 3')).toEqual(new Set(['a', 'b', 'c']));
    });

    it('extracts columns from IN clause', () => {
      expect(getWhereColumnNames("SELECT * FROM t WHERE level IN ('info', 'warn')")).toEqual(new Set(['level']));
    });

    it('extracts columns from functions', () => {
      expect(getWhereColumnNames("SELECT * FROM t WHERE lower(name) = 'test'")).toEqual(new Set(['name']));
    });

    it('excludes macro variables', () => {
      expect(getWhereColumnNames('SELECT * FROM t WHERE $__timeFilter(ts)')).toEqual(new Set(['ts']));
    });

    it('handles complex nested conditions', () => {
      expect(getWhereColumnNames('SELECT * FROM t WHERE (a > 1 AND b < 2) OR c != 3')).toEqual(
        new Set(['a', 'b', 'c'])
      );
    });

    it('returns empty set when no WHERE clause', () => {
      expect(getWhereColumnNames('SELECT * FROM t')).toEqual(new Set());
    });
  });

  describe('getAllQueriedColumns', () => {
    it('combines SELECT and WHERE columns', () => {
      const sql = "SELECT timestamp, message FROM logs WHERE service = 'auth'";
      expect(getAllQueriedColumns(sql)).toEqual(new Set(['timestamp', 'message', 'service']));
    });

    it('handles overlapping columns', () => {
      const sql = 'SELECT a, b FROM t WHERE a = 1 AND c = 2';
      expect(getAllQueriedColumns(sql)).toEqual(new Set(['a', 'b', 'c']));
    });

    it('handles SELECT * with WHERE', () => {
      const sql = "SELECT * FROM t WHERE status = 'active'";
      expect(getAllQueriedColumns(sql)).toEqual(new Set(['status']));
    });
  });

  describe('hasAggregateFunction', () => {
    it('detects count()', () => {
      expect(hasAggregateFunction('SELECT count() FROM t')).toBe(true);
      expect(hasAggregateFunction('SELECT COUNT(*) FROM t')).toBe(true);
    });

    it('detects sum, avg, min, max', () => {
      expect(hasAggregateFunction('SELECT sum(value) FROM t')).toBe(true);
      expect(hasAggregateFunction('SELECT AVG(value) FROM t')).toBe(true);
      expect(hasAggregateFunction('SELECT min(value), max(value) FROM t')).toBe(true);
    });

    it('detects ClickHouse specific aggregates', () => {
      expect(hasAggregateFunction('SELECT uniq(user_id) FROM t')).toBe(true);
      expect(hasAggregateFunction('SELECT groupArray(name) FROM t')).toBe(true);
      // Note: quantile(0.95)(latency) syntax is not supported by pgsql-ast-parser
      expect(hasAggregateFunction('SELECT median(latency) FROM t')).toBe(true);
    });

    it('returns false for non-aggregate queries', () => {
      expect(hasAggregateFunction('SELECT a, b, c FROM t')).toBe(false);
      expect(hasAggregateFunction('SELECT lower(name) FROM t')).toBe(false);
      expect(hasAggregateFunction('SELECT * FROM t')).toBe(false);
    });
  });

  describe('hasGroupBy', () => {
    it('detects GROUP BY clause', () => {
      expect(hasGroupBy('SELECT a, count() FROM t GROUP BY a')).toBe(true);
      expect(hasGroupBy('SELECT region, sum(sales) FROM t GROUP BY region')).toBe(true);
    });

    it('returns false without GROUP BY', () => {
      expect(hasGroupBy('SELECT a, b FROM t')).toBe(false);
      expect(hasGroupBy('SELECT * FROM t WHERE x = 1')).toBe(false);
    });
  });

  describe('canAutoAddWhereColumns', () => {
    it('returns true for simple SELECT queries', () => {
      expect(canAutoAddWhereColumns('SELECT a, b FROM t WHERE c = 1')).toBe(true);
      expect(canAutoAddWhereColumns('SELECT * FROM t')).toBe(true);
    });

    it('returns false for aggregate queries', () => {
      expect(canAutoAddWhereColumns('SELECT count() FROM t WHERE status = 1')).toBe(false);
      expect(canAutoAddWhereColumns('SELECT sum(value) FROM t WHERE region = "us"')).toBe(false);
    });

    it('returns false for GROUP BY queries', () => {
      expect(canAutoAddWhereColumns('SELECT region, count() FROM t GROUP BY region')).toBe(false);
    });
  });
});
