import { VariableModel } from '@grafana/data';
import { removeConditionalAlls } from './removeConditionalAlls';

describe('RemoveConditionalAlls', () => {
  const testCasesWithAllTempVar = [
    {
      name: 'removes template variable selecting ALL with one WHERE condition',
      input: 'SELECT * FROM table WHERE col in ($tempVar)',
      expect: 'SELECT * FROM table',
    },
    {
      name: 'removes template variable selecting ALL with surrounding WHERE conditions',
      input: `SELECT * FROM table WHERE date >= today AND col in ($tempVar) AND name = 'smith'`,
      expect: `SELECT * FROM table WHERE date >= today AND name = 'smith'`,
    },
    {
      name: 'removes template variable selecting ALL with a WHERE condition after',
      input: `SELECT * FROM table WHERE col in ($tempVar) AND name = 'smith'`,
      expect: `SELECT * FROM table WHERE name = 'smith'`,
    },
    {
      name: 'removes template variable selecting ALL with a WHERE conditions before',
      input: `SELECT * FROM table WHERE date >= today AND col in ($tempVar)`,
      expect: `SELECT * FROM table WHERE date >= today`,
    },
    {
      name: 'removes template variable selecting ALL with a WHERE conditions in an inline query in FROM',
      input: `SELECT * FROM ( SELECT * FROM table WHERE col in ($tempVar) )`,
      expect: `SELECT * FROM ( SELECT * FROM table )`,
    },
    {
      name: 'removes template variable selecting ALL with a WHERE conditions in an inline query in WHERE',
      input: `SELECT * FROM table WHERE col in ( SELECT * FROM table WHERE col in ($tempVar) )`,
      expect: `SELECT * FROM table WHERE col in ( SELECT * FROM table )`,
    },
    {
      name: 'removes template variable selecting ALL with a WHERE conditions in an inline query in WHERE with ending stuff',
      input: `SELECT * FROM table WHERE col in (( SELECT * FROM table WHERE col in ($tempVar) )) by hello`,
      expect: `SELECT * FROM table WHERE col in (( SELECT * FROM table )) by hello`,
    },
    {
      name: 'does not removes template variable selecting ALL when not in where condition',
      input: `SELECT * FROM $tempVar`,
      expect: `SELECT * FROM $tempVar`,
    },
    {
      name: 'removes template variables when there are two in single WHERE statement',
      input: `Select * from table WHERE active AND database IN (\${tempVar}) AND table IN (\${tempVar}) GROUP BY row`,
      expect: `SELECT * FROM table WHERE active GROUP BY row`,
    },
    {
      name: 'query with functions',
      input: `SELECT engine, count() as "Number of tables" FROM system.tables WHERE notLike(engine,'System%') AND name IN (\${tempVar}) GROUP BY engine ORDER BY count() DESC`,
      expect: `SELECT engine , count() as "Number of tables" FROM system.tables WHERE notLike(engine,'System%') GROUP BY engine ORDER BY count() DESC`,
    },
    {
      name: ' complex query test',
      input: `SELECT concatAssumeInjective(table.database, '.', name) as name,
              col_stats.col_count as total_columns
              FROM system.tables table
                LEFT JOIN (SELECT database, table, count() as col_count FROM system.columns  GROUP BY table, database) as col_stats
                  ON table.name = col_stats.table AND col_stats.database = table.database
              WHERE database IN (\${database}) AND table IN (\${table}) AND var<$tempVar ORDER BY total_columns DESC LIMIT 10;`,
      expect:
        `SELECT concatAssumeInjective(table.database, '.', name) as name , ` +
        `col_stats.col_count as total_columns ` +
        `FROM system.tables table ` +
        `LEFT JOIN ( SELECT database , table , count() as col_count FROM system.columns GROUP BY table , database) as col_stats ` +
        `ON table.name = col_stats.table AND col_stats.database = table.database ` +
        `WHERE database IN (\${database}) AND table IN (\${table}) ORDER BY total_columns DESC LIMIT 10`,
    },
  ];
  const testCasesWithoutAllTempVar = [
    {
      name: 'does not removes template variable not selecting ALL',
      input: 'SELECT * FROM table WHERE col in ($tempVar)',
      expect: 'SELECT * FROM table WHERE col in ($tempVar)',
    },
  ];
  const tempVarsWithAll = [{ type: 'query', name: 'tempVar', label: '', current: { value: '$__all' } }];
  for (let t of testCasesWithAllTempVar) {
    testCondition(t.name, t.input, t.expect, tempVarsWithAll);
  }

  const tempVarsWithoutAll = [{ type: 'query', name: 'tempVar', label: '', current: { value: 'val' } }];
  for (let t of testCasesWithoutAllTempVar) {
    testCondition(t.name, t.input, t.expect, tempVarsWithoutAll);
  }
});

function testCondition(name: string, input: string, expected: string, tempVars: any) {
  it(name, () => {
    const val = removeConditionalAlls(input, tempVars as VariableModel[]);
    expect(val).toEqual(expected);
  });
}
