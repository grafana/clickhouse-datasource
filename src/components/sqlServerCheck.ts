import { DataQueryError, DataQueryRequest, DataQueryResponse, LoadingState, TimeRange } from '@grafana/data';
import { Subscription } from 'rxjs';
import { Lexer } from 'ch-parser/lexer';
import { pluginMacros } from 'ch-parser/pluginMacros';
import { Token, TokenType } from 'ch-parser/types';
import { Datasource } from 'data/CHDatasource';
import { offsetToLineCol, validate } from 'data/validate';
import { mapQueryTypeToGrafanaFormat } from 'data/utils';
import { QueryType } from 'types/queryBuilder';
import { CHQuery, EditorType } from 'types/sql';
import { pluginVersion } from 'utils/version';
import {
  QueryErrorMarker,
  findIdentifier,
  getQueryErrorMarker,
  getUnknownNameMarkers,
  parseQueryErrorPosition,
  parseUnknownName,
} from './sqlErrorMarker';

/**
 * Checks the SQL editor's text with the server while the user edits it, so a syntax error or an
 * unknown column, function or table is marked before the query runs. The text goes through the
 * normal query path with `EXPLAIN QUERY TREE` on a line of its own above it, so variables and
 * macros expand as they do on Run. ClickHouse parses the query and resolves names without reading
 * data. Resolving names executes scalar subqueries, so a query with one is only parsed
 * (`EXPLAIN AST`). Only errors that can be placed in the text become markers, and only failures to
 * reach or use the server (network, timeouts, quotas, authentication) pause the checks.
 */

export type CheckOutcome =
  | { kind: 'ok' }
  | { kind: 'syntax'; marker: QueryErrorMarker; atEnd: boolean }
  | { kind: 'names'; markers: QueryErrorMarker[] }
  | { kind: 'skipped'; reason: string; retryInMs?: number }
  | { kind: 'unavailable'; reason: string };

type Mode = 'tree' | 'ast';
const prefixes: Record<Mode, string> = { tree: 'EXPLAIN QUERY TREE\n', ast: 'EXPLAIN AST\n' };
// Lets an administrator find these queries in system.query_log. It follows the text, so positions don't move.
const suffix = '\n-- grafana: query check';

const maxLength = 20000;
const timeoutMs = 4000;
const cacheSize = 20;
// Per data source and shared by all editors on the page: up to `capacity` checks in a burst, then
// one every `refillMs`.
const capacity = 3;
const refillMs = 3000;
// After `failuresToPause` failures in a row the checks pause for 30 s; each failure after a pause
// pauses them again for twice as long, up to 5 minutes.
const failuresToPause = 3;
const firstPauseMs = 30000;
const maxPauseMs = 300000;

// ClickHouse errors that say the server is busy, over a limit, or refusing this user.
const backOffCodes = new Set([159, 164, 201, 202, 203, 209, 210, 241, 497, 516]);
const unreachable =
  /dial tcp|i\/o timeout|connection refused|connection reset|no such host|deadline exceeded|\btimeout\b|tls|certificate|plugin unavailable|status 5\d\d|bad gateway|service unavailable/i;

interface Gate {
  tokens: number;
  updated: number;
  failures: number;
  pauses: number;
  pausedUntil: number;
  // A server without the new analyzer can't explain a query tree, so it only gets the parse check.
  parseOnly: boolean;
}

const gates = new Map<string, Gate>();

function gateFor(uid: string): Gate {
  let gate = gates.get(uid);
  if (!gate) {
    gate = { tokens: capacity, updated: Date.now(), failures: 0, pauses: 0, pausedUntil: 0, parseOnly: false };
    gates.set(uid, gate);
  }
  return gate;
}

function takeToken(gate: Gate, now: number): boolean {
  gate.tokens = Math.min(capacity, gate.tokens + (now - gate.updated) / refillMs);
  gate.updated = now;
  if (gate.tokens < 1) {
    return false;
  }
  gate.tokens -= 1;
  return true;
}

function recordResult(gate: Gate, outcome: CheckOutcome, now: number) {
  if (outcome.kind === 'unavailable') {
    gate.failures += 1;
    if (gate.failures >= failuresToPause || gate.pauses > 0) {
      gate.pauses += 1;
      gate.failures = 0;
      gate.pausedUntil = now + Math.min(maxPauseMs, firstPauseMs * 2 ** (gate.pauses - 1));
    }
  } else if (outcome.kind !== 'skipped') {
    gate.failures = 0;
    gate.pauses = 0;
  }
}

// A subquery after one of these is a table, a CTE, an IN list or part of a set operation, which
// resolving names doesn't execute. Anywhere else it is a scalar subquery, which it does.
const tableContext = new Set(['FROM', 'JOIN', 'IN', 'AS', 'UNION', 'ALL', 'DISTINCT', 'EXCEPT', 'INTERSECT']);

/** Whether resolving the query's names would execute a subquery. */
export function hasScalarSubquery(sql: string): boolean {
  const lexer = new Lexer(sql);
  const tokens: Token[] = [];
  for (let token = lexer.nextToken(); !token.isEnd(); token = lexer.nextToken()) {
    if (token.isError()) {
      return true;
    }
    if (token.isSignificant()) {
      tokens.push(token);
    }
  }
  return tokens.some((token, i) => {
    const next = tokens[i + 1]?.text.toUpperCase();
    if (token.type !== TokenType.OpeningRoundBracket || (next !== 'SELECT' && next !== 'WITH')) {
      return false;
    }
    return i > 0 && !tableContext.has(tokens[i - 1].text.toUpperCase());
  });
}

/** Moves an error position back into the editor text: the server saw the EXPLAIN line above it. */
export function toEditorCoordinates(message: string, mode: Mode): string {
  const prefix = prefixes[mode];
  return message
    .replace(/failed at position (\d+)/, (_, p) => `failed at position ${Math.max(1, Number(p) - prefix.length)}`)
    .replace(/\(line (\d+), col (\d+)\)/, (_, l, c) => `(line ${Math.max(1, Number(l) - 1)}, col ${c})`);
}

function messagesOf(response: DataQueryResponse): string[] {
  const errors: DataQueryError[] = response.errors ?? [];
  return errors
    .flatMap((e) => [e.message, e.data?.message])
    .filter((m): m is string => typeof m === 'string' && m.length > 0);
}

function markRange(sql: string, begin: number, end: number, message: string): QueryErrorMarker {
  const start = offsetToLineCol(sql, begin);
  const stop = offsetToLineCol(sql, end);
  return {
    startLineNumber: start.line,
    startColumn: start.col,
    endLineNumber: stop.line,
    endColumn: stop.col,
    message,
  };
}

/**
 * Markers for a macro the plugin could not expand, for example
 * `Could not apply macros: macro $__timeFilter(): unexpected number of arguments: $__timeFilter expected 1
 * argument(s), received 0, usage: $__timeFilter(timeColumn)`. Marks the call whose arguments match, or every
 * use of the macro when none does.
 */
export function getMacroErrorMarkers(message: string, sql: string): QueryErrorMarker[] {
  const match = /Could not apply macros: macro (\$__\w+)\((.*?)\): (.*)/s.exec(message);
  if (!match) {
    return [];
  }
  const [, name, args, detail] = match;
  const text = detail
    .replace(/^unexpected number of arguments: /, '')
    .replace(/, usage: /, '. Usage: ')
    .trim();
  const uses = findIdentifier(sql, name);
  const exact = uses.filter(([, end]) => sql.substring(end).replace(/^\s*/, '').startsWith(`(${args})`));
  return (exact.length > 0 ? exact : uses).map(([begin, end]) => markRange(sql, begin, end, text));
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

/** What to say about a `$__` name ClickHouse reports as an unknown function. */
export function describeUnknownMacro(name: string): string {
  if (pluginMacros.some((macro) => macro.name === name)) {
    return `"${name}" was not expanded, so ClickHouse read it as a function. Check its arguments.`;
  }
  const closest = pluginMacros
    .map((macro) => ({ name: macro.name, distance: editDistance(name, macro.name) }))
    .sort((a, b) => a.distance - b.distance)[0];
  return closest && closest.distance <= 3
    ? `Unknown macro "${name}". Did you mean "${closest.name}"?`
    : `Unknown macro "${name}".`;
}

function errorCode(message: string): number | undefined {
  const match = /\bcode: (\d+)|\bCode: (\d+)\./.exec(message);
  return match ? Number(match[1] ?? match[2]) : undefined;
}

/** Turns the server's answer for `sql` into an outcome. */
export function classify(response: DataQueryResponse, sql: string, mode: Mode): CheckOutcome {
  const messages = messagesOf(response);
  if (messages.length === 0 && response.state !== LoadingState.Error) {
    return { kind: 'ok' };
  }

  for (const message of messages) {
    const position = parseQueryErrorPosition(message);
    if (!position) {
      continue;
    }
    if (position.token.startsWith('$')) {
      // A variable this editor can't resolve, for example a dashboard variable in Explore.
      return { kind: 'skipped', reason: 'unresolved variable' };
    }
    const marker = getQueryErrorMarker(toEditorCoordinates(message, mode), sql);
    if (!marker) {
      // The error is outside the editor text, for example in SETTINGS the plugin appends.
      return { kind: 'skipped', reason: 'error outside the editor text' };
    }
    return { kind: 'syntax', marker, atEnd: position.token === 'end of query' };
  }

  for (const message of messages) {
    const markers = getMacroErrorMarkers(message, sql);
    if (markers.length > 0) {
      return { kind: 'names', markers };
    }
  }

  if (mode === 'tree') {
    for (const message of messages) {
      const unknown = parseUnknownName(message);
      if (unknown) {
        const macro = unknown.names.length === 1 && unknown.names[0].startsWith('$__') ? unknown.names[0] : undefined;
        const markers = getUnknownNameMarkers(message, sql).map((marker) =>
          macro ? { ...marker, message: describeUnknownMacro(macro) } : marker
        );
        // A name that is not in the editor text came from a variable or a macro.
        return markers.length > 0
          ? { kind: 'names', markers }
          : { kind: 'skipped', reason: 'name not in the editor text' };
      }
    }
    if (messages.some((m) => /QUERY TREE|analyzer/i.test(m))) {
      return { kind: 'skipped', reason: 'no query tree on this server' };
    }
  }

  const code = messages.map(errorCode).find((c) => c !== undefined);
  if (code !== undefined ? backOffCodes.has(code) : messages.some((m) => unreachable.test(m))) {
    return { kind: 'unavailable', reason: (messages[0] ?? '').slice(0, 160) };
  }
  // The server answered with an error that has no place in the text, such as a type error, or the
  // plugin rejected a macro. Run reports it.
  return { kind: 'skipped', reason: 'error without a position' };
}

export interface SqlServerCheck {
  check(sql: string): Promise<CheckOutcome>;
  cancel(): void;
}

export function createSqlServerCheck(datasource: Datasource, refId: string, getRange: () => TimeRange): SqlServerCheck {
  const cache = new Map<string, CheckOutcome>();
  const gate = gateFor(datasource.uid);
  // Grafana cancels a request still in flight when another one with the same requestId starts.
  const requestId = `clickhouse-query-check-${refId}-${Math.random().toString(36).slice(2, 8)}`;
  let inFlight:
    { subscription: Subscription; timer: ReturnType<typeof setTimeout>; settle: (o: CheckOutcome) => void } | undefined;

  const cancel = () => {
    if (inFlight) {
      inFlight.subscription.unsubscribe();
      clearTimeout(inFlight.timer);
      inFlight.settle({ kind: 'skipped', reason: 'superseded' });
      inFlight = undefined;
    }
  };

  const check = (sql: string): Promise<CheckOutcome> => {
    if (sql.trim() === '') {
      return Promise.resolve({ kind: 'skipped', reason: 'empty' });
    }
    if (sql.length > maxLength) {
      return Promise.resolve({ kind: 'skipped', reason: 'too long' });
    }
    if (!validate(sql).valid) {
      // The lexer check already marks an unclosed string or comment.
      return Promise.resolve({ kind: 'skipped', reason: 'lexer error' });
    }
    const cached = cache.get(sql);
    if (cached) {
      return Promise.resolve(cached);
    }
    const now = Date.now();
    if (now < gate.pausedUntil) {
      return Promise.resolve({ kind: 'skipped', reason: 'paused after failures' });
    }
    if (!takeToken(gate, now)) {
      // Not dropped: the editor asks again once the next check is allowed.
      return Promise.resolve({
        kind: 'skipped',
        reason: 'rate limited',
        retryInMs: Math.ceil((1 - gate.tokens) * refillMs),
      });
    }

    cancel();
    const mode: Mode = gate.parseOnly || hasScalarSubquery(sql) ? 'ast' : 'tree';
    const request: DataQueryRequest<CHQuery> = {
      requestId,
      app: 'clickhouse-query-check',
      hideFromInspector: true,
      interval: '1s',
      intervalMs: 1000,
      range: getRange(),
      scopedVars: {},
      timezone: 'browser',
      startTime: Date.now(),
      targets: [
        {
          refId: 'query-check',
          pluginVersion,
          editorType: EditorType.SQL,
          rawSql: prefixes[mode] + sql + suffix,
          format: mapQueryTypeToGrafanaFormat(QueryType.Table),
        },
      ],
    };

    return new Promise<CheckOutcome>((resolve) => {
      let settled = false;
      const settle = (outcome: CheckOutcome) => {
        if (!settled) {
          settled = true;
          resolve(outcome);
        }
      };
      const finish = (outcome: CheckOutcome) => {
        clearTimeout(timer);
        inFlight = undefined;
        recordResult(gate, outcome, Date.now());
        if (outcome.kind === 'skipped' && outcome.reason === 'no query tree on this server') {
          gate.parseOnly = true;
        }
        if (outcome.kind === 'ok' || outcome.kind === 'syntax' || outcome.kind === 'names') {
          cache.set(sql, outcome);
          if (cache.size > cacheSize) {
            cache.delete(cache.keys().next().value!);
          }
        }
        settle(outcome);
      };
      const timer = setTimeout(() => {
        subscription.unsubscribe();
        finish({ kind: 'unavailable', reason: 'timeout' });
      }, timeoutMs);
      const subscription = datasource.query(request).subscribe({
        next: (response) => finish(classify(response, sql, mode)),
        error: (err) => finish({ kind: 'unavailable', reason: String(err?.message ?? err).slice(0, 160) }),
      });
      inFlight = { subscription, timer, settle };
    });
  };

  return { check, cancel };
}
