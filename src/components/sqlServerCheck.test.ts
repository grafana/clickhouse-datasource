import { DataQueryRequest, DataQueryResponse, getDefaultTimeRange, LoadingState } from '@grafana/data';
import { NEVER, Observable, of } from 'rxjs';
import { Datasource } from 'data/CHDatasource';
import { CHQuery } from 'types/sql';
import { classify, createSqlServerCheck, hasScalarSubquery, toEditorCoordinates } from './sqlServerCheck';

const missingComma =
  "SELECT toStartOfInterval(Timestamp, INTERVAL 1 HOUR) AS t\n  concat(ServiceName, ' ', SeverityText) AS s, count() AS n\nFROM otel.otel_logs";
// What ClickHouse 26.11 answers for that query with `EXPLAIN QUERY TREE` on a line above it.
const syntaxError =
  "code: 62, message: Syntax error: failed at position 80 (concat) (line 3, col 3): concat(ServiceName, ' ', SeverityText) AS s, count() AS n FROM otel.otel_logs. Expected one of: token, Comma, FROM, PREWHERE, WHERE, GROUP BY, WITH, HAVING, WINDOW, QUALIFY, ORDER BY, LIMIT, end of query";

const failed = (message: string): DataQueryResponse => ({ data: [], state: LoadingState.Error, errors: [{ message }] });
const done: DataQueryResponse = { data: [], state: LoadingState.Done };

let uid = 0;
function fakeDatasource(answer: () => Observable<DataQueryResponse>) {
  const query = jest.fn((_request: DataQueryRequest<CHQuery>) => answer());
  uid += 1;
  return { datasource: { uid: `ds-${uid}`, query } as unknown as Datasource, query };
}
const sent = (query: jest.Mock): string[] => query.mock.calls.map((call) => call[0].targets[0].rawSql);

describe('hasScalarSubquery', () => {
  it('finds subqueries that resolving names would execute', () => {
    expect(hasScalarSubquery('SELECT (SELECT count() FROM otel.otel_logs)')).toBe(true);
    expect(hasScalarSubquery('SELECT a FROM t WHERE b > (SELECT avg(b) FROM t)')).toBe(true);
    expect(hasScalarSubquery('WITH (SELECT max(x) FROM t) AS m SELECT m')).toBe(true);
  });

  it('leaves tables, CTEs, IN lists and set operations alone', () => {
    expect(hasScalarSubquery('SELECT * FROM (SELECT 1)')).toBe(false);
    expect(hasScalarSubquery('WITH a AS (SELECT 1) SELECT * FROM a')).toBe(false);
    expect(hasScalarSubquery('SELECT * FROM t WHERE x IN (SELECT y FROM u)')).toBe(false);
    expect(hasScalarSubquery('SELECT * FROM t LEFT JOIN (SELECT 1 AS k) USING k')).toBe(false);
    expect(hasScalarSubquery('(SELECT 1) UNION ALL (SELECT 2)')).toBe(false);
  });
});

describe('classify', () => {
  it('moves the position back to the editor text', () => {
    expect(toEditorCoordinates(syntaxError, 'tree')).toContain('failed at position 61 (concat) (line 2, col 3)');
  });

  it('turns a syntax error into a marker on the token', () => {
    expect(classify(failed(syntaxError), missingComma, 'tree')).toEqual({
      kind: 'syntax',
      atEnd: false,
      marker: {
        startLineNumber: 2,
        startColumn: 3,
        endLineNumber: 2,
        endColumn: 9,
        message: 'Syntax error at "concat". Expected one of: ",", FROM, WHERE, GROUP BY, ORDER BY, LIMIT, …',
      },
    });
  });

  it('tells an error at the end of the query apart', () => {
    const message =
      'code: 62, message: Syntax error: failed at position 61 (end of query) (line 2, col 42): . Expected one of: expression with optional alias';
    expect(classify(failed(message), 'SELECT count() FROM otel.otel_logs WHERE ', 'tree')).toMatchObject({
      kind: 'syntax',
      atEnd: true,
    });
  });

  it('marks every use of an unknown column', () => {
    const message =
      "code: 47, message: Unknown expression identifier `ServiceNme`. Maybe you meant: ['ServiceName']. In scope SELECT ServiceNme FROM otel_logs";
    const outcome = classify(failed(message), 'SELECT ServiceNme FROM otel_logs GROUP BY ServiceNme', 'tree');
    expect(outcome).toMatchObject({ kind: 'names' });
    expect(outcome.kind === 'names' && outcome.markers.map((m) => m.startColumn)).toEqual([8, 43]);
  });

  it('skips a variable this editor cannot resolve', () => {
    const message =
      'code: 62, message: Syntax error: failed at position 65 ($) (line 2, col 46): ${service}. Expected one of: CAST operator';
    expect(classify(failed(message), 'SELECT * FROM otel.otel_logs WHERE service = ${service}', 'tree')).toEqual({
      kind: 'skipped',
      reason: 'unresolved variable',
    });
  });

  it('keeps going on other ClickHouse and plugin errors, which Run reports', () => {
    for (const message of [
      "code: 181, message: Storage MergeTree doesn't support FINAL",
      'code: 43, message: Illegal type String of argument of function sum',
      'Could not apply macros: macro $__timeFilter(): unexpected number of arguments',
    ]) {
      expect(classify(failed(message), 'SELECT 1', 'tree')).toEqual({
        kind: 'skipped',
        reason: 'error without a position',
      });
    }
  });

  it('treats network, quota and authentication failures as the server being unavailable', () => {
    for (const message of [
      '[timeout] dial tcp 10.255.255.1:9440: i/o timeout',
      'code: 516, message: default: Authentication failed',
      'code: 202, message: Too many simultaneous queries',
      'Request failed with status 502',
    ]) {
      expect(classify(failed(message), 'SELECT 1', 'tree')).toMatchObject({ kind: 'unavailable' });
    }
    expect(classify(done, 'SELECT 1', 'tree')).toEqual({ kind: 'ok' });
  });
});

describe('createSqlServerCheck', () => {
  let now = 1_000_000;
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => jest.restoreAllMocks());

  it('sends nothing for empty text, a lexer error, or text it already checked', async () => {
    const { datasource, query } = fakeDatasource(() => of(done));
    const check = createSqlServerCheck(datasource, 'A', getDefaultTimeRange);
    await expect(check.check('   ')).resolves.toEqual({ kind: 'skipped', reason: 'empty' });
    await expect(check.check("SELECT 'unclosed")).resolves.toEqual({ kind: 'skipped', reason: 'lexer error' });
    await expect(check.check('SELECT 1')).resolves.toEqual({ kind: 'ok' });
    await expect(check.check('SELECT 1')).resolves.toEqual({ kind: 'ok' });
    expect(sent(query)).toEqual(['EXPLAIN QUERY TREE\nSELECT 1\n-- grafana: query check']);
    expect(query.mock.calls[0][0].hideFromInspector).toBe(true);
  });

  it('only parses a query with a scalar subquery', async () => {
    const { datasource, query } = fakeDatasource(() => of(done));
    await createSqlServerCheck(datasource, 'A', getDefaultTimeRange).check('SELECT (SELECT count() FROM t)');
    expect(sent(query)[0].startsWith('EXPLAIN AST\n')).toBe(true);
  });

  it('only parses from then on when the server has no query trees', async () => {
    let answer = failed('code: 48, message: EXPLAIN QUERY TREE is only supported with a new analyzer');
    const { datasource, query } = fakeDatasource(() => of(answer));
    const check = createSqlServerCheck(datasource, 'A', getDefaultTimeRange);
    await expect(check.check('SELECT 1')).resolves.toEqual({ kind: 'skipped', reason: 'no query tree on this server' });
    answer = done;
    await check.check('SELECT 2');
    expect(sent(query).map((sql) => sql.split('\n')[0])).toEqual(['EXPLAIN QUERY TREE', 'EXPLAIN AST']);
  });

  it('limits how often one data source is asked, across editors, and says when to ask again', async () => {
    const { datasource } = fakeDatasource(() => of(done));
    const a = createSqlServerCheck(datasource, 'A', getDefaultTimeRange);
    const b = createSqlServerCheck(datasource, 'B', getDefaultTimeRange);
    const outcomes = [
      await a.check('SELECT 1'),
      await b.check('SELECT 2'),
      await a.check('SELECT 3'),
      await b.check('SELECT 4'),
    ];
    expect(outcomes.map((o) => o.kind)).toEqual(['ok', 'ok', 'ok', 'skipped']);
    expect(outcomes[3]).toEqual({ kind: 'skipped', reason: 'rate limited', retryInMs: 3000 });
    now += 3000;
    await expect(b.check('SELECT 4')).resolves.toEqual({ kind: 'ok' });
  });

  it('pauses after three failures in a row, pauses longer after one more, then resumes', async () => {
    let answer = failed('[timeout] dial tcp 10.255.255.1:9440: i/o timeout');
    const { datasource, query } = fakeDatasource(() => of(answer));
    const check = createSqlServerCheck(datasource, 'A', getDefaultTimeRange);
    for (const sql of ['SELECT 1', 'SELECT 2', 'SELECT 3']) {
      await expect(check.check(sql)).resolves.toMatchObject({ kind: 'unavailable' });
      now += 3000;
    }
    await expect(check.check('SELECT 4')).resolves.toEqual({ kind: 'skipped', reason: 'paused after failures' });
    now += 30000;
    await expect(check.check('SELECT 4')).resolves.toMatchObject({ kind: 'unavailable' });
    now += 30000;
    await expect(check.check('SELECT 5')).resolves.toEqual({ kind: 'skipped', reason: 'paused after failures' });
    now += 30000;
    answer = done;
    await expect(check.check('SELECT 5')).resolves.toEqual({ kind: 'ok' });
    expect(query).toHaveBeenCalledTimes(5);
  });

  it('does not pause on errors that are the query, not the server', async () => {
    const { datasource, query } = fakeDatasource(() =>
      of(failed("code: 181, message: Storage MergeTree doesn't support FINAL"))
    );
    const check = createSqlServerCheck(datasource, 'A', getDefaultTimeRange);
    for (const sql of ['SELECT 1 FINAL', 'SELECT 2 FINAL', 'SELECT 3 FINAL', 'SELECT 4 FINAL']) {
      await check.check(sql);
      now += 3000;
    }
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('gives up on a slow answer and cancels a check that newer text replaced', async () => {
    jest.useFakeTimers({ doNotFake: ['Date'] });
    const { datasource } = fakeDatasource(() => NEVER);
    const check = createSqlServerCheck(datasource, 'A', getDefaultTimeRange);
    const first = check.check('SELECT 1');
    const second = check.check('SELECT 2');
    await expect(first).resolves.toEqual({ kind: 'skipped', reason: 'superseded' });
    jest.advanceTimersByTime(4000);
    await expect(second).resolves.toEqual({ kind: 'unavailable', reason: 'timeout' });
    jest.useRealTimers();
  });
});
