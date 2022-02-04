import { VariableModel } from '@grafana/data';
import sqlToAST, { astToSql, removeConditionalAllsFromAST } from './ast';

export function removeConditionalAlls(sql: string, queryVars: VariableModel[]): string {
  if (sql === '' || !queryVars || queryVars.length === 0) {
    return sql;
  }

  const varNames: string[] = [];
  for (let v of queryVars) {
    if (v.type !== 'query') {
      continue;
    }
    if ((v as any)?.current?.value?.toString() === '$__all') {
      varNames.push(v.name);
    }
  }
  // Semicolons are not required and cause problems when building the SQL
  sql = sql.replace(';', '');
  const ast = sqlToAST(sql);
  removeConditionalAllsFromAST(ast, varNames);
  return astToSql(ast);
}
