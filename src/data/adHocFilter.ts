
export function applyAdHocFilter(rawSql: string, adHocFilters: AdHocVariableFilter[]): string {
  if (rawSql != '' && adHocFilters && Object.keys(adHocFilters).length > 0) {
    let whereClause = 'WHERE';
    for (let k of adHocFilters) {
      let v = isNaN(Number(k.value)) ? `'${k.value}'` : Number(k.value)
      whereClause += ` ${k.key} ${k.operator} ${v} ${k.condition ? k.condition : 'AND'}`;
    }
    // if there is not a where clause, then the ad hoc filter will not be applied. 
    return rawSql.replace(/where/i, whereClause);
  }
  return rawSql;
}

export type AdHocVariableFilter = {
  key: string;
  operator: string;
  value: string;
  condition: string;
};