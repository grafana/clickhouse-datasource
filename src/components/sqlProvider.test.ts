import { formatSql } from './sqlProvider';

describe('SQL Formatter', () => {
  it('formats SQL', () => {
    const input = 'SELECT 1, 2, 3 FROM test LIMIT 1';
    const expected = 'SELECT\n 1,\n 2,\n 3\nFROM\n test\nLIMIT\n 1';

    const actual = formatSql(input, 1);
    expect(actual).toBe(expected);
  });
});
