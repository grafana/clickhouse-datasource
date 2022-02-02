import { VariableModel } from "@grafana/data";
import { isString } from "lodash";
import sqlToAST, { AST, ASTToSql, Clause } from "./ast";



export function removeConditionalAlls(sql: string, queryVars: VariableModel[]): string {
  if (sql === '' && queryVars.length === 0) {
    return sql;
  }

  const varNames: string[] = [];
  for (let v of queryVars) {
    if ((v as any)?.current?.value?.toString() === '$__all') {
      varNames.push(v.name);
    }
  }
  // Semicolons are not required and cause problems when building the SQL
  sql = sql.replace(';', '');
  const ast = sqlToAST(sql);
  conditionalAllWhere(ast, varNames);
  return ASTToSql(ast);
}

function conditionalAllWhere(ast: AST, queryVarNames: string[]): AST {
  if (!ast || !ast.get('FROM')) {
    return ast;
  }

  const where = ast.get('WHERE');
  if (where) {
    for (let i = 0; i < where.length; i++) {
      const c = where[i];
      if (isString(c) && queryVarNames.some(v => c.includes(v))) {
        where[i] = null;
      }
    }
  }

  // Each node in the AST needs to be checked to see if ad hoc filters should be applied
  ast.forEach((clauses: Clause[], key: string) => {
    for (const c of clauses) {
      if (c !== null && !isString(c)) {
        conditionalAllWhere(ast, queryVarNames);
      }
    }
  });

  return ast;
}
