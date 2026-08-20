import { parseFirst, Statement, SelectFromStatement, astMapper, ExprRef } from 'pgsql-ast-parser';
import { Lexer } from 'ch-parser/lexer';
import { Token } from 'ch-parser/types';
import {
  FromQueryNode,
  parseSelectQueryNode,
  QueryNode,
  QueryNodeParser,
  QueryNodeType,
  SelectQueryNode,
} from 'ch-parser/parser';

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

export function sqlToStatement(rawSql: string): Statement {
  const [replaceVars, variableSql] = replaceMacroVariables(rawSql);
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

/**
 * Tokenizes `sql` with the in-repo ClickHouse lexer and builds the shallow
 * select-query node tree. Returns null when the input is not a SELECT (or
 * WITH ... SELECT) statement.
 */
function parseSelect(sql: string): SelectQueryNode | null {
  const lexer = new Lexer(sql);
  const tokens: Token[] = [];
  for (let token = lexer.nextToken(); !token.isEnd(); token = lexer.nextToken()) {
    if (token.isSignificant()) {
      tokens.push(token);
    }
  }
  return parseSelectQueryNode(new QueryNodeParser(tokens));
}

// Strip backtick / double-quote identifier quoting so the name matches the
// physical table name `additional_table_filters` keys on. `apply()` already
// strips double quotes from the query before matching (see adHocFilter.ts).
function unquoteIdentifier(name: string): string {
  return name.replace(/^["`]|["`]$/g, '');
}

function qualifiedTableName(node: FromQueryNode): string | undefined {
  if (!node.table) {
    return undefined;
  }
  const table = unquoteIdentifier(node.table);
  return node.database ? `${unquoteIdentifier(node.database)}.${table}` : table;
}

function isFromNode(node: QueryNode): node is FromQueryNode {
  return node.type === QueryNodeType.From;
}

function isSelectNode(node: QueryNode): node is SelectQueryNode {
  return node.type === QueryNodeType.Select;
}

/**
 * Walks the select-query node tree in document order and returns the first
 * physical table referenced by a FROM / JOIN clause, descending into
 * subqueries and CTE bodies. We resolve to the underlying physical table
 * rather than a subquery/CTE alias because that is what
 * `additional_table_filters` keys on. Returns undefined when no physical
 * table is present.
 */
function firstPhysicalTable(node: SelectQueryNode): string | undefined {
  if (!node.children) {
    return undefined;
  }
  for (const child of node.children) {
    if (isFromNode(child)) {
      const name = qualifiedTableName(child);
      if (name) {
        return name;
      }
    } else if (isSelectNode(child)) {
      const nested = firstPhysicalTable(child);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

/**
 * Returns the physical table an ad-hoc filter should target for `sql`, or ''
 * when none can be found.
 *
 * Previously this parsed with `pgsql-ast-parser`, a Postgres grammar that
 * throws on valid ClickHouse syntax (SAMPLE, INTERVAL, lambdas, an existing
 * SETTINGS clause, ...). On a throw it returned '', so the ad-hoc filter was
 * silently dropped (grafana/clickhouse-datasource#958, #714). This uses the
 * in-repo ClickHouse lexer and parser already shipping for query
 * autocomplete, so ClickHouse syntax tokenizes instead of failing. The
 * contract is unchanged: the first FROM table (descending into a leading
 * subquery or CTE), preserving its original casing, and '' when none exists.
 */
export function getTable(sql: string): string {
  const root = parseSelect(sql);
  if (!root) {
    return '';
  }
  return firstPhysicalTable(root) ?? '';
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
