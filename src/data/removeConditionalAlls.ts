import { ScopedVars, VariableModel } from '@grafana/data';
import sqlToAST, { astToSql, removeConditionalAllsFromAST } from './ast';

export function removeConditionalAlls(sql: string, queryVars: VariableModel[], scopedVars?: ScopedVars): string {
  if (sql === '' || !queryVars || queryVars.length === 0) {
    return sql;
  }

  const varNames: string[] = [];
  for (let qv of queryVars) {
    if (qv.type !== 'query') {
      continue;
    }
    const val = scopedVars?.[qv.name]?.value ?? (qv as any)?.current?.value;
    if (val?.toString() === '$__all') {
      varNames.push(qv.name);
    }
  }
  // Semicolons are not required and cause problems when building the SQL
  sql = sql.replace(';', '');
  const ast = sqlToAST(sql);
  removeConditionalAllsFromAST(ast, varNames);
  return astToSql(ast);
}
