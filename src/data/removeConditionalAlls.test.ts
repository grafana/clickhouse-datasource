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
