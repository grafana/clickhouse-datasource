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
  /** Manufactures rows that do not exist in the table. */
  WithFill = 'WithFill',
  /** Adds subtotal rows. */
  WithTotalsRollupCube = 'WithTotalsRollupCube',
  /** `additional_result_filter` and friends only apply to the outermost result, so they stop
   * filtering once the statement becomes a subquery. */
  Settings = 'Settings',
}

export interface SelectItem {
  outputName?: string;
  /** Set only for a lone identifier, optionally aliased. Absent for expressions and qualified names. */
  sourceIdentifier?: string;
  wildcard?: boolean;
}

export interface TopLevelSelect {
  /** The statement with its trailing ORDER BY / LIMIT / OFFSET / FORMAT / `;` removed. */
  head: string;
  items: SelectItem[];
}

export type ScanResult = { ok: true; select: TopLevelSelect } | { ok: false; problem: SelectShapeProblem };

/** Keywords that begin the trailing clauses we drop. */
const TAIL_KEYWORDS = new Set(['LIMIT', 'OFFSET', 'FORMAT']);

/** `"a""b"` -> `a"b`, `` `x` `` -> `x`. */
export function unquoteIdentifier(text: string): string {
  if (text.length < 2) {
    return text;
  }

  const first = text[0];
  const last = text[text.length - 1];
  if ((first === '"' && last === '"') || (first === '`' && last === '`')) {
    return text
      .slice(1, -1)
      .split(first + first)
      .join(first);
  }

  return text;
}

function isIdentifier(token: Token): boolean {
  return token.type === TokenType.QuotedIdentifier || (token.type === TokenType.BareWord && !token.isKeyword());
}

interface DepthToken {
  token: Token;
  depth: number;
}

/** Splits the SELECT list on depth-`baseDepth` commas so commas inside calls do not split items. */
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
    // DISTINCT belongs to the SELECT, not to the first item.
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
      // Callers use sourceIdentifier to trust the value is that column, so an expression
      // like `Timestamp - INTERVAL 5 HOUR AS t` must not report one.
      if (left.length === 1 && isIdentifier(left[0].token)) {
        return { outputName, sourceIdentifier: unquoteIdentifier(left[0].token.text) };
      }
      return { outputName };
    }

    if (group.length === 1 && isIdentifier(group[0].token)) {
      const name = unquoteIdentifier(group[0].token.text);
      return { outputName: name, sourceIdentifier: name };
    }

    return {};
  });
}

/**
 * Finds where the droppable tail starts and what the SELECT list projects, so a caller can wrap
 * the statement as a derived table. Never interprets the FROM, so table functions, CTE
 * references and template variables need no handling.
 */
export function scanTopLevelSelect(sql: string): ScanResult {
  const lexer = new Lexer(sql);
  const significant: DepthToken[] = [];
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

    if (token.type === TokenType.ClosingRoundBracket) {
      depth--;
      if (depth < 0) {
        return { ok: false, problem: SelectShapeProblem.Unbalanced };
      }
    }

    significant.push({ token, depth });

    if (token.type === TokenType.OpeningRoundBracket) {
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

  // Locate SELECT and FROM first: the same word means different things either side of the FROM.
  // `format` and `settings` are ordinary names in a select list, and `EXCEPT` is a column
  // modifier there but a set operator after it.
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
      // Before the FROM it is `* EXCEPT (col)`, the column exclusion modifier.
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

    // FILL, TOTALS, ROLLUP, CUBE and OUTFILE are absent from ch-parser's keyword set, but
    // matchKeyword does not require membership.
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
      // Already known to be the last significant token, so it is just the terminator.
      if (tailIndex === -1) {
        tailIndex = i;
      }
      continue;
    }

    if (token.matchKeyword('LIMIT')) {
      // `LIMIT n BY expr` filters rows per key; dropping it would inflate every bucket.
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

    // Only in clause position: requiring the expected argument stops `WHERE format = 1`,
    // `WHERE limit = 1` and `... AS format` from truncating the statement.
    if (token.type === TokenType.BareWord && TAIL_KEYWORDS.has(token.text.toUpperCase()) && next) {
      const expectsNumber = !token.matchKeyword('FORMAT');
      const argumentFits = expectsNumber ? next.type === TokenType.Number : next.type === TokenType.BareWord;
      if (argumentFits && !previous.matchKeyword('AS') && next.type !== TokenType.OpeningRoundBracket) {
        tailIndex = i;
        continue;
      }
    }

    // ORDER BY, but not GROUP BY.
    if (token.matchKeyword('ORDER') && next?.matchKeyword('BY')) {
      tailIndex = i;
    }
  }

  const headEnd = tailIndex === -1 ? sql.length : topLevel[tailIndex].token.begin;
  // Trailing newline so a `--` comment in the head cannot swallow what the caller appends.
  const head = sql.slice(0, headEnd).replace(/\s+$/, '') + '\n';

  const listTokens = significant.slice(
    significant.indexOf(topLevel[selectIndex]) + 1,
    significant.indexOf(topLevel[fromIndex])
  );

  return { ok: true, select: { head, items: parseSelectItems(listTokens, 0) } };
}
