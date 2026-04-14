import { getFields, getTable, sqlToStatement } from './ast';

describe('ast', () => {
  describe('getFields', () => {
    it('returns 1 expression when statement has no alias', () => {
      expect(getFields('SELECT foo FROM bar')).toHaveLength(1);
    });

    it('returns the correct field name', () => {
      expect(getFields('SELECT foo FROM bar')).toEqual(['foo']);
    });

    it('returns alias in "name as alias" form', () => {
      expect(getFields('SELECT a as body FROM t')).toEqual(['a as body']);
    });

    it('preserves original casing — not lowercased', () => {
      expect(getFields('SELECT Timestamp, EventType FROM t')).toEqual(['Timestamp', 'EventType']);
    });

    it('preserves casing for quoted identifiers', () => {
      expect(getFields('SELECT "Timestamp", "SeverityText" FROM t')).toEqual(['Timestamp', 'SeverityText']);
    });

    it('returns empty array when SQL is invalid', () => {
      expect(getFields('not valid sql')).toEqual([]);
    });
  });

  describe('getTable', () => {
    it('returns table name without database', () => {
      expect(getTable('SELECT a FROM MyTable')).toBe('MyTable');
    });

    it('returns database.table when both are present', () => {
      expect(getTable('SELECT a FROM myDB.MyTable')).toBe('myDB.MyTable');
    });

    it('preserves original casing — not lowercased', () => {
      expect(getTable('SELECT a FROM MySchema.MyTable')).toBe('MySchema.MyTable');
    });

    it('returns empty string when table cannot be determined', () => {
      expect(getTable('not valid sql')).toBe('');
    });
  });

  describe('sqlToStatement', () => {
    it('strips SETTINGS clause before parsing', () => {
      const sql = 'SELECT count(*) FROM foo SETTINGS setting1=stuff setting2=stuff';
      const stm = sqlToStatement(sql);
      expect(stm).not.toBeNull();
      expect(stm!.table).toBe('foo');
    });

    it('does not error when brackets / macros / variables are present', () => {
      const errLog = jest.spyOn(console, 'error');
      const sql = `
        /* \${__variable} \${__variable.key} */
        SELECT
          *,
          $__timeInterval(timestamp),
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
      expect(errLog).not.toHaveBeenCalled();
      expect(stm).not.toBeNull();
      expect(stm!.table).not.toBe('');
    });

    it('returns parsed columns with original casing', () => {
      const stm = sqlToStatement('SELECT Timestamp, EventType FROM myDB.MyTable');
      expect(stm).not.toBeNull();
      expect(stm!.columns.map((c) => c.name)).toEqual(['Timestamp', 'EventType']);
      expect(stm!.table).toBe('MyTable');
      expect(stm!.database).toBe('myDB');
    });

    it('returns null for non-SELECT statements', () => {
      // The mock (and real WASM) only parse SELECT; others return null
      const stm = sqlToStatement('INSERT INTO t VALUES (1)');
      expect(stm).toBeNull();
    });
  });
});
