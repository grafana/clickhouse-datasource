import {
  parseFirst,
  Statement,
  SelectFromStatement,
  FromTable,
  astMapper,
  FromStatement,
  toSql,
} from 'pgsql-ast-parser';

export function sqlToStatement(sql: string): Statement {
  const replaceFuncs = [] as Array<{
    startIndex: number;
    name: string;
    replacementName: string;
  }>;
  //default is a key word in this grammar but it can be used in CH
  const re = /(\$__|\$|default)/gi;
  let regExpArray: RegExpExecArray | null;
  while ((regExpArray = re.exec(sql)) !== null) {
    replaceFuncs.push({ startIndex: regExpArray.index, name: regExpArray[0], replacementName: '' });
  }

  //need to process in reverse so starting positions aren't effected by replacing other things
  for (let i = replaceFuncs.length - 1; i >= 0; i--) {
    const si = replaceFuncs[i].startIndex;
    const replacementName = 'f' + (Math.random() + 1).toString(36).substring(7);
    replaceFuncs[i].replacementName = replacementName;
    sql = sql.substring(0, si) + replacementName + sql.substring(si + replaceFuncs[i].name.length);
  }

  let ast: Statement;
  try {
    ast = parseFirst(sql);
  } catch (err) {
    console.error(`Failed to parse SQL statement into an AST: ${err}`);
    return {} as Statement;
  }

  const mapper = astMapper((map) => ({
    tableRef: (t) => {
      const rfs = replaceFuncs.find((x) => x.replacementName === t.schema);
      if (rfs) {
        return { ...t, schema: rfs.name };
      }
      const rft = replaceFuncs.find((x) => x.replacementName === t.name);
      if (rft) {
        return { ...t, name: rft.name };
      }
      return map.super().tableRef(t);
    },
    ref: (r) => {
      const rf = replaceFuncs.find((x) => x.replacementName === r.name);
      if (rf) {
        return { ...r, name: rf.name };
      }
      return map.super().ref(r);
    },
    call: (c) => {
      const rf = replaceFuncs.find((x) => x.replacementName === c.function.name);
      if (rf) {
        return { ...c, function: { ...c.function, name: rf.name } };
      }
      return map.super().call(c);
    },
  }));
  return mapper.statement(ast)!;
}

export function getTable(sql: string): string {
  const stm = sqlToStatement(sql) as SelectFromStatement;
  if (stm.from?.length && stm.from?.length > 0) {
    switch (stm.from![0].type) {
      case 'table': {
        const table = stm.from![0] as FromTable;
        const tableName = `${table.name.schema ? `${table.name.schema}.` : ''}${table.name.name}`;
        // clickhouse table names are case sensitive and pgsql parser removes casing,
        // so we need to get the casing from the raw sql
        const s = new RegExp(`\\b${tableName}\\b`, 'gi').exec(sql);
        return s ? s[0] : tableName;
      }
      case 'statement': {
        const table = stm.from![0] as FromStatement;
        return getTable(toSql.statement(table.statement));
      }
    }
  }
  return '';
}
