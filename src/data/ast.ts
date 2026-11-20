import { parseFirst, Statement, SelectFromStatement, astMapper, ExprRef } from 'pgsql-ast-parser';
import { Lexer } from 'ch-parser/lexer';
import { FromQueryNode, parseSelect, QueryNodeType, SelectQueryNode } from 'ch-parser/parser';
import { unquoteIdentifier as unquoteName } from 'ch-parser/spans';
import { Token, TokenType } from 'ch-parser/types';

interface ReplacePart {
  startIndex: number;
  name: string;
  replacementName: string;
}
type ReplaceParts = ReplacePart[];

function getReplacementKey(isVariable: boolean) {
  const prefix = isVariable ? 'v' : 'f';
  return prefix + (Math.random() + 1).toString(36).substring(7);
}

/**
 * Replaces macro functions and keywords such as $__timeFilter() and "default"
 */
function replaceMacroFunctions(sql: string): [ReplaceParts, string] {
  const replaceFuncs: ReplaceParts = [];
  // default is a keyword in this grammar, but it can be used in CH
  const keywordRegex = /(\$__|\$|default|settings)/gi;
  let regExpArray: RegExpExecArray | null;
  while ((regExpArray = keywordRegex.exec(sql)) !== null) {
    replaceFuncs.push({ startIndex: regExpArray.index, name: regExpArray[0], replacementName: '' });
  }

  // need to process in reverse so starting positions aren't affected by replacing other things
  for (let i = replaceFuncs.length - 1; i >= 0; i--) {
    const si = replaceFuncs[i].startIndex;
    const replacementName = getReplacementKey(false);
    replaceFuncs[i].replacementName = replacementName;
    // settings do not parse and we do not need information from them so we will remove them
    if (replaceFuncs[i].name.toLowerCase() === 'settings') {
      sql = sql.substring(0, si);
      continue;
    }
    sql = sql.substring(0, si) + replacementName + sql.substring(si + replaceFuncs[i].name.length);
  }

  return [replaceFuncs, sql];
}

/**
 * Replaces Grafana variables such as ${var} ${var.key} ${var.key:singlequote}
 * https://grafana.com/docs/grafana/latest/dashboards/variables
 */
function replaceMacroVariables(sql: string): [ReplaceParts, string] {
  const replaceVariables: ReplaceParts = [];
  const variableRegex = /\${[a-zA-Z0-9_:.\w]+}/g;

  let regExpArray: RegExpExecArray | null;
  while ((regExpArray = variableRegex.exec(sql)) !== null) {
    replaceVariables.push({ startIndex: regExpArray.index, name: regExpArray[0], replacementName: '' });
  }

  // need to process in reverse so starting positions aren't affected by replacing other things
  for (let i = replaceVariables.length - 1; i >= 0; i--) {
    const si = replaceVariables[i].startIndex;
    const replacementName = getReplacementKey(true);
    replaceVariables[i].replacementName = replacementName;
    sql = sql.substring(0, si) + replacementName + sql.substring(si + replaceVariables[i].name.length);
  }

  return [replaceVariables, sql];
}

// TODO: support query parameters: https://clickhouse.com/docs/en/interfaces/cli#cli-queries-with-parameters

/**
 * The generated logs range filter ends in `$__toTime_ms + INTERVAL 1 MILLISECOND`, which pgsql-ast-parser
 * cannot parse. Drop the offset so the filter reads like the seconds form (`$__toTime_ms`).
 */
const MS_BOUND_SUFFIX = /(\$__toTime_ms)\s*\+\s*INTERVAL\s+1\s+MILLISECOND/gi;

export function sqlToStatement(rawSql: string): Statement {
  const [replaceVars, variableSql] = replaceMacroVariables(rawSql.replace(MS_BOUND_SUFFIX, '$1'));
  const [replaceFuncs, sql] = replaceMacroFunctions(variableSql);
  const replaceParts = replaceVars.concat(replaceFuncs);

  let ast: Statement;
  try {
    ast = parseFirst(sql);
  } catch (err) {
    console.error(`Failed to parse SQL statement into an AST: ${err}`);
    return {} as Statement;
  }

  const mapper = astMapper((map) => ({
    tableRef: (t) => {
      const rfs = replaceParts.find((x) => x.replacementName === t.schema);
      if (rfs) {
        return { ...t, schema: t.schema?.replace(rfs.replacementName, rfs.name) };
      }
      const rft = replaceParts.find((x) => x.replacementName === t.name);
      if (rft) {
        return { ...t, name: t.name.replace(rft.replacementName, rft.name) };
      }
      return map.super().tableRef(t);
    },
    ref: (r) => {
      const rf = replaceParts.find((x) => r.name.startsWith(x.replacementName));
      if (rf) {
        const d = r.name.replace(rf.replacementName, rf.name);
        return { ...r, name: d };
      }
      return map.super().ref(r);
    },
    expr: (e) => {
      if (!e || e.type !== 'string') {
        return map.super().expr(e);
      }

      const rf = replaceParts.find((x) => e.value.startsWith(x.replacementName));
      if (rf) {
        const d = e.value.replace(rf.replacementName, rf.name);
        return { ...e, value: d };
      }

      return map.super().expr(e);
    },
    call: (c) => {
      const rf = replaceParts.find((x) => c.function.name.startsWith(x.replacementName));
      if (rf) {
        return { ...c, function: { ...c.function, name: c.function.name.replace(rf.replacementName, rf.name) } };
      }
      return map.super().call(c);
    },
  }));
  return mapper.statement(ast)!;
}

function unquoteIdentifier(name: string): string {
  return name.replace(/^["`]|["`]$/g, '');
}

// The physical table a FROM node points at, or undefined for a subquery or a
// table function. A Grafana-variable target is returned verbatim (e.g.
// `${table}`), since that is the identifier the emitted query carries.
function qualifiedTableName(node: FromQueryNode): string | undefined {
  if (!node.table || node.isTableFunction) {
    return undefined;
  }
  const table = unquoteIdentifier(node.table);
  return node.database ? `${unquoteIdentifier(node.database)}.${table}` : table;
}

// Resolves the table the outer FROM reads from at this select level. When the
// FROM is a subquery it descends into that subquery, and only that subquery, so
// a scalar subquery in the SELECT list or a sibling CTE body is never mistaken
// for the target. A FROM that references a CTE resolves to the CTE's underlying
// table. A table-function FROM, or a top-level set operation, resolves to
// undefined.
function firstPhysicalTable(node: SelectQueryNode): string | undefined {
  // A top-level UNION / INTERSECT / EXCEPT combines several tables; single-table
  // targeting is not meaningful, so resolve to no table. Per-branch keying is a
  // follow-up.
  if (node.hasSetOperation) {
    return undefined;
  }
  const from = node.from;
  if (!from) {
    return undefined;
  }
  // An unqualified FROM target that names a CTE defined at this level resolves
  // to the CTE body's table, not the alias (which ClickHouse would ignore).
  if (from.table && !from.database && !from.isTableFunction) {
    const cteBody = node.withAliases?.get(from.table);
    if (cteBody) {
      return firstPhysicalTable(cteBody);
    }
  }
  const name = qualifiedTableName(from);
  if (name) {
    return name;
  }
  if (from.subquery) {
    return firstPhysicalTable(from.subquery);
  }
  return undefined;
}

/**
 * Returns the physical table an ad-hoc filter should target for `sql`, or ''
 * when none can be found.
 *
 * Parses with the in-repo ClickHouse parser (shared with SQL autocomplete via
 * `parseSelect`), not `pgsql-ast-parser`. The Postgres grammar throws on valid
 * ClickHouse syntax (SAMPLE, INTERVAL, lambdas, backtick-quoted names), and on
 * a throw the old implementation returned '', so the ad-hoc filter was silently
 * dropped (grafana/clickhouse-datasource#958). The ClickHouse parser tokenizes
 * that syntax instead of failing, and resolves through a subquery FROM, CTE
 * references, keyword-named tables, and Grafana variables while rejecting table
 * functions and top-level UNIONs and honoring statement boundaries.
 */
export function getTable(sql: string): string {
  const root = parseSelect(sql);
  if (!root) {
    return '';
  }
  return firstPhysicalTable(root) ?? '';
}

/** An alias the outer SELECT defines, as an ad-hoc filter on the table can use it. */
export interface SelectAlias {
  /**
   * The aliased expression, rebuilt from its tokens without comments, so a line comment cannot
   * swallow what follows it, and without the qualifier that names the table, which a filter on
   * the table cannot see.
   */
  expression: string;
  /**
   * Whether the expression is a value of the table's rows. An aggregate or window function, a
   * subquery, `arrayJoin` or a macro is not, so a filter on the table cannot evaluate it.
   */
  rowValue: boolean;
}

/**
 * The aliases (`SeverityText AS level`) the outer SELECT of `sql` defines, keyed by alias, with
 * the table that SELECT reads. Undefined unless the outer SELECT reads a single table directly:
 * over a subquery or a CTE its aliases name the subquery's columns, and with a JOIN an alias may
 * name the joined table's columns.
 */
export function getSelectAliases(sql: string): { table: string; aliases: Map<string, SelectAlias> } | undefined {
  const root = parseSelect(sql);
  const from = root?.from;
  if (!root?.token || !from || root.hasSetOperation || root.token.end > from.token.begin) {
    return undefined;
  }
  if (from.table && !from.database && !from.isTableFunction && root.withAliases?.has(from.table)) {
    return undefined;
  }
  const table = qualifiedTableName(from);
  const joins = root.children?.some((child) => child.type === QueryNodeType.From && child.token.matchKeyword('JOIN'));
  if (!table || joins) {
    return undefined;
  }

  const tokens: Token[] = [];
  const lexer = new Lexer(sql);
  for (let token = lexer.nextToken(); !token.isEnd(); token = lexer.nextToken()) {
    if (token.isSignificant()) {
      tokens.push(token);
    }
  }
  const fromIndex = tokens.findIndex((token) => token.begin === from.token.begin);
  const tableAlias = fromTableAlias(tokens, fromIndex);
  const selectList = tokens.filter((token) => token.begin >= root.token.end && token.end <= from.token.begin);

  const aliases = new Map<string, SelectAlias>();
  splitAtTopLevelCommas(selectList).forEach((item, index) => {
    const selectItem = index === 0 ? dropSelectModifiers(item) : item;
    const asIndex = lastTopLevelAs(selectItem);
    // `<expression> AS <alias>`, with nothing after the alias.
    if (asIndex < 1 || asIndex !== selectItem.length - 2 || !isAliasName(selectItem[asIndex + 1])) {
      return;
    }
    const name = unquoteName(selectItem[asIndex + 1].text);
    if (name === undefined || aliases.has(name)) {
      return;
    }
    const expression = selectItem.slice(0, asIndex);
    aliases.set(name, { expression: renderExpression(expression, tableAlias), rowValue: isRowValue(expression) });
  });
  return { table, aliases };
}

const OPENING_BRACKETS = new Set([
  TokenType.OpeningRoundBracket,
  TokenType.OpeningSquareBracket,
  TokenType.OpeningCurlyBrace,
]);
const CLOSING_BRACKETS = new Set([
  TokenType.ClosingRoundBracket,
  TokenType.ClosingSquareBracket,
  TokenType.ClosingCurlyBrace,
]);

function splitAtTopLevelCommas(tokens: Token[]): Token[][] {
  const items: Token[][] = [[]];
  let depth = 0;
  for (const token of tokens) {
    if (OPENING_BRACKETS.has(token.type)) {
      depth++;
    } else if (CLOSING_BRACKETS.has(token.type)) {
      depth--;
    } else if (token.type === TokenType.Comma && depth === 0) {
      items.push([]);
      continue;
    }
    items[items.length - 1].push(token);
  }
  return items;
}

// The index of the last AS outside brackets, or -1. An AS inside brackets belongs to the
// expression, as in CAST(x AS String).
function lastTopLevelAs(tokens: Token[]): number {
  let depth = 0;
  let index = -1;
  tokens.forEach((token, i) => {
    if (OPENING_BRACKETS.has(token.type)) {
      depth++;
    } else if (CLOSING_BRACKETS.has(token.type)) {
      depth--;
    } else if (depth === 0 && token.matchKeyword('AS')) {
      index = i;
    }
  });
  return index;
}

// The first select item without the DISTINCT [ON (...)], ALL or TOP n [WITH TIES] that can
// precede it.
function dropSelectModifiers(tokens: Token[]): Token[] {
  let i = 0;
  if (tokens[i]?.matchKeyword('DISTINCT') && tokens[i + 1]?.matchKeyword('ON')) {
    i = closingBracketIndex(tokens, i + 2) + 1;
  } else if (tokens[i]?.matchKeyword('DISTINCT') || tokens[i]?.matchKeyword('ALL')) {
    i++;
  }
  if (tokens[i]?.matchKeyword('TOP') && tokens[i + 1]?.type === TokenType.Number) {
    i += 2;
    if (tokens[i]?.matchKeyword('WITH') && tokens[i + 1]?.matchKeyword('TIES')) {
      i += 2;
    }
  }
  return tokens.slice(i);
}

// The index of the bracket that closes the one at `open`, or the last index when it is not closed.
function closingBracketIndex(tokens: Token[], open: number): number {
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    if (OPENING_BRACKETS.has(tokens[i].type)) {
      depth++;
    } else if (CLOSING_BRACKETS.has(tokens[i].type) && --depth === 0) {
      return i;
    }
  }
  return tokens.length - 1;
}

function isAliasName(token: Token): boolean {
  return token.type === TokenType.QuotedIdentifier || (token.type === TokenType.BareWord && !token.isKeyword());
}

// The alias the FROM gives its table: `FROM otel.otel_logs AS l` or `FROM otel_logs l`.
function fromTableAlias(tokens: Token[], fromIndex: number): string | undefined {
  if (fromIndex === -1) {
    return undefined;
  }
  let i = fromIndex + 1;
  while (tokens[i]?.type === TokenType.BareWord || tokens[i]?.type === TokenType.QuotedIdentifier) {
    i++;
    if (tokens[i]?.type !== TokenType.Dot) {
      break;
    }
    i++;
  }
  if (tokens[i]?.matchKeyword('AS')) {
    i++;
  }
  return tokens[i] && isAliasName(tokens[i]) ? unquoteName(tokens[i].text) : undefined;
}

// `tokens` as SQL text, with one space where the source had whitespace or a comment, and the
// `<tableAlias>.` qualifier dropped.
function renderExpression(tokens: Token[], tableAlias: string | undefined): string {
  let text = '';
  let space = false;
  for (let i = 0; i < tokens.length; i++) {
    space ||= i > 0 && tokens[i].begin > tokens[i - 1].end;
    const qualifier =
      tableAlias !== undefined &&
      isAliasName(tokens[i]) &&
      unquoteName(tokens[i].text) === tableAlias &&
      tokens[i + 1]?.type === TokenType.Dot &&
      tokens[i - 1]?.type !== TokenType.Dot;
    if (qualifier) {
      i++;
      continue;
    }
    text += (space && text !== '' ? ' ' : '') + tokens[i].text;
    space = false;
  }
  return text;
}

function isRowValue(tokens: Token[]): boolean {
  return tokens.every((token, i) => {
    // The lexer reads a macro such as $__timeInterval as one word, and the `$` of ${var} on its own.
    if (token.matchKeyword('OVER') || token.matchKeyword('SELECT') || token.text.startsWith('$')) {
      return false;
    }
    if (token.type !== TokenType.BareWord || tokens[i + 1]?.type !== TokenType.OpeningRoundBracket) {
      return true;
    }
    // A parametric aggregate takes two argument lists, as in quantile(0.9)(Duration).
    const twoArgumentLists = tokens[closingBracketIndex(tokens, i + 1) + 1]?.type === TokenType.OpeningRoundBracket;
    return !twoArgumentLists && !isAggregateFunction(token.text) && !/^arrayJoin$/i.test(token.text);
  });
}

// cspell:ignore uniq Kahan sparkbar Corr covar
const lowercased = (names: string) =>
  names
    .trim()
    .split(/\s+/)
    .map((name) => name.toLowerCase());

// Aggregate functions in common use, compared without case. Each name also matches with
// ClickHouse's suffixes appended, as in countIf, sumArray or avgMergeState, and a name that
// starts with one of the family prefixes is an aggregate too (quantileExact, uniqCombined64,
// groupArrayMovingSum). A rarer aggregate is taken for a row value, so a filter through its
// alias fails in ClickHouse the way a filter on an unknown column does.
const AGGREGATE_FUNCTIONS = new Set(
  lowercased(`count sum avg min max any anyLast anyHeavy any_value first_value last_value argMin argMax
    avgWeighted sumKahan sumWithOverflow sumCount deltaSum deltaSumTimestamp entropy histogram groupConcat
    groupUniqArray array_agg retention windowFunnel simpleLinearRegression maxMap minMap maxIntersections
    boundingRatio intervalLengthSum singleValueOrNull var_pop var_samp sparkbar rankCorr
    exponentialMovingAverage nonNegativeDerivative largestTriangleThreeBuckets`)
);
const AGGREGATE_FAMILIES = lowercased(`quantile median uniq groupArray groupBit topK stddev varPop varSamp covar corr
  kurt skew sequence sumMap exponentialTimeDecayed`);
// Longest first, so OrNull is not read as Null and SimpleState not as State.
const AGGREGATE_SUFFIXES = lowercased(
  'SimpleState OrDefault Resample Distinct ForEach ArgMin ArgMax OrNull Array Merge State Tuple Null Map If'
);

function isAggregateFunction(name: string): boolean {
  let base = name.toLowerCase();
  while (true) {
    if (AGGREGATE_FUNCTIONS.has(base) || AGGREGATE_FAMILIES.some((family) => base.startsWith(family))) {
      return true;
    }
    const suffix = AGGREGATE_SUFFIXES.find((s) => base.length > s.length && base.endsWith(s));
    if (suffix === undefined) {
      return false;
    }
    base = base.slice(0, -suffix.length);
  }
}

export function getFields(sql: string): string[] {
  const stm = sqlToStatement(sql) as SelectFromStatement;
  if (stm.type !== 'select' || !stm.columns?.length || stm.columns?.length <= 0) {
    return [];
  }

  return stm.columns.map((x) => {
    const exprName = (x.expr as ExprRef).name;

    if (x.alias !== undefined) {
      return `${exprName} as ${x.alias?.name}`;
    } else {
      return `${exprName}`;
    }
  });
}
