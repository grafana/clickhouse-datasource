import { DataQueryError, PanelData } from '@grafana/data';
import { Lexer } from 'ch-parser/lexer';
import { unquoteIdentifier } from 'ch-parser/spans';
import { Token, TokenType } from 'ch-parser/types';
import { offsetToLineCol } from 'data/validate';

/**
 * Places a ClickHouse query error in the SQL editor. ClickHouse reports a syntax error with the
 * token it stopped at and where, for example
 * `Syntax error: failed at position 61 (concat) (line 2, col 3): concat(...). Expected one of: token, Comma, FROM`.
 * Line and column are only reported for multi-line queries. The position is in the SQL that ran,
 * after variables and macros were expanded, so on a line where one of them precedes the error the
 * column is off. The token is then looked up on that line, and the whole line is marked when it is
 * not there (for example when the error is inside an expanded macro).
 *
 * An unknown column, function, table or database has no position, but the error names it, for
 * example `Unknown expression identifier `ServiceNme`. Maybe you meant: ['ServiceName']`. Every
 * place the editor text uses that name is marked, outside strings and comments.
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

type UnknownNameKind = 'column' | 'column or function' | 'function' | 'table' | 'database';

export interface UnknownNameError {
  kind: UnknownNameKind;
  /** The names ClickHouse could not find, as it reports them, for example `otel.otel_logz`. */
  names: string[];
  /** ClickHouse's first suggestion, when it has one. */
  suggestion?: string;
}

// The analyzer's wording first (ClickHouse 24.3 and later), then the older one.
const unknownNamePatterns: Array<{ kind: UnknownNameKind; pattern: RegExp }> = [
  { kind: 'column or function', pattern: /Unknown expression or function identifier `([^`]+)`/ },
  { kind: 'column', pattern: /Unknown expression identifier `([^`]+)`/ },
  { kind: 'function', pattern: /Function with name `([^`]+)` does not exist/ },
  { kind: 'table', pattern: /Unknown table expression identifier '([^']+)'/ },
  { kind: 'database', pattern: /Database `?([^\s`]+?)`? does(?: not|n't) exist/ },
  { kind: 'function', pattern: /Unknown function ([\w$]+)/ },
  { kind: 'table', pattern: /Table `?([^\s`]+?)`? does(?: not|n't) exist/ },
];

export function parseUnknownName(message: string): UnknownNameError | undefined {
  // Older servers list every missing column: `Missing columns: 'a' 'b' while processing query`.
  const missing = /Missing columns: ((?:'[^']+'\s*)+)/.exec(message);
  if (missing) {
    const names = Array.from(missing[1].matchAll(/'([^']+)'/g), (m) => m[1]);
    return { kind: 'column', names, suggestion: names.length === 1 ? parseSuggestion(message) : undefined };
  }

  for (const { kind, pattern } of unknownNamePatterns) {
    const match = pattern.exec(message);
    if (match) {
      return { kind, names: [match[1].replace(/`/g, '')], suggestion: parseSuggestion(message) };
    }
  }
  return undefined;
}

// `Maybe you meant: ['ServiceName']` for columns and functions, `Maybe you meant otel.otel_logs?` for tables.
function parseSuggestion(message: string): string | undefined {
  const list = /maybe you meant:\s*\[\s*'([^']+)'/i.exec(message);
  if (list) {
    return list[1];
  }
  const single = /Maybe you meant ([^\s?]+)\?/.exec(message);
  return single ? single[1] : undefined;
}

function describeUnknownName(error: UnknownNameError, name: string): string {
  const suggestion = error.suggestion ? ` Did you mean "${error.suggestion}"?` : '';
  return `Unknown ${error.kind} "${name}".${suggestion}`;
}

/**
 * The [begin, end) offsets of every place `sql` uses `name` as an identifier, quoted or not. A
 * dotted name such as `db.table` also matches its parts written with dots in between, and is
 * matched whole when it is one quoted identifier such as `deployment.environment.name`.
 */
function findIdentifier(sql: string, name: string): Array<[number, number]> {
  const tokens: Token[] = [];
  const lexer = new Lexer(sql);
  for (let token = lexer.nextToken(); !token.isEnd() && !token.isError(); token = lexer.nextToken()) {
    if (token.isSignificant()) {
      tokens.push(token);
    }
  }

  const identifierText = (i: number): string | undefined => {
    const token = tokens[i];
    if (token?.type === TokenType.BareWord) {
      return token.text;
    }
    return token?.type === TokenType.QuotedIdentifier ? unquoteIdentifier(token.text) : undefined;
  };

  const parts = name.split('.');
  const found: Array<[number, number]> = [];
  for (let i = 0; i < tokens.length; i++) {
    if (identifierText(i) === name) {
      found.push([tokens[i].begin, tokens[i].end]);
      continue;
    }
    if (parts.length < 2) {
      continue;
    }
    const last = i + 2 * (parts.length - 1);
    const matches = parts.every(
      (part, p) => identifierText(i + 2 * p) === part && (p === 0 || tokens[i + 2 * p - 1]?.type === TokenType.Dot)
    );
    if (matches) {
      found.push([tokens[i].begin, tokens[last].end]);
      i = last;
    }
  }
  return found;
}

/** Markers on every use of the names an unknown column, function, table or database error reports. */
export function getUnknownNameMarkers(message: string, sql: string): QueryErrorMarker[] {
  const error = parseUnknownName(message);
  if (!error) {
    return [];
  }

  return error.names.flatMap((name) =>
    findIdentifier(sql, name).map(([begin, end]) => {
      const start = offsetToLineCol(sql, begin);
      const stop = offsetToLineCol(sql, end);
      return {
        startLineNumber: start.line,
        startColumn: start.col,
        endLineNumber: stop.line,
        endColumn: stop.col,
        message: describeUnknownName(error, name),
      };
    })
  );
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
      const named = getUnknownNameMarkers(message, sql);
      if (named.length > 0) {
        return named;
      }
    }
  }
  return [];
}
