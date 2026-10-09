import { ClauseType, parseSelect } from './parser';

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
    const node = parseSelect('SELECT 1; SELECT * FROM second_table');
    expect(node).not.toBeNull();
    expect(node?.from).toBeUndefined();
  });

  it('links a leading subquery to its FROM node instead of setting a table', () => {
    const node = parseSelect('SELECT * FROM (SELECT * FROM inner_t) x');
    expect(node).not.toBeNull();
    expect(node?.from?.table).toBeUndefined();
    expect(node?.from?.subquery?.from?.table).toBe('inner_t');
  });

  it('returns null for a non-select statement', () => {
    expect(parseSelect('INSERT INTO foo VALUES (1)')).toBeNull();
  });

  it('does not take a clause keyword as the table when the table is missing', () => {
    const missing = parseSelect('SELECT * FROM WHERE Timestamp > now()');
    expect(missing).not.toBeNull();
    expect(missing?.from?.table).toBeUndefined();
    expect(missing?.children?.some((c) => c.clause === ClauseType.Where)).toBe(true);
    expect(parseSelect('SELECT * FROM  WHERE ')?.from?.table).toBeUndefined();
  });

  it('resolves Grafana variables on either side of the dot', () => {
    const dbVar = parseSelect('SELECT * FROM ${db}.my_table')?.from;
    expect(dbVar?.database).toBe('${db}');
    expect(dbVar?.table).toBe('my_table');
    const tableVar = parseSelect('SELECT * FROM my_db.${table}')?.from;
    expect(tableVar?.database).toBe('my_db');
    expect(tableVar?.table).toBe('${table}');
    const bothVar = parseSelect('SELECT * FROM ${db}.${table}')?.from;
    expect(bothVar?.database).toBe('${db}');
    expect(bothVar?.table).toBe('${table}');
  });

  it('does not link an unrelated subquery to a table-function FROM', () => {
    const from = parseSelect("SELECT * FROM merge('default', '^otel') WHERE id IN (SELECT id FROM inner_t)")?.from;
    expect(from?.isTableFunction).toBe(true);
    expect(from?.subquery).toBeUndefined();
  });

  it('does not run away on an unterminated variable while typing', () => {
    // The rest of the query must still parse into clause nodes, so autocomplete
    // keeps working mid-edit.
    const node = parseSelect('SELECT * FROM ${table WHERE ts > 1');
    expect(node).not.toBeNull();
    expect(node?.children?.some((c) => c.clause === ClauseType.Where)).toBe(true);
  });

  it('resolves a db-qualified keyword table name', () => {
    const from = parseSelect('SELECT * FROM default.order')?.from;
    expect(from?.database).toBe('default');
    expect(from?.table).toBe('order');
  });

  it('reconstructs a complete brace variable and bounds a partial one', () => {
    expect(parseSelect('SELECT * FROM ${table}')?.from?.table).toBe('${table}');
    // A space ends an unterminated variable rather than swallowing what follows.
    expect(parseSelect('SELECT * FROM ${table AS t')?.from?.table).toBe('${table');
  });

  it('captures CTE bodies keyed by alias', () => {
    const node = parseSelect('WITH lookup AS (SELECT id FROM dim_services) SELECT * FROM lookup');
    expect(node?.withAliases?.get('lookup')?.from?.table).toBe('dim_services');
    const multi = parseSelect('WITH a AS (SELECT * FROM t_a), b AS (SELECT * FROM t_b) SELECT * FROM b');
    expect(multi?.withAliases?.get('b')?.from?.table).toBe('t_b');
  });

  it('flags a top-level set operation (UNION / INTERSECT / EXCEPT)', () => {
    expect(parseSelect('SELECT a FROM t1 UNION ALL SELECT a FROM t2')?.hasSetOperation).toBe(true);
    expect(parseSelect('SELECT a FROM t1 INTERSECT SELECT a FROM t2')?.hasSetOperation).toBe(true);
    expect(parseSelect('SELECT a FROM t1 EXCEPT SELECT a FROM t2')?.hasSetOperation).toBe(true);
    expect(parseSelect('SELECT a FROM t1')?.hasSetOperation).toBeFalsy();
  });

  it('resolves unqualified FORMAT and PREWHERE as table names', () => {
    expect(parseSelect('SELECT * FROM format')?.from?.table).toBe('format');
    expect(parseSelect('SELECT * FROM prewhere')?.from?.table).toBe('prewhere');
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
