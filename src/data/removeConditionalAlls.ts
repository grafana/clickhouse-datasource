import { ScopedVars, VariableModel } from '@grafana/data';
import { astToSql } from './ast';
import { removeConditionalAllsFromAST } from './grammar';

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
  return astToSql(removeConditionalAllsFromAST(sql, varNames));
}
