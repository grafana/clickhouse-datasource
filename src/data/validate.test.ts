import { validate } from './validate';

describe('Validate', () => {
  describe('valid SQL', () => {
    it('handles a basic SELECT', () => {
      expect(validate('SELECT foo FROM bar').valid).toBe(true);
    });

    it('handles ClickHouse FINAL keyword', () => {
      expect(validate('SELECT * FROM table FINAL').valid).toBe(true);
    });

    it('handles ClickHouse PREWHERE', () => {
      expect(validate('SELECT * FROM t PREWHERE x > 1 WHERE y > 2').valid).toBe(true);
    });

    it('handles ClickHouse ARRAY JOIN', () => {
      expect(validate('SELECT * FROM t ARRAY JOIN arr').valid).toBe(true);
    });

    it('handles ClickHouse SETTINGS', () => {
      expect(validate("SELECT * FROM t SETTINGS max_rows_to_read = 1000").valid).toBe(true);
    });

    it('handles ClickHouse GLOBAL IN', () => {
      expect(validate('SELECT * FROM t WHERE id GLOBAL IN (SELECT id FROM t2)').valid).toBe(true);
    });

    it('handles ClickHouse ASOF JOIN', () => {
      expect(validate('SELECT * FROM t1 ASOF JOIN t2 ON t1.id = t2.id').valid).toBe(true);
    });

    it('handles ClickHouse :: cast operator', () => {
      expect(validate("SELECT '2024-01-01'::DateTime FROM t").valid).toBe(true);
    });

    it('handles Grafana $__timeFilter macro', () => {
      expect(validate('SELECT * FROM t WHERE $__timeFilter(timestamp)').valid).toBe(true);
    });

    it('handles Grafana $__interval macro', () => {
      expect(validate('SELECT toStartOfInterval(ts, INTERVAL $__interval second) FROM t').valid).toBe(true);
    });

    it('handles Grafana ${variable} template variables', () => {
      expect(validate('SELECT * FROM t WHERE service = ${service}').valid).toBe(true);
    });

    it('handles single-line comments', () => {
      expect(validate('SELECT * FROM t -- this is a comment').valid).toBe(true);
    });

    it('handles block comments', () => {
      expect(validate('SELECT /* comment */ * FROM t').valid).toBe(true);
    });

    it('handles hex numbers', () => {
      expect(validate('SELECT 0xFF FROM t').valid).toBe(true);
    });
  });

  describe('invalid SQL', () => {
    it('catches an unclosed single-quoted string', () => {
      const v = validate("SELECT * FROM t WHERE name = 'unclosed");
      expect(v.valid).toBe(false);
      expect(v.error?.message).toBe('Single quoted string is not closed');
    });

    it('catches an unclosed double-quoted identifier', () => {
      const v = validate('SELECT "unclosed FROM t');
      expect(v.valid).toBe(false);
      expect(v.error?.message).toBe('Double quoted string is not closed');
    });

    it('catches an unclosed backtick identifier', () => {
      const v = validate('SELECT `unclosed FROM t');
      expect(v.valid).toBe(false);
      expect(v.error?.message).toBe('Back quoted string is not closed');
    });

    it('catches an unclosed block comment', () => {
      const v = validate('SELECT * FROM t /* unclosed comment');
      expect(v.valid).toBe(false);
      expect(v.error?.message).toBe('Multiline comment is not closed');
    });

    it('catches a stray exclamation mark', () => {
      const v = validate('SELECT * FROM t WHERE x ! 1');
      expect(v.valid).toBe(false);
      expect(v.error?.message).toBe('Exclamation mark can only occur in != operator');
    });

    it('reports the correct line number for an error on line 2', () => {
      const sql = 'SELECT *\nFROM t WHERE name = \'unclosed';
      const v = validate(sql);
      expect(v.valid).toBe(false);
      expect(v.error?.startLine).toBe(2);
    });

    it('reports the correct column for an error', () => {
      const sql = "SELECT 'unclosed";
      const v = validate(sql);
      expect(v.valid).toBe(false);
      expect(v.error?.startCol).toBe(8); // quote starts at col 8
    });
  });
});
