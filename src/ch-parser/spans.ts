import { Lexer } from './lexer';
import { Token, TokenType } from './types';

/** Why a statement cannot be treated as a single top-level SELECT. Not errors: callers fall back. */
export enum SelectShapeProblem {
  LexError = 'LexError',
  Unbalanced = 'Unbalanced',
  NotSingleSelect = 'NotSingleSelect',
  MultiStatement = 'MultiStatement',
  NoFrom = 'NoFrom',
  SetOperation = 'SetOperation',
  IntoOutfile = 'IntoOutfile',
  /** A per-key row filter, not a trailing row cap, so it cannot be dropped. */
  LimitBy = 'LimitBy',
  WithFill = 'WithFill',
  WithTotalsRollupCube = 'WithTotalsRollupCube',
  /** `additional_result_filter` only applies to the outermost result, so it stops filtering
   * once the statement becomes a subquery. */
  Settings = 'Settings',
  /** A LIMIT/OFFSET/FORMAT clause whose argument is not recognized, so it cannot be dropped. */
  UnrecognizedTail = 'UnrecognizedTail',
}

export interface SelectItem {
  outputName?: string;
  /** Set only for a lone identifier, optionally aliased. Absent for expressions and qualified names. */
  sourceIdentifier?: string;
  wildcard?: boolean;
}

export interface FromTarget {
  database?: string;
  table: string;
}

export interface TopLevelSelect {
  head: string;
  items: SelectItem[];
  from?: FromTarget;
}

export type ScanResult = { ok: true; select: TopLevelSelect } | { ok: false; problem: SelectShapeProblem };

const TAIL_KEYWORDS = new Set(['LIMIT', 'OFFSET', 'FORMAT']);

const OPENERS = new Set([TokenType.OpeningRoundBracket, TokenType.OpeningSquareBracket, TokenType.OpeningCurlyBrace]);
const CLOSERS = new Map([
  [TokenType.ClosingRoundBracket, TokenType.OpeningRoundBracket],
  [TokenType.ClosingSquareBracket, TokenType.OpeningSquareBracket],
  [TokenType.ClosingCurlyBrace, TokenType.OpeningCurlyBrace],
]);

/** `"a""b"` -> `a"b`. Undefined for a backslash escape, which cannot be re-quoted faithfully. */
export function unquoteIdentifier(text: string): string | undefined {
  if (text.length < 2) {
    return text;
  }

  const first = text[0];
  const last = text[text.length - 1];
  if ((first === '"' && last === '"') || (first === '`' && last === '`')) {
    const body = text.slice(1, -1);
    if (body.includes('\\')) {
      return undefined;
    }
    return body.split(first + first).join(first);
  }
  if (first === '\u201C' && last === '\u201D') {
    return text.slice(1, -1);
  }

  return text;
}

const FROM_CLAUSE_TERMINATORS = ['WHERE', 'PREWHERE', 'GROUP', 'HAVING', 'ORDER', 'LIMIT', 'OFFSET', 'FORMAT'];

function endsFromClause(token: Token): boolean {
  return token.type === TokenType.Semicolon || FROM_CLAUSE_TERMINATORS.some((k) => token.matchKeyword(k));
}

/** Names bound by a depth-0 WITH prefix. An unqualified FROM matching one is a CTE, not a table. */
function parseWithNames(topLevel: DepthToken[], selectIndex: number): Set<string> {
  const names = new Set<string>();
  if (!topLevel.length || !topLevel[0].token.matchKeyword('WITH')) {
    return names;
  }

  let start = 1;
  if (start < selectIndex && topLevel[start].token.matchKeyword('RECURSIVE')) {
    start++;
  }

  let group: DepthToken[] = [];
  const bind = () => {
    let name: string | undefined;
    if (
      group.length >= 3 &&
      isIdentifier(group[0].token) &&
      group[1].token.matchKeyword('AS') &&
      group[2].token.type === TokenType.OpeningRoundBracket
    ) {
      name = unquoteIdentifier(group[0].token.text);
    } else if (
      group.length >= 2 &&
      group[group.length - 2].token.matchKeyword('AS') &&
      isIdentifier(group[group.length - 1].token)
    ) {
      name = unquoteIdentifier(group[group.length - 1].token.text);
    }
    if (name !== undefined) {
      names.add(name);
    }
    group = [];
  };

  for (let i = start; i < selectIndex; i++) {
    if (topLevel[i].token.type === TokenType.Comma) {
      bind();
      continue;
    }
    group.push(topLevel[i]);
  }
  bind();

  return names;
}

function parseFromTarget(topLevel: DepthToken[], fromIndex: number, withNames: Set<string>): FromTarget | undefined {
  const parts: string[] = [];
  let i = fromIndex + 1;

  while (i < topLevel.length && parts.length < 2) {
    const { token } = topLevel[i];
    if (!isIdentifier(token)) {
      return undefined;
    }
    const name = unquoteIdentifier(token.text);
    if (name === undefined) {
      return undefined;
    }
    parts.push(name);
    i++;

    if (i < topLevel.length && topLevel[i].token.type === TokenType.Dot) {
      i++;
      continue;
    }
    break;
  }

  if (!parts.length) {
    return undefined;
  }

  if (i < topLevel.length && topLevel[i].token.matchKeyword('AS')) {
    i++;
    if (i >= topLevel.length || !isIdentifier(topLevel[i].token)) {
      return undefined;
    }
    i++;
  } else if (i < topLevel.length && isIdentifier(topLevel[i].token)) {
    i++;
  }

  if (i < topLevel.length && topLevel[i].token.matchKeyword('FINAL')) {
    i++;
  }

  if (i < topLevel.length && !endsFromClause(topLevel[i].token)) {
    return undefined;
  }

  if (parts.length === 2) {
    return { database: parts[0], table: parts[1] };
  }
  return withNames.has(parts[0]) ? undefined : { table: parts[0] };
}

function isIdentifier(token: Token): boolean {
  return token.type === TokenType.QuotedIdentifier || (token.type === TokenType.BareWord && !token.isKeyword());
}

interface DepthToken {
  token: Token;
  depth: number;
}

function parseSelectItems(tokens: DepthToken[], baseDepth: number): SelectItem[] {
  const groups: DepthToken[][] = [];
  let current: DepthToken[] = [];
  for (const entry of tokens) {
    if (entry.token.type === TokenType.Comma && entry.depth === baseDepth) {
      groups.push(current);
      current = [];
      continue;
    }
    current.push(entry);
  }
  groups.push(current);

  return groups.map((group) => {
    while (group.length && group[0].token.matchKeyword('DISTINCT')) {
      group = group.slice(1);
    }

    if (group.length === 1 && group[0].token.type === TokenType.Asterisk) {
      return { wildcard: true };
    }

    const asIndex = group.findIndex((e) => e.token.matchKeyword('AS') && e.depth === baseDepth);
    if (asIndex !== -1) {
      const left = group.slice(0, asIndex);
      const right = group.slice(asIndex + 1);
      if (right.length !== 1 || !isIdentifier(right[0].token)) {
        return {};
      }
      const outputName = unquoteIdentifier(right[0].token.text);
      if (outputName === undefined) {
        return {};
      }
      // Callers trust sourceIdentifier to be that column, so an expression must not report one.
      if (left.length === 1 && isIdentifier(left[0].token)) {
        const sourceIdentifier = unquoteIdentifier(left[0].token.text);
        if (sourceIdentifier !== undefined) {
          return { outputName, sourceIdentifier };
        }
      }
      return { outputName };
    }

    if (group.length === 1 && isIdentifier(group[0].token)) {
      const name = unquoteIdentifier(group[0].token.text);
      return name === undefined ? {} : { outputName: name, sourceIdentifier: name };
    }

    return {};
  });
}

/** `LIMIT [+|-]n [, m] [WITH TIES] [OFFSET k [ROWS]] [FORMAT name] [;]`, running to end of input. */
function isCompleteTail(topLevel: DepthToken[], start: number): boolean {
  let i = start;

  const number = (): boolean => {
    const sign = i < topLevel.length ? topLevel[i].token.type : undefined;
    if (sign === TokenType.Plus || sign === TokenType.Minus) {
      i++;
    }
    if (i < topLevel.length && topLevel[i].token.type === TokenType.Number) {
      i++;
      return true;
    }
    return false;
  };

  if (topLevel[i].token.matchKeyword('LIMIT')) {
    i++;
    if (!number()) {
      return false;
    }
    if (i < topLevel.length && topLevel[i].token.type === TokenType.Comma) {
      i++;
      if (!number()) {
        return false;
      }
    }
    if (i < topLevel.length && topLevel[i].token.matchKeyword('WITH')) {
      i++;
      if (i >= topLevel.length || !topLevel[i].token.matchKeyword('TIES')) {
        return false;
      }
      i++;
    }
  }

  if (i < topLevel.length && topLevel[i].token.matchKeyword('OFFSET')) {
    i++;
    if (!number()) {
      return false;
    }
    if (i < topLevel.length && (topLevel[i].token.matchKeyword('ROW') || topLevel[i].token.matchKeyword('ROWS'))) {
      i++;
    }
  }

  if (i < topLevel.length && topLevel[i].token.matchKeyword('FORMAT')) {
    i++;
    const name = i < topLevel.length ? topLevel[i].token.type : undefined;
    if (name !== TokenType.BareWord && name !== TokenType.QuotedIdentifier) {
      return false;
    }
    i++;
  }

  if (i < topLevel.length && topLevel[i].token.type === TokenType.Semicolon) {
    i++;
  }

  return i > start && i === topLevel.length;
}

const EXPRESSION_OPERATOR_TOKENS = new Set([
  TokenType.Equals,
  TokenType.NotEquals,
  TokenType.Less,
  TokenType.Greater,
  TokenType.LessOrEquals,
  TokenType.GreaterOrEquals,
  TokenType.Spaceship,
  TokenType.Comma,
  TokenType.Dot,
  TokenType.DoubleColon,
  TokenType.Plus,
  TokenType.Minus,
  TokenType.Slash,
  TokenType.Percent,
  TokenType.Asterisk,
  TokenType.Concatenation,
  TokenType.ClosingRoundBracket,
  TokenType.OpeningSquareBracket,
  TokenType.ClosingSquareBracket,
  TokenType.Arrow,
  TokenType.QuestionMark,
  TokenType.Colon,
  TokenType.Caret,
]);

const EXPRESSION_OPERATOR_KEYWORDS = [
  'AND',
  'OR',
  'NOT',
  'IS',
  'IN',
  'LIKE',
  'ILIKE',
  'BETWEEN',
  'AS',
  'ASC',
  'DESC',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'WHERE',
  'PREWHERE',
  'HAVING',
  'GROUP',
  'ORDER',
  'BY',
  'QUALIFY',
  'WINDOW',
  'ON',
  'USING',
  'JOIN',
  'GLOBAL',
  'NULLS',
  'FIRST',
  'LAST',
  'COLLATE',
  'FROM',
  'SELECT',
  'DISTINCT',
  'WITH',
];

function isExpressionOperand(token: Token | undefined, side: 'before' | 'after'): boolean {
  if (!token) {
    return false;
  }
  // `)` means identifier use after the keyword (`count(format)`), but before it just ends a
  // predicate (`WHERE (a AND b) LIMIT 5`), where a real tail does live.
  if (token.type === TokenType.ClosingRoundBracket) {
    return side === 'after';
  }
  if (EXPRESSION_OPERATOR_TOKENS.has(token.type)) {
    return true;
  }
  return token.type === TokenType.BareWord && EXPRESSION_OPERATOR_KEYWORDS.some((k) => token.matchKeyword(k));
}

export function scanTopLevelSelect(sql: string): ScanResult {
  const lexer = new Lexer(sql);
  const significant: DepthToken[] = [];
  const brackets: TokenType[] = [];
  let depth = 0;

  while (true) {
    const token = lexer.nextToken();
    if (token.isError()) {
      return { ok: false, problem: SelectShapeProblem.LexError };
    }
    if (token.isEnd()) {
      break;
    }
    if (!token.isSignificant()) {
      continue;
    }

    const closes = CLOSERS.get(token.type);
    if (closes !== undefined) {
      if (brackets.pop() !== closes) {
        return { ok: false, problem: SelectShapeProblem.Unbalanced };
      }
      depth--;
    }

    significant.push({ token, depth });

    if (OPENERS.has(token.type)) {
      brackets.push(token.type);
      depth++;
    }
  }

  if (depth !== 0) {
    return { ok: false, problem: SelectShapeProblem.Unbalanced };
  }
  if (!significant.length) {
    return { ok: false, problem: SelectShapeProblem.NotSingleSelect };
  }

  const first = significant[0].token;
  if (!first.matchKeyword('SELECT') && !first.matchKeyword('WITH')) {
    return { ok: false, problem: SelectShapeProblem.NotSingleSelect };
  }

  const topLevel = significant.filter((e) => e.depth === 0);

  // `format`, `settings` and `EXCEPT` all mean something different before the FROM than after.
  let selectCount = 0;
  let selectIndex = -1;
  let fromIndex = -1;
  let hasSetOperation = false;
  let hasExtraStatement = false;

  for (let i = 0; i < topLevel.length; i++) {
    const { token } = topLevel[i];
    if (token.matchKeyword('SELECT')) {
      selectCount++;
      if (selectIndex === -1) {
        selectIndex = i;
      }
    } else if (token.matchKeyword('FROM') && fromIndex === -1) {
      fromIndex = i;
    } else if (token.matchKeyword('UNION') || token.matchKeyword('INTERSECT')) {
      hasSetOperation = true;
    } else if (token.matchKeyword('EXCEPT') && fromIndex !== -1) {
      hasSetOperation = true;
    } else if (token.type === TokenType.Semicolon && i !== topLevel.length - 1) {
      hasExtraStatement = true;
    }
  }

  if (hasExtraStatement) {
    return { ok: false, problem: SelectShapeProblem.MultiStatement };
  }
  if (hasSetOperation) {
    return { ok: false, problem: SelectShapeProblem.SetOperation };
  }
  if (selectCount !== 1) {
    return { ok: false, problem: SelectShapeProblem.NotSingleSelect };
  }
  if (fromIndex === -1) {
    return { ok: false, problem: SelectShapeProblem.NoFrom };
  }
  if (fromIndex < selectIndex) {
    return { ok: false, problem: SelectShapeProblem.NotSingleSelect };
  }

  let tailIndex = -1;

  for (let i = fromIndex + 1; i < topLevel.length; i++) {
    const { token } = topLevel[i];
    const next = i + 1 < topLevel.length ? topLevel[i + 1].token : undefined;
    const previous = topLevel[i - 1].token;

    // These are absent from the keyword set, but matchKeyword does not require membership.
    if (token.matchKeyword('INTO')) {
      return { ok: false, problem: SelectShapeProblem.IntoOutfile };
    }
    if (token.matchKeyword('SETTINGS')) {
      return { ok: false, problem: SelectShapeProblem.Settings };
    }
    if (token.matchKeyword('FILL')) {
      return { ok: false, problem: SelectShapeProblem.WithFill };
    }
    if (token.matchKeyword('TOTALS') || token.matchKeyword('ROLLUP') || token.matchKeyword('CUBE')) {
      return { ok: false, problem: SelectShapeProblem.WithTotalsRollupCube };
    }

    if (token.type === TokenType.Semicolon) {
      if (tailIndex === -1) {
        tailIndex = i;
      }
      continue;
    }

    if (token.matchKeyword('LIMIT')) {
      // `LIMIT n BY expr` filters rows per key, so dropping it inflates every bucket.
      for (let j = i + 1; j < topLevel.length; j++) {
        const candidate = topLevel[j].token;
        if (candidate.matchKeyword('BY')) {
          return { ok: false, problem: SelectShapeProblem.LimitBy };
        }
        if (
          candidate.type !== TokenType.Number &&
          candidate.type !== TokenType.Comma &&
          !candidate.matchKeyword('OFFSET')
        ) {
          break;
        }
      }
    }

    if (tailIndex !== -1) {
      continue;
    }

    if (token.type === TokenType.BareWord && TAIL_KEYWORDS.has(token.text.toUpperCase())) {
      if (isCompleteTail(topLevel, i)) {
        tailIndex = i;
        continue;
      }
      if (!isExpressionOperand(previous, 'before') && !isExpressionOperand(next, 'after')) {
        return { ok: false, problem: SelectShapeProblem.UnrecognizedTail };
      }
    }

    if (token.matchKeyword('ORDER') && next?.matchKeyword('BY')) {
      tailIndex = i;
    }
  }

  const headEnd = tailIndex === -1 ? sql.length : topLevel[tailIndex].token.begin;
  // Trailing newline so a `--` comment in the head cannot swallow what the caller appends.
  const head = sql.slice(0, headEnd).trimEnd() + '\n';

  const listTokens = significant.slice(
    significant.indexOf(topLevel[selectIndex]) + 1,
    significant.indexOf(topLevel[fromIndex])
  );

  return {
    ok: true,
    select: {
      head,
      items: parseSelectItems(listTokens, 0),
      from: parseFromTarget(topLevel, fromIndex, parseWithNames(topLevel, selectIndex)),
    },
  };
}
