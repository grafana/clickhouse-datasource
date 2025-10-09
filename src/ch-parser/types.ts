/**
 * Enum for all token types supported by the lexer
 */
export enum TokenType {
  Whitespace,
  Comment,

  BareWord, // Either keyword (SELECT) or identifier (column)

  Number, // Always non-negative. No leading plus. 123 or something like 123.456e12, 0x123p12
  StringLiteral, // 'hello word', 'hello''word', 'hello\'word\\'

  QuotedIdentifier, // "x", `x`

  OpeningRoundBracket,
  ClosingRoundBracket,

  OpeningSquareBracket,
  ClosingSquareBracket,

  OpeningCurlyBrace,
  ClosingCurlyBrace,

  Comma,
  Semicolon,
  VerticalDelimiter, // Vertical delimiter \G
  Dot, // Compound identifiers, like a.b or tuple access operator a.1, (x, y).2.
  // Need to be distinguished from floating point number with omitted integer part: .1

  Asterisk, // Could be used as multiplication operator or on it's own: "SELECT *"

  HereDoc,

  DollarSign,
  Plus,
  Minus,
  Slash,
  Percent,
  Arrow, // ->. Should be distinguished from minus operator.
  QuestionMark,
  Colon,
  Caret,
  DoubleColon,
  Equals,
  NotEquals,
  Less,
  Greater,
  LessOrEquals,
  GreaterOrEquals,
  Spaceship, // <=>. Used in MySQL for NULL-safe equality comparison.
  PipeMark,
  Concatenation, // String concatenation operator: ||

  At, // @. Used for specifying user names and also for MySQL-style variables.
  DoubleAt, // @@. Used for MySQL-style global variables.

  // Order is important. EndOfStream goes after all usual tokens, and special error tokens goes after EndOfStream.

  EndOfStream,

  // Something unrecognized.
  Error,
  // Something is wrong and we have more information.
  ErrorMultilineCommentIsNotClosed,
  ErrorSingleQuoteIsNotClosed,
  ErrorDoubleQuoteIsNotClosed,
  ErrorBackQuoteIsNotClosed,
  ErrorSingleExclamationMark,
  ErrorSinglePipeMark,
  ErrorWrongNumber,
  ErrorMaxQuerySizeExceeded,
}

export const keywords = new Set([
  'SELECT',
  'FROM',
  'WHERE',
  'GROUP',
  'BY',
  'HAVING',
  'ORDER',
  'LIMIT',
  'OFFSET',
  'JOIN',
  'INNER',
  'OUTER',
  'LEFT',
  'RIGHT',
  'FULL',
  'CROSS',
  'ON',
  'USING',
  'AS',
  'WITH',
  'UNION',
  'ALL',
  'DISTINCT',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'AND',
  'OR',
  'NOT',
  'IN',
  'EXISTS',
  'BETWEEN',
  'LIKE',
  'IS',
  'NULL',
  'ASC',
  'DESC',
]);

/**
 * A token representing a lexical unit in the input
 */
export class Token {
  type: TokenType;
  begin: number;
  end: number;
  text: string;

  constructor(type: TokenType, begin: number, end: number, text: string) {
    this.type = type;
    this.begin = begin;
    this.end = end;
    this.text = text;
  }

  size(): number {
    return this.end - this.begin;
  }

  isSignificant(): boolean {
    return this.type !== TokenType.Whitespace && this.type !== TokenType.Comment;
  }

  matchKeyword(keyword: string): boolean {
    return (
      this.type === TokenType.BareWord &&
      keywords.has(keyword.toUpperCase()) &&
      this.text.toUpperCase() === keyword.toUpperCase()
    );
  }

  isKeyword(): boolean {
    return this.type === TokenType.BareWord && keywords.has(this.text.toUpperCase());
  }

  isError(): boolean {
    return this.type > TokenType.EndOfStream;
  }

  isEnd(): boolean {
    return this.type === TokenType.EndOfStream;
  }
}

/**
 * Get the name of a token type (for debugging)
 */
export function getTokenName(type: TokenType): string {
  return TokenType[type];
}

/**
 * Get the description of an error token
 */
export function getErrorTokenDescription(type: TokenType): string {
  switch (type) {
    case TokenType.Error:
      return 'Unrecognized token';
    case TokenType.ErrorMultilineCommentIsNotClosed:
      return 'Multiline comment is not closed';
    case TokenType.ErrorSingleQuoteIsNotClosed:
      return 'Single quoted string is not closed';
    case TokenType.ErrorDoubleQuoteIsNotClosed:
      return 'Double quoted string is not closed';
    case TokenType.ErrorBackQuoteIsNotClosed:
      return 'Back quoted string is not closed';
    case TokenType.ErrorSingleExclamationMark:
      return 'Exclamation mark can only occur in != operator';
    case TokenType.ErrorSinglePipeMark:
      return 'Pipe symbol could only occur in || operator';
    case TokenType.ErrorWrongNumber:
      return 'Wrong number';
    case TokenType.ErrorMaxQuerySizeExceeded:
      return 'Max query size exceeded (can be increased with the `max_query_size` setting)';
    default:
      return 'Not an error';
  }
}
