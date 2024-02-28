import { getFields, sqlToStatement } from './ast';
import { toSql } from 'pgsql-ast-parser'

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
});
