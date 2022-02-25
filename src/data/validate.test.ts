import { ParseError, validate } from './validate';

let mockParser: any;

jest.mock('js-sql-parser', () => {
  const mock = {
    parse: jest.fn(),
  };
  mockParser = mock;
  return mock;
});

describe('Validate', () => {
  it('should be valid', () => {
    const sql = 'select foo from bar';
    const v = validate(sql);
    expect(v.valid).toBe(true);
  });

  it('should not be valid', () => {
    const validationError: ParseError = {
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
    spyOn(mockParser, 'parse').and.callFake(() => {
      throw validationError;
    });

    const sql = 'invalid sql';
    const v = validate(sql);
    expect(v.valid).toBe(false);
    expect(v.error?.expected).toBe('expected');
  });
});
