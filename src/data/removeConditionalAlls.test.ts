import { VariableModel } from "@grafana/data";
import { RemoveConditionalAlls } from "./removeConditionalAlls";

describe('RemoveConditionalAlls', () => {
  const testCases(name: string, input: string, expected: string) =[
    {
      name: 'removes template variable selecting ALL with one WHERE condition',
      input: 'SELECT * FROM table WHERE col in ($tempVar)',
      expect: 'SELECT * FROM table',
    },
    {
      name: ,
      input: ,
      expect: ,
    },
    {
      name: ,
      input: ,
      expect: ,
    },
    {
      name: ,
      input: ,
      expect: ,
    },
  ];
  it('removes template variable selecting ALL with one WHERE condition', () => {
    const tempVars = [{ type: 'query', name: 'tempVar', label: '', current: { value: '$__all' } },];
    const val = RemoveConditionalAlls('SELECT * FROM table WHERE col in ($tempVar)', tempVars as VariableModel[]);
    expect(val).toEqual('SELECT * FROM table');
  });
  it('removes template variable selecting ALL with surrounding WHERE conditions', () => {
    const tempVars = [{ type: 'query', name: 'tempVar', label: '', current: { value: '$__all' } },];
    const val = RemoveConditionalAlls(`SELECT * FROM table WHERE date >= today AND col in ($tempVar) AND name = 'smith'`, tempVars as VariableModel[]);
    expect(val).toEqual(`SELECT * FROM table WHERE date >= today AND name = 'smith'`);
  });
  it('removes template variable selecting ALL with a WHERE condition after', () => {
    const tempVars = [{ type: 'query', name: 'tempVar', label: '', current: { value: '$__all' } },];
    const val = RemoveConditionalAlls(`SELECT * FROM table WHERE col in ($tempVar) AND name = 'smith'`, tempVars as VariableModel[]);
    expect(val).toEqual(`SELECT * FROM table WHERE name = 'smith'`);
  });
  it('removes template variable selecting ALL with a WHERE conditions before', () => {
    const tempVars = [{ type: 'query', name: 'tempVar', label: '', current: { value: '$__all' } },];
    const val = RemoveConditionalAlls(`SELECT * FROM table WHERE date >= today AND col in ($tempVar)`, tempVars as VariableModel[]);
    expect(val).toEqual(`SELECT * FROM table WHERE date >= today`);
  });
  it('removes template variable selecting ALL with a WHERE conditions in an inline query in FROM', () => {
    const tempVars = [{ type: 'query', name: 'tempVar', label: '', current: { value: '$__all' } },];
    const val = RemoveConditionalAlls(`SELECT * FROM ( SELECT * FROM table WHERE col in ($tempVar) )`, tempVars as VariableModel[]);
    expect(val).toEqual(`SELECT * FROM ( SELECT * FROM table )`);
  });
  it('removes template variable selecting ALL with a WHERE conditions in an inline query in WHERE', () => {
    const tempVars = [{ type: 'query', name: 'tempVar', label: '', current: { value: '$__all' } },];
    const val = RemoveConditionalAlls(`SELECT * FROM table WHERE col in ( SELECT * FROM table WHERE col in ($tempVar) )`, tempVars as VariableModel[]);
    expect(val).toEqual(`SELECT * FROM table WHERE col in ( SELECT * FROM table )`);
  });
  it('removes template variable selecting ALL with a WHERE conditions in an inline query in WHERE with ending stuff', () => {
    const tempVars = [{ type: 'query', name: 'tempVar', label: '', current: { value: '$__all' } },];
    const val = RemoveConditionalAlls(`SELECT * FROM table WHERE col in (( SELECT * FROM table WHERE col in ($tempVar) )) by hello`, tempVars as VariableModel[]);
    expect(val).toEqual(`SELECT * FROM table WHERE col in (( SELECT * FROM table )) by hello`);
  });
  it('does not removes template variable selecting ALL when not in where condition', () => {
    const tempVars = [{ type: 'query', name: 'tempVar', label: '', current: { value: '$__all' } },];
    const val = RemoveConditionalAlls(`SELECT * FROM $tempVar`, tempVars as VariableModel[]);
    expect(val).toEqual(`SELECT * FROM $tempVar`);
  });
  it('does not removes template variable not selecting ALL', () => {
    const tempVars = [{ type: 'query', name: 'tempVar', label: '', current: { value: 'val' } },];
    const val = RemoveConditionalAlls('SELECT * FROM table WHERE col in ($tempVar)', tempVars as VariableModel[]);
    expect(val).toEqual('SELECT * FROM table WHERE col in ($tempVar)');
  });
});

function testCondition(name: string, input: string, expected: string) {
  it(name, () => {
    const tempVars = [{ type: 'query', name: 'tempVar', label: '', current: { value: '$__all' } },];
    const val = RemoveConditionalAlls(input, tempVars as VariableModel[]);
    expect(val).toEqual(expected);
  });
}