import { parseFirst, Statement, SelectFromStatement, astMapper, ExprRef } from 'pgsql-ast-parser';
import { FromQueryNode, parseSelect, QueryNode, QueryNodeType, SelectQueryNode } from 'ch-parser/parser';

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

function unquoteIdentifier(name: string): string {
  return name.replace(/^["`]|["`]$/g, '');
}

function isSelectNode(node: QueryNode): node is SelectQueryNode {
  return node.type === QueryNodeType.Select;
}

// The physical table a FROM node points at, or undefined for a subquery, a
// table function, or a Grafana-variable target we cannot resolve to a table.
function qualifiedTableName(node: FromQueryNode): string | undefined {
  if (!node.table || node.isTableFunction) {
    return undefined;
  }
  const table = unquoteIdentifier(node.table);
  return node.database ? `${unquoteIdentifier(node.database)}.${table}` : table;
}

// Resolves the outer FROM at this select level, descending into a leading
// subquery or CTE body when this level's FROM is a subquery / table function /
// absent, because `additional_table_filters` keys on the underlying table.
function firstPhysicalTable(node: SelectQueryNode): string | undefined {
  const name = node.from ? qualifiedTableName(node.from) : undefined;
  if (name) {
    return name;
  }
  if (node.children) {
    for (const child of node.children) {
      if (isSelectNode(child)) {
        const nested = firstPhysicalTable(child);
        if (nested) {
          return nested;
        }
      }
    }
  }
  return undefined;
}

/**
 * Returns the physical table an ad-hoc filter should target for `sql`, or ''
 * when none can be found.
 *
 * Parses with the in-repo ClickHouse parser (shared with SQL autocomplete via
 * `parseSelect`), not `pgsql-ast-parser`. The Postgres grammar throws on valid
 * ClickHouse syntax (SAMPLE, INTERVAL, lambdas, an existing SETTINGS clause),
 * and on a throw the old implementation returned '', so the ad-hoc filter was
 * silently dropped (grafana/clickhouse-datasource#958). The ClickHouse parser
 * tokenizes that syntax instead of failing, and resolves through subqueries,
 * CTEs, keyword-named tables, and Grafana variables while rejecting table
 * functions and honoring statement boundaries.
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
