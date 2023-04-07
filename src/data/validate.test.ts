import { validate } from './validate';

jest.mock('js-sql-parser', () => {
  return {
    parse: jest.fn(),
  };
});

describe('Validate', () => {
  it('should be valid', () => {
    const sql = 'select foo from bar';
    const v = validate(sql);
    expect(v.valid).toBe(true);
  });

  it('should not be valid', async () => {
    (await import('js-sql-parser')).parse.mockImplementationOnce(() => {
      throw {
        message: 'foo\nbar\njunk\nexpected',
        hash: {
          text: 'foo',
          loc: {
            first_line: 1,
            last_line: 1,
            first_column: 1,
            last_column: 3,
          },
        },
      };
    });

    const sql = 'invalid sql';
    const v = validate(sql);
    expect(v.valid).toBe(false);
    expect(v.error?.expected).toBe('expected');
  });
});
