import { Lexer } from './lexer';
import { Token, TokenType } from './types';

/**
 * Reasons a statement cannot be treated as a single, wrappable top-level SELECT.
 *
 * These are not errors. Every one of them means "do not rewrite this query", and callers are
 * expected to fall back to whatever they did before rather than surface anything to the user.
 */
export enum SelectShapeProblem {
  /** The lexer produced an error token (unterminated string, quote, or comment). */
  LexError = 'LexError',
  /** Brackets do not balance, so token offsets cannot be trusted. */
  Unbalanced = 'Unbalanced',
  /** Not a single top-level SELECT: a non-SELECT statement, a parenthesized SELECT, or several. */
  NotSingleSelect = 'NotSingleSelect',
  /** More than one statement separated by `;`. */
  MultiStatement = 'MultiStatement',
  /** No top-level FROM, so there is no row source to aggregate. */
  NoFrom = 'NoFrom',
  /** Top-level UNION / EXCEPT / INTERSECT. */
  SetOperation = 'SetOperation',
  /** Top-level INTO (`INTO OUTFILE`). */
  IntoOutfile = 'IntoOutfile',
  /** `LIMIT n BY expr` — a per-key row filter, not a trailing row cap. */
  LimitBy = 'LimitBy',
  /** `ORDER BY ... WITH FILL` — manufactures rows that do not exist in the table. */
  WithFill = 'WithFill',
  /** `WITH TOTALS` / `WITH ROLLUP` / `WITH CUBE` — adds subtotal rows. */
  WithTotalsRollupCube = 'WithTotalsRollupCube',
  /**
   * A top-level SETTINGS clause. Some settings (notably `additional_result_filter`) only apply
   * to the outermost result, so they silently stop filtering once the statement becomes a
   * subquery — the row count would differ from what the user's own query returns.
   */
  Settings = 'Settings',
}

/** A single item in the top-level SELECT list. */
export interface SelectItem {
  /** The item's output column name, when it can be determined. */
  outputName?: string;
  /**
   * The identifier the item selects, when the item is a lone identifier (optionally aliased).
   * Absent for expressions, qualified names, and anything else we decline to interpret.
   */
  sourceIdentifier?: string;
  /** True when the item is a bare `*`. */
  wildcard?: boolean;
}

export interface TopLevelSelect {
  /**
   * The statement with its trailing top-level ORDER BY / LIMIT / OFFSET / FORMAT and any
   * terminating `;` removed, so it can be used as a derived table. Always ends with a newline
   * so that a trailing line comment cannot swallow a following `)`.
   */
  head: string;
  /** Top-level SELECT list items, in source order. */
  items: SelectItem[];
}

export type ScanResult = { ok: true; select: TopLevelSelect } | { ok: false; problem: SelectShapeProblem };

/** Keywords that, appearing at bracket depth 0, begin the trailing clauses we drop. */
const TAIL_KEYWORDS = new Set(['LIMIT', 'OFFSET', 'FORMAT']);

/**
 * Strips surrounding quotes from an identifier and unescapes any doubled quote characters.
 * `"a""b"` -> `a"b`, `` `x` `` -> `x`.
 */
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

/**
 * Splits the SELECT list into items on depth-relative commas, then classifies each item.
 *
 * `tokens` are the significant tokens between SELECT and FROM, with `baseDepth` the bracket
 * depth of the SELECT itself, so commas inside function calls or tuples do not split items.
 */
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
    // A leading DISTINCT belongs to the SELECT, not to the first item.
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
      // The alias must be a single identifier for the output name to be unambiguous.
      if (right.length !== 1 || !isIdentifier(right[0].token)) {
        return {};
      }
      const outputName = unquoteIdentifier(right[0].token.text);
      // Only a lone identifier on the left is a plain column reference. An expression
      // (`Timestamp - INTERVAL 5 HOUR AS t`) is deliberately not reported as one, because
      // callers use sourceIdentifier to decide the value is the column they think it is.
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
 * Scans a statement for the structure needed to safely wrap it as a derived table.
 *
 * This deliberately answers only what a caller can act on without understanding the query:
 * where the droppable tail starts, and what the top-level SELECT list projects. It never
 * interprets the FROM clause, so table functions, CTE references, template variables and
 * JOINs need no special handling — they are carried along verbatim.
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

  // Locate the SELECT and its FROM first. Every remaining check needs to know whether a token
  // sits in the select list or after the FROM, because the same word means different things in
  // each position: `format` and `settings` are ordinary function and column names in a select
  // list, and `EXCEPT` is a column modifier there but a set operator after the FROM.
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
      // Only a set operator once the FROM has been seen. Before it, `* EXCEPT (col)` is the
      // column exclusion modifier, which is harmless to carry along verbatim.
      hasSetOperation = true;
    } else if (token.type === TokenType.Semicolon && i !== topLevel.length - 1) {
      hasExtraStatement = true;
    }
  }

  // Reported in the same precedence as the offending construct's severity, so the caller's
  // decline reason names the most specific thing that is wrong.
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
    // A FROM ahead of the SELECT is not a shape we understand.
    return { ok: false, problem: SelectShapeProblem.NotSingleSelect };
  }

  let tailIndex = -1;

  for (let i = fromIndex + 1; i < topLevel.length; i++) {
    const { token } = topLevel[i];
    const next = i + 1 < topLevel.length ? topLevel[i + 1].token : undefined;
    const previous = topLevel[i - 1].token;

    // Matched on token text rather than the keyword set: FILL, TOTALS, ROLLUP, CUBE and
    // OUTFILE are not in ch-parser's keyword list, but matchKeyword does not require them
    // to be. Missing any of these would mean silently miscounting rather than declining.
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
      // Already known to be the final significant token, so it is just the statement
      // terminator and belongs to the droppable tail.
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
        // Only `n`, `n, m` and `n OFFSET m` may sit between LIMIT and a BY.
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

    // A tail keyword only starts the tail in clause position. Requiring the argument that the
    // clause grammar expects keeps ordinary uses of these words as identifiers from truncating
    // the statement: `WHERE format = 1`, `WHERE limit = 1`, `... AS format`.
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
  // The newline guarantees a trailing `--` comment in the head cannot comment out whatever
  // the caller appends next.
  const head = sql.slice(0, headEnd).replace(/\s+$/, '') + '\n';

  const listTokens = significant.slice(
    significant.indexOf(topLevel[selectIndex]) + 1,
    significant.indexOf(topLevel[fromIndex])
  );

  return { ok: true, select: { head, items: parseSelectItems(listTokens, 0) } };
}
