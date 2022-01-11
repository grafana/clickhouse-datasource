import { AdHocVariableFilter, applyAdHocFilter } from "./adHocFilter";

describe('AdHocManager', () => {
  it('apply ad hoc filter when there is a where clause', () => {
    let val = applyAdHocFilter('SELECT stuff FROM table WHERE col = test;', [{key: 'key', operator: '=', value: 'val'}, {key: 'keyNum', operator: '=', value: '123'}] as AdHocVariableFilter[])
    expect(val).toEqual(`SELECT stuff FROM table WHERE key = 'val' AND keyNum = 123 AND col = test;`);
  });
  it('does not apply ad hoc filter when there is no where clause', () => {
    let val = applyAdHocFilter('select stuff from table;', [{key: 'key', operator: '=', value: 'val'}] as AdHocVariableFilter[])
    expect(val).toEqual('select stuff from table;');
  });
});