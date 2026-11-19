import { DataQueryError, PanelData } from '@grafana/data';

/**
 * Places a ClickHouse query error in the SQL editor. ClickHouse reports a syntax error with the
 * token it stopped at and where, for example
 * `Syntax error: failed at position 61 (concat) (line 2, col 3): concat(...). Expected one of: token, Comma, FROM`.
 * Line and column are only reported for multi-line queries. The position is in the SQL that ran,
 * after variables and macros were expanded, so on a line where one of them precedes the error the
 * column is off. The token is then looked up on that line, and the whole line is marked when it is
 * not there (for example when the error is inside an expanded macro).
 */

export interface QueryErrorPosition {
  /** 1-based character offset in the SQL that ran. */
  position: number;
  /** 1-based line and column, reported for multi-line queries only. */
  line?: number;
  column?: number;
  /** The token ClickHouse stopped at, for example `concat`, `(` or `end of query`. */
  token: string;
  /** What ClickHouse expected instead. */
  expected: string[];
  /** The kind of error, for example `Syntax error` or `Unrecognized token`. */
  kind: string;
  /** Extra explanation ClickHouse gives, such as an unclosed bracket. */
  detail?: string;
}

export interface QueryErrorMarker {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
}

const endOfQuery = 'end of query';
const maxExpected = 6;

export function parseQueryErrorPosition(message: string): QueryErrorPosition | undefined {
  const match = /failed at position (\d+)/.exec(message);
  if (!match) {
    return undefined;
  }

  let rest = message.substring(match.index + match[0].length);
  let token = '';
  if (rest.startsWith(' (')) {
    rest = rest.substring(2);
    // The bracket tokens print as "(()" and "())".
    if (rest.startsWith('))')) {
      token = ')';
      rest = rest.substring(2);
    } else {
      const close = rest.indexOf(')');
      token = close >= 0 ? rest.substring(0, close) : '';
      rest = close >= 0 ? rest.substring(close + 1) : rest;
    }
  }

  const lineCol = /^ \(line (\d+), col (\d+)\)/.exec(rest);

  return {
    position: Number(match[1]),
    line: lineCol ? Number(lineCol[1]) : undefined,
    column: lineCol ? Number(lineCol[2]) : undefined,
    token,
    expected: parseExpected(message),
    kind: parseKind(message.substring(0, match.index)),
    detail: parseDetail(message),
  };
}

function parseDetail(message: string): string | undefined {
  // Its position is in the expanded SQL, so it is left out.
  const unmatched = /Unmatched parentheses: ('.') at position \d+ is never closed/.exec(message);
  return unmatched ? `Unmatched parentheses: ${unmatched[1]} is never closed.` : undefined;
}

function parseExpected(message: string): string[] {
  const start = message.lastIndexOf('Expected ');
  if (start < 0) {
    return [];
  }

  let list = message.substring(start + 'Expected '.length).split('\n')[0];
  list = list.replace(/^one of:\s*/, '').replace(/\s*\((?:SYNTAX_ERROR|version [^)]*)\).*$/, '');
  return list
    .split(', ')
    .map((item) => item.trim().replace(/\.$/, ''))
    .filter((item) => item.length > 0);
}

function parseKind(prefix: string): string {
  if (prefix.includes('Unrecognized token')) {
    return 'Unrecognized token';
  }
  const kind = /(Syntax error(?: \([^)]*\))?)\s*:?\s*$/.exec(prefix);
  return kind ? kind[1] : 'Syntax error';
}

function describe(error: QueryErrorPosition): string {
  const quoted = /^['"`]/.test(error.token) ? error.token : `"${error.token}"`;
  const where = error.token === endOfQuery ? ' at the end of the query' : error.token ? ` at ${quoted}` : '';
  const shown = error.expected.slice(0, maxExpected).join(', ') + (error.expected.length > maxExpected ? ', …' : '');
  if (error.detail) {
    return `${error.kind}${where}. ${error.detail}`;
  }
  if (error.expected.length === 0) {
    return `${error.kind}${where}.`;
  }
  return error.expected.length === 1
    ? `${error.kind}${where}. Expected ${shown}.`
    : `${error.kind}${where}. Expected one of: ${shown}`;
}

/** Turns a ClickHouse error message into an editor marker for `sql`, or undefined when it has no position. */
export function getQueryErrorMarker(message: string, sql: string): QueryErrorMarker | undefined {
  const error = parseQueryErrorPosition(message);
  if (!error) {
    return undefined;
  }

  const lines = sql.split('\n');
  const text = describe(error);
  if (error.token === endOfQuery) {
    return markLastWord(lines, text);
  }

  const lineNumber = error.line ?? 1;
  const lineText = lines[lineNumber - 1];
  if (lineText === undefined) {
    // The error is past the end of what the user wrote, for example in appended ad-hoc filter SETTINGS.
    return undefined;
  }

  const index = (error.column ?? error.position) - 1;
  const [start, end] = findOnLine(lineText, index, error.token);
  return {
    startLineNumber: lineNumber,
    startColumn: start + 1,
    endLineNumber: lineNumber,
    endColumn: end + 1,
    message: text,
  };
}

/**
 * The [start, end) of the token on the line. The reported index is trusted when no variable or
 * macro precedes it on the line and the token is there; otherwise the occurrence closest to it is
 * used, and the whole line when the token is not on it.
 */
function findOnLine(lineText: string, index: number, token: string): [number, number] {
  if (token) {
    const shifted = lineText.substring(0, index).includes('$');
    if (!shifted && lineText.startsWith(token, index)) {
      return [index, index + token.length];
    }

    let closest = -1;
    for (let i = lineText.indexOf(token); i >= 0; i = lineText.indexOf(token, i + 1)) {
      if (closest < 0 || Math.abs(i - index) < Math.abs(closest - index)) {
        closest = i;
      }
    }
    if (closest >= 0) {
      return [closest, closest + token.length];
    }
  }

  const firstNonSpace = lineText.search(/\S/);
  return firstNonSpace < 0 ? [0, Math.max(lineText.length, 1)] : [firstNonSpace, lineText.length];
}

function markLastWord(lines: string[], message: string): QueryErrorMarker | undefined {
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = /(\S+)\s*$/.exec(lines[i]);
    if (match) {
      const start = match.index + 1;
      return {
        startLineNumber: i + 1,
        startColumn: start,
        endLineNumber: i + 1,
        endColumn: start + match[1].length,
        message,
      };
    }
  }
  return undefined;
}

function errorMessages(error: DataQueryError): string[] {
  return [error.message, error.data?.message].filter((m): m is string => typeof m === 'string' && m.length > 0);
}

/**
 * Markers for the run errors of query `refId` in `data`. Errors are skipped when the SQL that ran
 * differs from the editor text, since their positions belong to the earlier text.
 */
export function getRunErrorMarkers(data: PanelData | undefined, refId: string, sql: string): QueryErrorMarker[] {
  if (!data) {
    return [];
  }

  const ran = data.request?.targets.find((target) => target.refId === refId);
  if (ran && 'rawSql' in ran && typeof ran.rawSql === 'string' && ran.rawSql !== sql) {
    return [];
  }

  for (const error of data.errors ?? []) {
    if (error.refId && error.refId !== refId) {
      continue;
    }
    for (const message of errorMessages(error)) {
      const marker = getQueryErrorMarker(message, sql);
      if (marker) {
        return [marker];
      }
    }
  }
  return [];
}
