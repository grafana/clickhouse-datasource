import { parseSelect } from './parser';

describe('parseSelect', () => {
  it('sets the outer FROM table for a simple select', () => {
    expect(parseSelect('SELECT * FROM otel_logs')?.from?.table).toBe('otel_logs');
  });

  it('captures the database and table for a qualified name', () => {
    const from = parseSelect('SELECT * FROM db.otel_logs')?.from;
    expect(from?.database).toBe('db');
    expect(from?.table).toBe('otel_logs');
  });

  it('keeps the first table on a join', () => {
    expect(parseSelect('SELECT * FROM a JOIN b ON a.id = b.id')?.from?.table).toBe('a');
  });

  it('ignores a FROM nested in a function call (EXTRACT)', () => {
    expect(
      parseSelect('SELECT EXTRACT(YEAR FROM Timestamp) AS y, count() FROM otel_logs GROUP BY y')?.from?.table
    ).toBe('otel_logs');
  });

  it('ignores a FROM nested in trim(BOTH ... FROM ...)', () => {
    expect(parseSelect("SELECT trim(BOTH ' ' FROM col) FROM otel_logs")?.from?.table).toBe('otel_logs');
  });

  it('marks a table function and records its name', () => {
    const from = parseSelect("SELECT * FROM merge('default', '^otel')")?.from;
    expect(from?.table).toBe('merge');
    expect(from?.isTableFunction).toBe(true);
  });

  it('accepts keyword-named tables', () => {
    expect(parseSelect('SELECT * FROM sample')?.from?.table).toBe('sample');
    expect(parseSelect('SELECT * FROM default.values')?.from?.database).toBe('default');
    expect(parseSelect('SELECT * FROM default.values')?.from?.table).toBe('values');
  });

  it('captures a Grafana variable in the FROM position', () => {
    expect(parseSelect('SELECT * FROM ${table}')?.from?.table).toBe('${table}');
  });

  it('stops at a statement boundary so a later statement does not set node.from', () => {
    expect(parseSelect('SELECT 1; SELECT * FROM second_table')?.from).toBeUndefined();
  });

  it('leaves node.from unset for a leading subquery (descent is the caller step)', () => {
    expect(parseSelect('SELECT * FROM (SELECT * FROM inner_t) x')?.from?.table).toBeUndefined();
  });

  it('returns null for a non-select statement', () => {
    expect(parseSelect('INSERT INTO foo VALUES (1)')).toBeNull();
  });

  it('keeps the outer table across an ARRAY JOIN', () => {
    expect(parseSelect('SELECT * FROM otel_logs ARRAY JOIN LogAttributes')?.from?.table).toBe('otel_logs');
  });

  it('keeps the outer table with a FINAL modifier', () => {
    expect(parseSelect('SELECT * FROM otel_logs FINAL SAMPLE 0.1')?.from?.table).toBe('otel_logs');
  });

  it('parses case-insensitive keywords', () => {
    expect(parseSelect('select * from otel_logs sample 0.1')?.from?.table).toBe('otel_logs');
  });

  it('ignores leading comments', () => {
    expect(parseSelect('/* c */ SELECT * FROM otel_logs')?.from?.table).toBe('otel_logs');
    expect(parseSelect('-- c\nSELECT * FROM otel_logs')?.from?.table).toBe('otel_logs');
  });

  it('takes the first select table for a UNION', () => {
    expect(parseSelect('SELECT * FROM t1 UNION ALL SELECT * FROM t2')?.from?.table).toBe('t1');
  });

  it('marks cluster/remote/numbers as table functions', () => {
    for (const q of [
      'SELECT * FROM cluster(c, default, otel_logs)',
      'SELECT * FROM remote(addr, default.otel_logs)',
      'SELECT * FROM numbers(10)',
    ]) {
      expect(parseSelect(q)?.from?.isTableFunction).toBe(true);
    }
  });
});
