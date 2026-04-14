/**
 * Pure-TypeScript ClickHouse SELECT parser.
 *
 * A self-contained tokenizer + clause parser with no external SQL library
 * dependency. Used by ast.ts to back the SQL→Builder round-trip.
 *
 *
 * Input SQL is expected to have already been through `preprocessSql()`:
 *   $__timeFilter(col)  → __macro_timeFilter__(col)
 *   $__fromTime         → __macro_fromTime__
 *   $__toTime           → __macro_toTime__
 *   ${var}              → __var_var__
 *   SETTINGS …          → stripped
 */

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ParsedColumn {
  name: string;
  alias: string | null;
  isAggregate: boolean;
  aggregateType?: string;
  aggregateColumn?: string;
}

export interface ParsedFilter {
  key: string;
  operator: string;
  value: string | string[] | null;
  valueType: 'string' | 'number' | 'datetime' | 'list';
  condition: 'AND' | 'OR';
}

export interface ParsedOrderBy {
  name: string;
  dir: 'ASC' | 'DESC';
}

export interface ParsedSelectQuery {
  table: string;
  database: string;
  columns: ParsedColumn[];
  filters: ParsedFilter[];
  orderBy: ParsedOrderBy[];
  groupBy: string[];
  limit?: number;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** No-op retained for call-site compatibility. Returns immediately. */
export function initWasmParser(): Promise<void> {
  return Promise.resolve();
}

/** Parse a preprocessed SQL SELECT statement. Returns null for non-SELECT input. */
export function parseSelectQuerySync(sql: string): ParsedSelectQuery | null {
  return parseSQL(sql);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tokenizer
// cspell:ignore toks segs AGGS countif sumif avgif minif maxif
// ─────────────────────────────────────────────────────────────────────────────

type TKind = 'WORD' | 'QUOTED' | 'STRING' | 'NUM' | 'OP' | 'CMP' | 'MINUS';
interface Tok {
  k: TKind;
  v: string;
}

function tokenize(sql: string): Tok[] {
  const raw: Tok[] = [];
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];

    // Whitespace
    if (ch <= ' ') {
      i++;
      continue;
    }

    // Block comment /* ... */ (ClickHouse supports nesting)
    if (ch === '/' && sql[i + 1] === '*') {
      i += 2;
      let depth = 1;
      while (i + 1 < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      continue;
    }

    // Line comment -- ...
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') {
        i++;
      }
      continue;
    }

    // Quoted identifier "..." or `...`
    if (ch === '"' || ch === '`') {
      const q = ch;
      i++;
      let v = '';
      while (i < n && sql[i] !== q) {
        v += sql[i++];
      }
      if (i < n) {
        i++;
      }
      raw.push({ k: 'QUOTED', v });
      continue;
    }

    // String literal '...'
    if (ch === "'") {
      i++;
      let v = '';
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          v += "'";
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          break;
        }
        if (sql[i] === '\\' && i + 1 < n) {
          v += sql[i + 1];
          i += 2;
          continue;
        }
        v += sql[i++];
      }
      if (i < n) {
        i++;
      }
      raw.push({ k: 'STRING', v });
      continue;
    }

    // Number literal
    if (ch >= '0' && ch <= '9') {
      let v = '';
      // Hex: 0x...
      if (ch === '0' && (sql[i + 1] === 'x' || sql[i + 1] === 'X')) {
        v = '0x';
        i += 2;
        while (i < n && /[0-9a-fA-F]/.test(sql[i])) {
          v += sql[i++];
        }
      } else {
        while (i < n && sql[i] >= '0' && sql[i] <= '9') {
          v += sql[i++];
        }
        if (i < n && sql[i] === '.' && sql[i + 1] >= '0' && sql[i + 1] <= '9') {
          v += sql[i++];
          while (i < n && sql[i] >= '0' && sql[i] <= '9') {
            v += sql[i++];
          }
        }
      }
      raw.push({ k: 'NUM', v });
      continue;
    }

    // Identifiers / keywords
    if (/[$_a-zA-Z]/.test(ch)) {
      let v = '';
      while (i < n && /[$_a-zA-Z0-9]/.test(sql[i])) {
        v += sql[i++];
      }
      raw.push({ k: 'WORD', v });
      continue;
    }

    // 2-char operators
    const two = sql.slice(i, i + 2);
    if (two === '!=' || two === '<=' || two === '>=' || two === '<>') {
      raw.push({ k: 'CMP', v: two === '<>' ? '!=' : two });
      i += 2;
      continue;
    }
    if (two === '::') {
      raw.push({ k: 'OP', v: '::' });
      i += 2;
      continue;
    }

    // 1-char comparison
    if (ch === '=' || ch === '<' || ch === '>') {
      raw.push({ k: 'CMP', v: ch });
      i++;
      continue;
    }

    // Minus — may be negation prefix; resolved in post-processing pass
    if (ch === '-') {
      raw.push({ k: 'MINUS', v: '' });
      i++;
      continue;
    }

    // Punctuation
    if ('(),.*[]'.includes(ch)) {
      raw.push({ k: 'OP', v: ch });
      i++;
      continue;
    }

    // Anything else (arithmetic +, /, %, etc.)
    i++;
  }

  // Post-process: (MINUS, NUM) → negative NUM; standalone MINUS → drop
  const out: Tok[] = [];
  let j = 0;
  while (j < raw.length) {
    if (raw[j].k === 'MINUS') {
      if (j + 1 < raw.length && raw[j + 1].k === 'NUM') {
        out.push({ k: 'NUM', v: '-' + raw[j + 1].v });
        j += 2;
      } else {
        j++; // standalone arithmetic minus — discard
      }
    } else {
      out.push(raw[j++]);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Clause extraction
// ─────────────────────────────────────────────────────────────────────────────

interface Clauses {
  select: Tok[];
  from: Tok[];
  where: Tok[];
  groupBy: Tok[];
  orderBy: Tok[];
  limit: Tok[];
}

type ClauseName = keyof Clauses | null;

function extractClauses(toks: Tok[]): Clauses {
  const out: Clauses = { select: [], from: [], where: [], groupBy: [], orderBy: [], limit: [] };
  let i = 0;

  if (toks[0]?.k === 'WORD' && toks[0].v.toUpperCase() === 'SELECT') {
    i = 1;
  } else {
    return out;
  }

  // Skip optional DISTINCT / ALL
  if (toks[i]?.k === 'WORD' && (toks[i].v.toUpperCase() === 'DISTINCT' || toks[i].v.toUpperCase() === 'ALL')) {
    i++;
  }

  let current: ClauseName = 'select';
  let depth = 0;

  while (i < toks.length) {
    const t = toks[i];

    if (t.k === 'OP' && (t.v === '(' || t.v === '[')) {
      depth++;
    } else if (t.k === 'OP' && (t.v === ')' || t.v === ']')) {
      depth--;
    }

    if (depth === 0 && t.k === 'WORD') {
      const up = t.v.toUpperCase();
      if (up === 'FROM') {
        current = 'from';
        i++;
        continue;
      }
      if (up === 'WHERE') {
        current = 'where';
        i++;
        continue;
      }
      if (up === 'LIMIT') {
        current = 'limit';
        i++;
        continue;
      }
      if (up === 'HAVING' || up === 'SETTINGS' || up === 'UNION' || up === 'INTERSECT' || up === 'EXCEPT') {
        current = null;
        i++;
        continue;
      }
      if (up === 'GROUP' && toks[i + 1]?.v?.toUpperCase() === 'BY') {
        current = 'groupBy';
        i += 2;
        continue;
      }
      if (up === 'ORDER' && toks[i + 1]?.v?.toUpperCase() === 'BY') {
        current = 'orderBy';
        i += 2;
        continue;
      }
    }

    if (current) {
      out[current].push(t);
    }
    i++;
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// FROM parser
// ─────────────────────────────────────────────────────────────────────────────

function parseFrom(toks: Tok[]): { database: string; table: string } {
  if (toks.length === 0) {
    return { database: '', table: '' };
  }

  // Subquery: (SELECT ...) [alias] — recurse into the inner FROM
  if (toks[0].k === 'OP' && toks[0].v === '(') {
    let depth = 0,
      closeIdx = -1;
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].k === 'OP' && toks[i].v === '(') {
        depth++;
      } else if (toks[i].k === 'OP' && toks[i].v === ')') {
        if (--depth === 0) {
          closeIdx = i;
          break;
        }
      }
    }
    if (closeIdx > 0) {
      return parseFrom(extractClauses(toks.slice(1, closeIdx)).from);
    }
    return { database: '', table: '' };
  }

  // db.table
  if (toks.length >= 3 && toks[1].k === 'OP' && toks[1].v === '.') {
    return { database: toks[0].v, table: toks[2].v };
  }

  return { database: '', table: toks[0].v };
}

// ─────────────────────────────────────────────────────────────────────────────
// SELECT list parser
// ─────────────────────────────────────────────────────────────────────────────

const AGGS = new Set(['sum', 'count', 'avg', 'min', 'max', 'any', 'countif', 'sumif', 'avgif', 'minif', 'maxif']);

function splitCommaTopLevel(toks: Tok[]): Tok[][] {
  const parts: Tok[][] = [];
  let cur: Tok[] = [];
  let depth = 0;
  for (const t of toks) {
    if (t.k === 'OP' && (t.v === '(' || t.v === '[')) {
      depth++;
      cur.push(t);
    } else if (t.k === 'OP' && (t.v === ')' || t.v === ']')) {
      depth--;
      cur.push(t);
    } else if (depth === 0 && t.k === 'OP' && t.v === ',') {
      parts.push(cur);
      cur = [];
    } else {
      cur.push(t);
    }
  }
  if (cur.length) {
    parts.push(cur);
  }
  return parts;
}

function parseOneColumn(toks: Tok[]): ParsedColumn {
  if (toks.length === 0) {
    return { name: '', alias: null, isAggregate: false };
  }

  // Strip trailing AS <alias>
  let alias: string | null = null;
  let main = toks;
  if (main.length >= 2 && main[main.length - 2].k === 'WORD' && main[main.length - 2].v.toUpperCase() === 'AS') {
    alias = main[main.length - 1].v;
    main = main.slice(0, -2);
  }
  if (main.length === 0) {
    return { name: '', alias, isAggregate: false };
  }

  const first = main[0];

  // Wildcard *
  if (first.k === 'OP' && first.v === '*') {
    return { name: '*', alias: null, isAggregate: false };
  }

  // Quoted identifier alone
  if (first.k === 'QUOTED' && main.length === 1) {
    return { name: first.v, alias, isAggregate: false };
  }

  // Function call: FUNC(...)
  if (
    first.k === 'WORD' &&
    main.length >= 3 &&
    main[1]?.k === 'OP' &&
    main[1].v === '(' &&
    main[main.length - 1]?.k === 'OP' &&
    main[main.length - 1].v === ')'
  ) {
    const func = first.v;
    const inner = main
      .slice(2, -1)
      .map((t) => t.v)
      .join('');
    if (AGGS.has(func.toLowerCase())) {
      const aggType = func.toLowerCase();
      return { name: aggType, alias, isAggregate: true, aggregateType: aggType, aggregateColumn: inner || '*' };
    }
    return { name: `${func}(${inner})`, alias, isAggregate: false };
  }

  // Plain bare word
  if (first.k === 'WORD' && main.length === 1) {
    return { name: first.v, alias, isAggregate: false };
  }

  // String literal with cast: treat as expression
  if (first.k === 'STRING') {
    return { name: alias ?? '_expr_', alias: null, isAggregate: false };
  }

  // Fallback: concatenate token values
  return { name: main.map((t) => t.v).join(''), alias, isAggregate: false };
}

function parseSelectColumns(toks: Tok[]): ParsedColumn[] {
  return splitCommaTopLevel(toks)
    .filter((g) => g.length > 0)
    .map(parseOneColumn);
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUP BY / ORDER BY / LIMIT parsers
// ─────────────────────────────────────────────────────────────────────────────

function parseGroupBy(toks: Tok[]): string[] {
  return splitCommaTopLevel(toks)
    .map((g) =>
      g
        .map((t) => t.v)
        .join('')
        .trim()
    )
    .filter(Boolean);
}

function parseOrderBy(toks: Tok[]): ParsedOrderBy[] {
  const result: ParsedOrderBy[] = [];
  for (const g of splitCommaTopLevel(toks)) {
    if (g.length === 0) {
      continue;
    }
    const last = g[g.length - 1];
    let dir: 'ASC' | 'DESC' = 'ASC';
    let nameToks = g;
    if (last.k === 'WORD' && (last.v.toUpperCase() === 'ASC' || last.v.toUpperCase() === 'DESC')) {
      dir = last.v.toUpperCase() as 'ASC' | 'DESC';
      nameToks = g.slice(0, -1);
    }
    // Strip trailing NULLS FIRST / NULLS LAST
    if (
      nameToks.length >= 2 &&
      (nameToks[nameToks.length - 1].v.toUpperCase() === 'FIRST' ||
        nameToks[nameToks.length - 1].v.toUpperCase() === 'LAST') &&
      nameToks[nameToks.length - 2].v.toUpperCase() === 'NULLS'
    ) {
      nameToks = nameToks.slice(0, -2);
    }
    const name = nameToks
      .map((t) => t.v)
      .join('')
      .trim();
    if (name) {
      result.push({ name, dir });
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// WHERE clause parser
// ─────────────────────────────────────────────────────────────────────────────

function stripOuterParens(toks: Tok[]): Tok[] {
  while (
    toks.length >= 2 &&
    toks[0].k === 'OP' &&
    toks[0].v === '(' &&
    toks[toks.length - 1].k === 'OP' &&
    toks[toks.length - 1].v === ')'
  ) {
    let depth = 0;
    let wraps = true;
    for (let i = 0; i < toks.length - 1; i++) {
      if (toks[i].k === 'OP' && (toks[i].v === '(' || toks[i].v === '[')) {
        depth++;
      } else if (toks[i].k === 'OP' && (toks[i].v === ')' || toks[i].v === ']')) {
        if (--depth === 0) {
          wraps = false;
          break;
        }
      }
    }
    if (!wraps) {
      break;
    }
    toks = toks.slice(1, -1);
  }
  return toks;
}

interface Segment {
  toks: Tok[];
  connector: 'AND' | 'OR';
}

function splitByAndOr(toks: Tok[]): Segment[] {
  const segs: Segment[] = [];
  let cur: Tok[] = [];
  let depth = 0;
  for (const t of toks) {
    if (t.k === 'OP' && (t.v === '(' || t.v === '[')) {
      depth++;
      cur.push(t);
    } else if (t.k === 'OP' && (t.v === ')' || t.v === ']')) {
      depth--;
      cur.push(t);
    } else if (depth === 0 && t.k === 'WORD' && t.v.toUpperCase() === 'AND') {
      segs.push({ toks: cur, connector: 'AND' });
      cur = [];
    } else if (depth === 0 && t.k === 'WORD' && t.v.toUpperCase() === 'OR') {
      segs.push({ toks: cur, connector: 'OR' });
      cur = [];
    } else {
      cur.push(t);
    }
  }
  if (cur.length) {
    segs.push({ toks: cur, connector: 'AND' });
  }
  return segs;
}

const MACRO_FROM = '__macro_fromTime__';
const MACRO_TO = '__macro_toTime__';
const MACRO_FROM_MS = '__macro_fromTime_ms__';
const MACRO_TO_MS = '__macro_toTime_ms__';

function isFromTimeSeg(toks: Tok[]): boolean {
  return (
    toks.length >= 3 &&
    (toks[toks.length - 1].v === MACRO_FROM || toks[toks.length - 1].v === MACRO_FROM_MS) &&
    toks[toks.length - 2].k === 'CMP' &&
    toks[toks.length - 2].v === '>='
  );
}

function isToTimeSeg(toks: Tok[]): boolean {
  return (
    toks.length >= 3 &&
    (toks[toks.length - 1].v === MACRO_TO || toks[toks.length - 1].v === MACRO_TO_MS) &&
    toks[toks.length - 2].k === 'CMP' &&
    toks[toks.length - 2].v === '<='
  );
}

function parseOneFilter(toks: Tok[], connector: 'AND' | 'OR'): ParsedFilter | null {
  if (toks.length === 0) {
    return null;
  }
  toks = stripOuterParens(toks);

  // NOT (col >= fromTime AND col <= toTime) → outsideTimeRange
  if (toks[0].k === 'WORD' && toks[0].v.toUpperCase() === 'NOT') {
    const inner = splitByAndOr(stripOuterParens(toks.slice(1)));
    if (inner.length === 2 && isFromTimeSeg(inner[0].toks) && isToTimeSeg(inner[1].toks)) {
      return {
        key: inner[0].toks[0]?.v ?? '',
        operator: 'outsideTimeRange',
        value: null,
        valueType: 'datetime',
        condition: connector,
      };
    }
  }

  // col IS NOT NULL
  if (
    toks.length >= 4 &&
    toks[toks.length - 1].k === 'WORD' &&
    toks[toks.length - 1].v.toUpperCase() === 'NULL' &&
    toks[toks.length - 2].k === 'WORD' &&
    toks[toks.length - 2].v.toUpperCase() === 'NOT' &&
    toks[toks.length - 3].k === 'WORD' &&
    toks[toks.length - 3].v.toUpperCase() === 'IS'
  ) {
    return { key: toks[0].v, operator: 'isNotNull', value: null, valueType: 'string', condition: connector };
  }

  // col IS NULL
  if (
    toks.length >= 3 &&
    toks[toks.length - 1].k === 'WORD' &&
    toks[toks.length - 1].v.toUpperCase() === 'NULL' &&
    toks[toks.length - 2].k === 'WORD' &&
    toks[toks.length - 2].v.toUpperCase() === 'IS'
  ) {
    return { key: toks[0].v, operator: 'isNull', value: null, valueType: 'string', condition: connector };
  }

  // col NOT IN (...)
  const notInIdx = toks.findIndex(
    (t, idx) =>
      t.k === 'WORD' &&
      t.v.toUpperCase() === 'NOT' &&
      toks[idx + 1]?.k === 'WORD' &&
      toks[idx + 1]?.v.toUpperCase() === 'IN'
  );
  if (notInIdx > 0) {
    const values = stripOuterParens(toks.slice(notInIdx + 2))
      .filter((t) => t.k === 'STRING' || t.k === 'NUM')
      .map((t) => t.v);
    return { key: toks[0].v, operator: 'notIn', value: values, valueType: 'list', condition: connector };
  }

  // col IN (...)
  const inIdx = toks.findIndex((t) => t.k === 'WORD' && t.v.toUpperCase() === 'IN');
  if (inIdx > 0) {
    const values = stripOuterParens(toks.slice(inIdx + 1))
      .filter((t) => t.k === 'STRING' || t.k === 'NUM')
      .map((t) => t.v);
    return { key: toks[0].v, operator: 'in', value: values, valueType: 'list', condition: connector };
  }

  // __macro_timeFilter__(col) as a standalone WHERE condition
  if (toks[0].k === 'WORD' && (toks[0].v === '__macro_timeFilter__' || toks[0].v === '__macro_timeFilter_ms__')) {
    const col = toks.slice(1).find((t) => t.k === 'WORD')?.v ?? '';
    return { key: col, operator: 'timeFilter', value: null, valueType: 'datetime', condition: connector };
  }

  // col NOT LIKE 'pattern'
  for (let k = 1; k < toks.length - 1; k++) {
    if (
      toks[k].k === 'WORD' &&
      toks[k].v.toUpperCase() === 'NOT' &&
      toks[k + 1]?.k === 'WORD' &&
      toks[k + 1]?.v.toUpperCase() === 'LIKE'
    ) {
      const val = toks[k + 2]?.v ?? null;
      return { key: toks[0].v, operator: 'notLike', value: val, valueType: 'string', condition: connector };
    }
  }

  // col LIKE 'pattern'
  for (let k = 1; k < toks.length; k++) {
    if (toks[k].k === 'WORD' && toks[k].v.toUpperCase() === 'LIKE') {
      const val = toks[k + 1]?.v ?? null;
      return { key: toks[0].v, operator: 'like', value: val, valueType: 'string', condition: connector };
    }
  }

  // col CMP value  (=, !=, <, <=, >, >=)
  for (let k = 1; k < toks.length; k++) {
    if (toks[k].k === 'CMP' && k + 1 < toks.length) {
      const val = toks[k + 1];
      const valueType = val.k === 'NUM' ? 'number' : 'string';
      return { key: toks[0].v, operator: toks[k].v, value: val.v, valueType, condition: connector };
    }
  }

  return null;
}

function parseWhere(toks: Tok[]): ParsedFilter[] {
  const segs = splitByAndOr(stripOuterParens(toks));
  const filters: ParsedFilter[] = [];
  let i = 0;
  while (i < segs.length) {
    const { toks: segToks, connector } = segs[i];
    // col >= fromTime AND col <= toTime → withinTimeRange (consumes two segments)
    if (i + 1 < segs.length && isFromTimeSeg(segToks) && isToTimeSeg(segs[i + 1].toks)) {
      filters.push({
        key: segToks[0]?.v ?? '',
        operator: 'withinTimeRange',
        value: null,
        valueType: 'datetime',
        condition: connector,
      });
      i += 2;
      continue;
    }
    const filter = parseOneFilter(segToks, connector);
    if (filter) {
      filters.push(filter);
    }
    i++;
  }
  return filters;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

function parseSQL(sql: string): ParsedSelectQuery | null {
  const toks = tokenize(sql);
  if (toks.length === 0 || toks[0].k !== 'WORD' || toks[0].v.toUpperCase() !== 'SELECT') {
    return null;
  }
  const clauses = extractClauses(toks);
  const { database, table } = parseFrom(clauses.from);
  return {
    table,
    database,
    columns: parseSelectColumns(clauses.select),
    filters: clauses.where.length > 0 ? parseWhere(clauses.where) : [],
    orderBy: parseOrderBy(clauses.orderBy),
    groupBy: parseGroupBy(clauses.groupBy),
    limit: clauses.limit.length > 0 ? parseInt(clauses.limit[0].v, 10) : undefined,
  };
}
