import { DataQueryError, DataQueryRequest, getDefaultTimeRange, LoadingState, PanelData } from '@grafana/data';
import { getQueryErrorMarker, getRunErrorMarkers, parseQueryErrorPosition } from './sqlErrorMarker';

const multiLineSql =
  "SELECT toStartOfInterval(Timestamp, INTERVAL 1 HOUR) AS t\n  concat(ServiceName, ' ', SeverityText) AS s, count() AS n\nFROM otel_logs\nGROUP BY t, s";

const expectedAfterMissingComma =
  'token, Comma, FROM, PREWHERE, WHERE, GROUP BY, WITH, HAVING, WINDOW, QUALIFY, ORDER BY, LIMIT, OFFSET, FETCH, SETTINGS, UNION, EXCEPT, INTERSECT, INTO OUTFILE, FORMAT, ParallelWithClause, PARALLEL WITH, end of query';

// As the plugin backend reports it (native protocol).
const nativeMissingComma =
  "error querying the database: code: 62, message: Syntax error: failed at position 61 (concat) (line 2, col 3): concat(ServiceName, ' ', SeverityText) AS s, count() AS n\nFROM otel_logs\nGROUP BY t, s. Expected one of: " +
  expectedAfterMissingComma;

// As the HTTP interface reports it.
const httpMissingComma =
  "Code: 62. DB::Exception: Syntax error: failed at position 61 (concat) (line 2, col 3): concat(ServiceName, ' ', SeverityText) AS s, count() AS n\nFROM otel_logs\nGROUP BY t, s. Expected one of: " +
  expectedAfterMissingComma +
  '. (SYNTAX_ERROR) (version 26.11.1.1102 (official build))';

const endOfQuery =
  'Code: 62. DB::Exception: Syntax error: failed at position 36 (end of query): . Expected one of: expression with optional alias, element of expression with optional alias, lambda expression. (SYNTAX_ERROR) (version 26.11.1.1102 (official build))';

const unclosedBracket =
  "Code: 62. DB::Exception: Syntax error: failed at position 20 (otel_logs): otel_logs. Unmatched parentheses: '(' at position 13 is never closed. (SYNTAX_ERROR) (version 26.11.1.1102 (official build))";

const unknownIdentifier =
  'Code: 47. DB::Exception: Unknown expression identifier `foo`. In scope SELECT foo FROM otel_logs. (UNKNOWN_IDENTIFIER) (version 26.11.1.1102 (official build))';

describe('parseQueryErrorPosition', () => {
  it('reads the position, line, column, token and expected tokens', () => {
    const error = parseQueryErrorPosition(nativeMissingComma);
    expect(error).toMatchObject({ position: 61, line: 2, column: 3, token: 'concat', kind: 'Syntax error' });
    expect(error?.expected.slice(0, 3)).toEqual(['token', 'Comma', 'FROM']);
    expect(error?.expected[error.expected.length - 1]).toBe('end of query');
  });

  it('drops the error code and version the HTTP interface appends', () => {
    const error = parseQueryErrorPosition(httpMissingComma);
    expect(error?.expected).toEqual(expectedAfterMissingComma.split(', '));
  });

  it('reads a single-line error, which has no line and column', () => {
    const error = parseQueryErrorPosition(endOfQuery);
    expect(error).toMatchObject({ position: 36, line: undefined, column: undefined, token: 'end of query' });
    expect(error?.expected).toEqual([
      'expression with optional alias',
      'element of expression with optional alias',
      'lambda expression',
    ]);
  });

  it('reads bracket tokens', () => {
    expect(parseQueryErrorPosition('Syntax error: failed at position 26 ((): (EventTime')?.token).toBe('(');
    expect(parseQueryErrorPosition('Syntax error: failed at position 30 ()): ) FROM t')?.token).toBe(')');
  });

  it('reads unrecognized tokens', () => {
    const error = parseQueryErrorPosition(
      'Code: 62. DB::Exception: Unrecognized token: Syntax error: failed at position 10 (#): #comment. . (SYNTAX_ERROR)'
    );
    expect(error).toMatchObject({ position: 10, token: '#', kind: 'Unrecognized token', expected: [] });
  });

  it('returns undefined for an error without a position', () => {
    expect(parseQueryErrorPosition(unknownIdentifier)).toBeUndefined();
  });
});

describe('getQueryErrorMarker', () => {
  it('marks the token at the reported line and column', () => {
    expect(getQueryErrorMarker(nativeMissingComma, multiLineSql)).toEqual({
      startLineNumber: 2,
      startColumn: 3,
      endLineNumber: 2,
      endColumn: 9,
      message: 'Syntax error at "concat". Expected one of: token, Comma, FROM, PREWHERE, WHERE, GROUP BY, …',
    });
  });

  it('finds the token on the line when a macro before it shifted the column', () => {
    const line = "FROM otel_logs WHERE $__timeFilter(Timestamp) AND SeverityText IN ('ERROR' 'WARN')";
    const sql = `SELECT count() AS n\n${line}`;
    // Expanded, $__timeFilter is much longer, so ClickHouse reports a column further right.
    const message = "Syntax error: failed at position 190 ('WARN') (line 2, col 140): 'WARN'). Expected one of: Comma";

    const marker = getQueryErrorMarker(message, sql);
    expect(marker).toMatchObject({ startLineNumber: 2, startColumn: line.indexOf("'WARN'") + 1 });
    expect(marker?.endColumn).toBe(line.indexOf("'WARN'") + 1 + "'WARN'".length);
  });

  it('marks the whole line when the token is not in the editor text', () => {
    const line = '  WHERE $__timeFilter(Timestamp)';
    const message = 'Syntax error: failed at position 60 (toDateTime) (line 2, col 30): toDateTime(';

    expect(getQueryErrorMarker(message, `SELECT count()\n${line}`)).toMatchObject({
      startLineNumber: 2,
      startColumn: 3,
      endColumn: line.length + 1,
    });
  });

  it('uses the position of a single-line query', () => {
    const sql = "SELECT count() FROM otel_logs WHERE SeverityText IN ('ERROR' 'WARN')";
    const position = sql.indexOf("'WARN'") + 1;
    const message = `Syntax error: failed at position ${position} ('WARN'): 'WARN'). Expected one of: Comma`;

    expect(getQueryErrorMarker(message, sql)).toMatchObject({ startLineNumber: 1, startColumn: position });
  });

  it('searches the token in a single-line query when a macro precedes the position', () => {
    const sql = "SELECT count() FROM otel_logs WHERE $__timeFilter(Timestamp) AND SeverityText IN ('ERROR' 'WARN')";
    const message = "Syntax error: failed at position 160 ('WARN'): 'WARN'). Expected one of: Comma";

    expect(getQueryErrorMarker(message, sql)).toMatchObject({ startColumn: sql.indexOf("'WARN'") + 1 });
  });

  it('marks the last word when the query ends too early', () => {
    const sql = 'SELECT count() FROM otel_logs WHERE';

    expect(getQueryErrorMarker(endOfQuery, sql)).toEqual({
      startLineNumber: 1,
      startColumn: 31,
      endLineNumber: 1,
      endColumn: 36,
      message:
        'Syntax error at the end of the query. Expected one of: expression with optional alias, element of expression with optional alias, lambda expression',
    });
  });

  it('explains an unclosed bracket', () => {
    expect(getQueryErrorMarker(unclosedBracket, 'SELECT count( FROM otel_logs')).toEqual({
      startLineNumber: 1,
      startColumn: 20,
      endLineNumber: 1,
      endColumn: 29,
      message: `Syntax error at "otel_logs". Unmatched parentheses: '(' is never closed.`,
    });
  });

  it('skips an error past the end of the editor text', () => {
    const message = 'Syntax error: failed at position 90 (SETTINGS) (line 5, col 1): SETTINGS';

    expect(getQueryErrorMarker(message, 'SELECT 1\nFROM t')).toBeUndefined();
  });

  it('returns undefined for an error without a position', () => {
    expect(getQueryErrorMarker(unknownIdentifier, 'SELECT foo FROM otel_logs')).toBeUndefined();
  });
});

describe('getRunErrorMarkers', () => {
  const panelData = (errors: DataQueryError[] | undefined, ranSql?: string): PanelData => ({
    state: LoadingState.Error,
    series: [],
    timeRange: getDefaultTimeRange(),
    errors,
    request:
      ranSql === undefined ? undefined : ({ targets: [{ refId: 'A', rawSql: ranSql }] } as unknown as DataQueryRequest),
  });

  it('marks the error of this query', () => {
    const markers = getRunErrorMarkers(
      panelData([{ refId: 'A', message: nativeMissingComma }], multiLineSql),
      'A',
      multiLineSql
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ startLineNumber: 2, startColumn: 3 });
  });

  it('ignores the errors of other queries', () => {
    const data = panelData([{ refId: 'B', message: nativeMissingComma }], multiLineSql);
    expect(getRunErrorMarkers(data, 'A', multiLineSql)).toEqual([]);
  });

  it('ignores an error from SQL that has changed since it ran', () => {
    const data = panelData([{ refId: 'A', message: nativeMissingComma }], multiLineSql);
    expect(getRunErrorMarkers(data, 'A', `${multiLineSql} LIMIT 10`)).toEqual([]);
  });

  it('reads a message nested in the error data', () => {
    expect(
      getRunErrorMarkers(panelData([{ refId: 'A', data: { message: nativeMissingComma } }]), 'A', multiLineSql)
    ).toHaveLength(1);
  });

  it('returns no markers without data', () => {
    expect(getRunErrorMarkers(undefined, 'A', multiLineSql)).toEqual([]);
  });
});
