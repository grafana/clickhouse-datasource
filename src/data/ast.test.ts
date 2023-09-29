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
  });
});
