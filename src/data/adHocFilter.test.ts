import { AdHocFilter, AdHocVariableFilter } from './adHocFilter';

describe('AdHocManager', () => {
  it('apply ad hoc filter with no inner query and existing WHERE', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTable('SELECT * FROM table');
    const val = ahm.apply('SELECT stuff FROM table WHERE col = test', [
      { key: 'key', operator: '=', value: 'val' },
      { key: 'keyNum', operator: '=', value: '123' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(`SELECT stuff FROM table WHERE key = 'val' AND keyNum = 123 AND col = test`);
  });
  it('apply ad hoc filter with no inner query and no existing WHERE', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTable('SELECT * FROM table');
    const val = ahm.apply('SELECT stuff FROM table', [
      { key: 'key', operator: '=', value: 'val' },
      { key: 'keyNum', operator: '=', value: '123' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(`SELECT stuff FROM table WHERE key = 'val' AND keyNum = 123`);
  });
  it('apply ad hoc filter with an inner query without existing WHERE', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTable('SELECT * FROM table');
    const val = ahm.apply(`SELECT stuff FROM (SELECT * FROM table) as r GROUP BY s ORDER BY s`, [
      { key: 'key', operator: '=', value: 'val' },
      { key: 'keyNum', operator: '=', value: '123' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(
      `SELECT stuff FROM ( SELECT * FROM table WHERE key = 'val' AND keyNum = 123 ) as r GROUP BY s ORDER BY s`
    );
  });
  it('apply ad hoc filter with an inner from query with existing WHERE', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTable('SELECT * FROM table');
    const val = ahm.apply(`SELECT stuff FROM (SELECT * FROM table WHERE col = test) as r GROUP BY s ORDER BY s`, [
      { key: 'key', operator: '=', value: 'val' },
      { key: 'keyNum', operator: '=', value: '123' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(
      `SELECT stuff FROM ( SELECT * FROM table WHERE key = 'val' AND keyNum = 123 AND col = test) as r GROUP BY s ORDER BY s`
    );
  });
  it('apply ad hoc filter with an inner where query with existing WHERE', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTable('SELECT * FROM table');
    const val = ahm.apply(`SELECT * FROM table WHERE (name = stuff) AND (name IN ( SELECT * FROM table WHERE (field = 'hello') GROUP BY name ORDER BY count() DESC LIMIT 10 )) GROUP BY name, time ORDER BY time`, [
      { key: 'key', operator: '=', value: 'val' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual(
      `SELECT * FROM table WHERE key = 'val' AND (name = stuff) AND (name IN ( SELECT * FROM table WHERE key = 'val' AND (field = 'hello') GROUP BY name ORDER BY count() DESC LIMIT 10 )) GROUP BY name, time ORDER BY time`
    );
  });
  it('does not apply ad hoc filter when the target table is not in the query', () => {
    const ahm = new AdHocFilter();
    ahm.setTargetTable('SELECT * FROM table2');
    const val = ahm.apply('select stuff from table', [
      { key: 'key', operator: '=', value: 'val' },
    ] as AdHocVariableFilter[]);
    expect(val).toEqual('SELECT stuff FROM table');
  });
});
