import { DataQueryError, DataQueryRequest, getDefaultTimeRange, LoadingState, PanelData } from '@grafana/data';
import {
  getQueryErrorMarker,
  getRunErrorMarkers,
  getUnknownNameMarkers,
  parseQueryErrorPosition,
  parseUnknownName,
} from './sqlErrorMarker';

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
      message: 'Syntax error at "concat". Expected one of: ",", FROM, WHERE, GROUP BY, ORDER BY, LIMIT, …',
    });
  });

  it('names punctuation as it is typed and leaves out internal token names', () => {
    const message = "Syntax error: failed at position 160 ('WARN'): 'WARN'). Expected one of: token, Comma";

    expect(getQueryErrorMarker(message, "SELECT 1 WHERE x IN ('ERROR' 'WARN')")?.message).toBe(
      `Syntax error at 'WARN'. Expected ",".`
    );
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

  it('explains an unclosed bracket in a multi-line query', () => {
    const message =
      "Code: 62. DB::Exception: Syntax error: failed at position 20 (otel_logs) (line 2, col 6): otel_logs. Unmatched parentheses: '(' at position 13 (line 1, col 13) is never closed. (SYNTAX_ERROR) (version 26.11.1.1102 (official build))";

    expect(getQueryErrorMarker(message, 'SELECT count(\nFROM otel_logs')).toEqual({
      startLineNumber: 2,
      startColumn: 6,
      endLineNumber: 2,
      endColumn: 15,
      message: `Syntax error at "otel_logs". Unmatched parentheses: '(' is never closed.`,
    });
  });

  it('explains a closing bracket without an opening one', () => {
    const message =
      "Code: 62. DB::Exception: Syntax error: failed at position 30 ()) (line 2, col 15): ). Unmatched parentheses: ')' at position 30 (line 2, col 15) has no matching opening bracket. (SYNTAX_ERROR) (version 26.11.1.1102 (official build))";

    expect(getQueryErrorMarker(message, 'SELECT count()\nFROM otel_logs)')).toEqual({
      startLineNumber: 2,
      startColumn: 15,
      endLineNumber: 2,
      endColumn: 16,
      message: `Syntax error at ")". Unmatched parentheses: ')' has no matching opening bracket.`,
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

  it('marks every use of an unknown column', () => {
    const sql = 'SELECT ServiceNme, count() FROM otel_logs GROUP BY ServiceNme';
    const markers = getRunErrorMarkers(panelData([{ refId: 'A', message: unknownColumn }], sql), 'A', sql);
    expect(markers.map((m) => m.startColumn)).toEqual([8, 52]);
  });
});

// Messages as ClickHouse 26.11 reports them, through the plugin (native) and the HTTP interface.
const unknownColumn =
  "error querying the database: code: 47, message: Unknown expression identifier `ServiceNme`. Maybe you meant: ['ServiceName']. In scope SELECT ServiceNme, count() FROM otel_logs GROUP BY ServiceNme";
const unknownColumnOrFunction =
  "Code: 47. DB::Exception: Unknown expression or function identifier `SeverityTxt`. Maybe you meant: ['SeverityText']. In scope SELECT count() AS n FROM otel_logs WHERE SeverityTxt = 'ERROR'. (UNKNOWN_IDENTIFIER) (version 26.11.1.1102 (official build))";
const unknownFunction =
  "Code: 46. DB::Exception: Function with name `counts` does not exist. Maybe you meant: ['count']. In scope SELECT counts() FROM otel_logs. (UNKNOWN_FUNCTION) (version 26.11.1.1102 (official build))";
const unknownTable =
  "Code: 60. DB::Exception: Unknown table expression identifier 'otel.otel_logz'. Maybe you meant otel.otel_logs? In scope SELECT count() FROM otel.otel_logz. (UNKNOWN_TABLE) (version 26.11.1.1102 (official build))";
const unknownDatabase =
  'Code: 81. DB::Exception: Database telemetry does not exist. (UNKNOWN_DATABASE) (version 26.11.1.1102 (official build))';
const unknownQuotedColumn =
  'Code: 47. DB::Exception: Unknown expression identifier `deployment.environment.nme`. In scope SELECT `deployment.environment.nme` FROM otel_logs LIMIT 1. (UNKNOWN_IDENTIFIER) (version 26.11.1.1102 (official build))';
// The wording of servers older than the analyzer.
const olderMissingColumn =
  "Code: 47. DB::Exception: Missing columns: 'ServiceNme' while processing query: 'SELECT ServiceNme FROM otel_logs', required columns: 'ServiceNme', maybe you meant: ['ServiceName']. (UNKNOWN_IDENTIFIER)";
const olderMissingColumns =
  "Code: 47. DB::Exception: Missing columns: 'a' 'b' while processing query: 'SELECT a, b FROM t'";

describe('parseUnknownName', () => {
  it.each([
    ['a column', unknownColumn, { kind: 'column', names: ['ServiceNme'], suggestion: 'ServiceName' }],
    [
      'a column or function',
      unknownColumnOrFunction,
      { kind: 'column or function', names: ['SeverityTxt'], suggestion: 'SeverityText' },
    ],
    ['a function', unknownFunction, { kind: 'function', names: ['counts'], suggestion: 'count' }],
    ['a qualified table', unknownTable, { kind: 'table', names: ['otel.otel_logz'], suggestion: 'otel.otel_logs' }],
    ['a database with no suggestion', unknownDatabase, { kind: 'database', names: ['telemetry'] }],
    ['a quoted column with dots', unknownQuotedColumn, { kind: 'column', names: ['deployment.environment.nme'] }],
    [
      'a missing column on an older server',
      olderMissingColumn,
      { kind: 'column', names: ['ServiceNme'], suggestion: 'ServiceName' },
    ],
    ['several missing columns on an older server', olderMissingColumns, { kind: 'column', names: ['a', 'b'] }],
  ])('reads %s', (_label, message, expected) => {
    expect(parseUnknownName(message)).toEqual(expected);
  });

  it('returns undefined for a syntax error', () => {
    expect(parseUnknownName(httpMissingComma)).toBeUndefined();
  });
});

describe('getUnknownNameMarkers', () => {
  it('marks every use of the column, outside strings and comments', () => {
    const sql =
      "SELECT ServiceNme, count() FROM otel_logs\n-- ServiceNme\nWHERE ServiceNme != 'ServiceNme' AND ServiceNmeX = 1\nGROUP BY ServiceNme";
    const message = 'Unknown column "ServiceNme". Did you mean "ServiceName"?';
    expect(getUnknownNameMarkers(unknownColumn, sql)).toEqual([
      { startLineNumber: 1, startColumn: 8, endLineNumber: 1, endColumn: 18, message },
      { startLineNumber: 3, startColumn: 7, endLineNumber: 3, endColumn: 17, message },
      { startLineNumber: 4, startColumn: 10, endLineNumber: 4, endColumn: 20, message },
    ]);
  });

  it('marks a quoted column whose name has dots', () => {
    expect(getUnknownNameMarkers(unknownQuotedColumn, 'SELECT `deployment.environment.nme` FROM otel_logs')).toEqual([
      {
        startLineNumber: 1,
        startColumn: 8,
        endLineNumber: 1,
        endColumn: 36,
        message: 'Unknown column "deployment.environment.nme".',
      },
    ]);
  });

  it('marks a qualified table written with a dot', () => {
    expect(getUnknownNameMarkers(unknownTable, 'SELECT count()\nFROM otel.otel_logz')).toEqual([
      {
        startLineNumber: 2,
        startColumn: 6,
        endLineNumber: 2,
        endColumn: 20,
        message: 'Unknown table "otel.otel_logz". Did you mean "otel.otel_logs"?',
      },
    ]);
  });

  it('marks a function', () => {
    expect(getUnknownNameMarkers(unknownFunction, 'SELECT counts() FROM otel_logs')).toMatchObject([
      { startColumn: 8, endColumn: 14, message: 'Unknown function "counts". Did you mean "count"?' },
    ]);
  });

  it('marks nothing when the name only comes from a variable', () => {
    expect(getUnknownNameMarkers(unknownTable, 'SELECT count() FROM $table')).toEqual([]);
  });

  it('returns no markers for a syntax error', () => {
    expect(getUnknownNameMarkers(httpMissingComma, multiLineSql)).toEqual([]);
  });
});
