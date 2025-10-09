import { Token, TokenType } from './types';
import {
  isWhitespaceASCII,
  isNumericASCII,
  isWordCharASCII,
  isHexDigit,
  isNumberSeparator,
  findFirstNotSymbols,
  skipWhitespacesUTF8,
  isContinuationOctet,
} from './helpers';

/**
 * Lexer class for tokenizing input text
 */
export class Lexer {
  private readonly text: string;
  private pos: number;
  private readonly end: number;
  private readonly maxQuerySize: number;
  private prevSignificantTokenType: TokenType = TokenType.Whitespace;

  /**
   * Create a new lexer for the given input
   * @param text The input text to tokenize
   * @param maxQuerySize Optional maximum query size (0 for unlimited)
   */
  public constructor(text: string, maxQuerySize = 0) {
    this.text = text;
    this.pos = 0;
    this.end = text.length;
    this.maxQuerySize = maxQuerySize;
  }

  /**
   * Get the next token from the input
   */
  public nextToken(): Token {
    const res = this.nextTokenImpl();
    if (this.maxQuerySize && res.end > this.maxQuerySize) {
      return new Token(
        TokenType.ErrorMaxQuerySizeExceeded,
        res.begin,
        res.end,
        this.text.substring(res.begin, res.end)
      );
    }
    if (res.isSignificant()) {
      this.prevSignificantTokenType = res.type;
    }
    return res;
  }

  /**
   * Parse a quoted string
   */
  private parseQuotedString(quote: string, successToken: TokenType, errorToken: TokenType): Token {
    const tokenBegin = this.pos;

    // Skip opening quote
    this.pos++;

    while (this.pos < this.end) {
      const nextQuotePos = this.text.indexOf(quote, this.pos);
      const nextEscapePos = this.text.indexOf('\\', this.pos);

      if (nextQuotePos === -1) {
        // No closing quote found
        this.pos = this.end;
        return new Token(errorToken, tokenBegin, this.pos, this.text.substring(tokenBegin, this.pos));
      }

      if (nextEscapePos !== -1 && nextEscapePos < nextQuotePos) {
        // Found escape character before quote
        this.pos = nextEscapePos + 2; // Skip escape and the escaped character
        continue;
      }

      // Found quote
      this.pos = nextQuotePos + 1;

      // Check for doubled quote which represents a single quote character
      if (this.pos < this.end && this.text[this.pos] === quote) {
        // Skip the second quote and continue searching
        this.pos++;
        continue;
      }

      // Found end of quoted string
      return new Token(successToken, tokenBegin, this.pos, this.text.substring(tokenBegin, this.pos));
    }

    // Reached end of input without closing quote
    return new Token(errorToken, tokenBegin, this.pos, this.text.substring(tokenBegin, this.pos));
  }

  /**
   * Parse a quoted hex or binary string (x'AB' or b'101')
   */
  private parseQuotedHexOrBinString(): Token {
    const tokenBegin = this.pos;
    const isHex = this.text[this.pos].toLowerCase() === 'x';

    // Skip 'x' and opening quote
    this.pos += 2;

    if (isHex) {
      // Find the first non-hex digit
      while (this.pos < this.end && isHexDigit(this.text[this.pos])) {
        this.pos++;
      }
    } else {
      // Find the first non-binary digit
      this.pos = findFirstNotSymbols(this.text, this.pos, this.end, '0', '1');
    }

    if (this.pos >= this.end || this.text[this.pos] !== "'") {
      this.pos = this.end;
      return new Token(
        TokenType.ErrorSingleQuoteIsNotClosed,
        tokenBegin,
        this.pos,
        this.text.substring(tokenBegin, this.pos)
      );
    }

    this.pos++; // Skip closing quote
    return new Token(TokenType.StringLiteral, tokenBegin, this.pos, this.text.substring(tokenBegin, this.pos));
  }

  /**
   * Handle comment until end of line
   */
  private commentUntilEndOfLine(): Token {
    const tokenBegin = this.pos;
    const newlinePos = this.text.indexOf('\n', this.pos);

    if (newlinePos === -1) {
      this.pos = this.end;
    } else {
      this.pos = newlinePos;
    }

    return new Token(TokenType.Comment, tokenBegin, this.pos, this.text.substring(tokenBegin, this.pos));
  }

  /**
   * Parse a unicode quoted string
   */
  private parseUnicodeQuotedString(expectedEndByte: number, successToken: TokenType, errorToken: TokenType): Token {
    const tokenBegin = this.pos - 3; // Account for the starting quote sequence

    while (this.pos + 2 < this.end) {
      const e2Pos = this.text.indexOf('\u00E2', this.pos);
      if (e2Pos === -1 || e2Pos + 2 >= this.end) {
        this.pos = this.end;
        return new Token(errorToken, tokenBegin, this.pos, this.text.substring(tokenBegin, this.pos));
      }

      this.pos = e2Pos;

      if (
        this.text.charCodeAt(this.pos) === 0xe2 &&
        this.text.charCodeAt(this.pos + 1) === 0x80 &&
        this.text.charCodeAt(this.pos + 2) === expectedEndByte
      ) {
        this.pos += 3; // Skip the closing quote
        return new Token(successToken, tokenBegin, this.pos, this.text.substring(tokenBegin, this.pos));
      }

      this.pos++;
    }

    this.pos = this.end;
    return new Token(errorToken, tokenBegin, this.pos, this.text.substring(tokenBegin, this.pos));
  }

  /**
   * Implementation of nextToken that actually does the tokenization
   */
  private nextTokenImpl(): Token {
    if (this.pos >= this.end) {
      return new Token(TokenType.EndOfStream, this.end, this.end, '');
    }

    const tokenBegin = this.pos;
    const currentChar = this.text[this.pos];

    // Handle whitespace
    if (isWhitespaceASCII(currentChar)) {
      this.pos++;
      while (this.pos < this.end && isWhitespaceASCII(this.text[this.pos])) {
        this.pos++;
      }
      return new Token(TokenType.Whitespace, tokenBegin, this.pos, this.text.substring(tokenBegin, this.pos));
    }

    // Handle numbers
    if (isNumericASCII(currentChar)) {
      // For chained tuple access operators (x.1.1)
      if (this.prevSignificantTokenType === TokenType.Dot) {
        this.pos++;
        while (
          this.pos < this.end &&
          (isNumericASCII(this.text[this.pos]) || isNumberSeparator(false, false, this.pos, this.text))
        ) {
          this.pos++;
        }
      } else {
        let startOfBlock = false;
        let hex = false;

        // Check for hex (0x) or binary (0b) notation
        if (
          this.pos + 2 < this.end &&
          currentChar === '0' &&
          (this.text[this.pos + 1].toLowerCase() === 'x' || this.text[this.pos + 1].toLowerCase() === 'b')
        ) {
          let isValid = false;
          if (this.text[this.pos + 1].toLowerCase() === 'x') {
            if (this.pos + 2 < this.end && isHexDigit(this.text[this.pos + 2])) {
              hex = true;
              isValid = true; // hex
            }
          } else if (this.text[this.pos + 2] === '0' || this.text[this.pos + 2] === '1') {
            isValid = true; // binary
          }

          if (isValid) {
            this.pos += 2;
            startOfBlock = true;
          } else {
            this.pos++; // consume the leading zero
          }
        } else {
          this.pos++;
        }

        // Parse integer part
        while (
          this.pos < this.end &&
          ((hex ? isHexDigit(this.text[this.pos]) : isNumericASCII(this.text[this.pos])) ||
            isNumberSeparator(startOfBlock, hex, this.pos, this.text))
        ) {
          this.pos++;
          startOfBlock = false;
        }

        // Check for decimal point
        if (this.pos < this.end && this.text[this.pos] === '.') {
          startOfBlock = true;
          this.pos++;

          // Parse fractional part
          while (
            this.pos < this.end &&
            ((hex ? isHexDigit(this.text[this.pos]) : isNumericASCII(this.text[this.pos])) ||
              isNumberSeparator(startOfBlock, hex, this.pos, this.text))
          ) {
            this.pos++;
            startOfBlock = false;
          }
        }

        // Check for exponent
        if (
          this.pos + 1 < this.end &&
          (hex
            ? this.text[this.pos] === 'p' || this.text[this.pos] === 'P'
            : this.text[this.pos] === 'e' || this.text[this.pos] === 'E')
        ) {
          startOfBlock = true;
          this.pos++;

          // Check for sign of exponent
          if (this.pos + 1 < this.end && (this.text[this.pos] === '-' || this.text[this.pos] === '+')) {
            this.pos++;
          }

          // Parse exponent
          while (
            this.pos < this.end &&
            (isNumericASCII(this.text[this.pos]) || isNumberSeparator(startOfBlock, false, this.pos, this.text))
          ) {
            this.pos++;
            startOfBlock = false;
          }
        }
      }

      // Check if this is actually a numeric identifier (1identifier)
      if (this.pos < this.end && isWordCharASCII(this.text[this.pos])) {
        this.pos++;
        while (this.pos < this.end && isWordCharASCII(this.text[this.pos])) {
          this.pos++;
        }

        // Check if it's a valid identifier or an error
        for (let i = tokenBegin; i < this.pos; i++) {
          if (!isWordCharASCII(this.text[i]) && this.text[i] !== '$') {
            return new Token(
              TokenType.ErrorWrongNumber,
              tokenBegin,
              this.pos,
              this.text.substring(tokenBegin, this.pos)
            );
          }
        }

        return new Token(TokenType.BareWord, tokenBegin, this.pos, this.text.substring(tokenBegin, this.pos));
      }

      return new Token(TokenType.Number, tokenBegin, this.pos, this.text.substring(tokenBegin, this.pos));
    }

    // Handle quoted strings
    switch (currentChar) {
      case "'":
        return this.parseQuotedString("'", TokenType.StringLiteral, TokenType.ErrorSingleQuoteIsNotClosed);
      case '"':
        return this.parseQuotedString('"', TokenType.QuotedIdentifier, TokenType.ErrorDoubleQuoteIsNotClosed);
      case '`':
        return this.parseQuotedString('`', TokenType.QuotedIdentifier, TokenType.ErrorBackQuoteIsNotClosed);

      // Handle brackets
      case '(':
        return new Token(TokenType.OpeningRoundBracket, tokenBegin, ++this.pos, '(');
      case ')':
        return new Token(TokenType.ClosingRoundBracket, tokenBegin, ++this.pos, ')');
      case '[':
        return new Token(TokenType.OpeningSquareBracket, tokenBegin, ++this.pos, '[');
      case ']':
        return new Token(TokenType.ClosingSquareBracket, tokenBegin, ++this.pos, ']');
      case '{':
        return new Token(TokenType.OpeningCurlyBrace, tokenBegin, ++this.pos, '{');
      case '}':
        return new Token(TokenType.ClosingCurlyBrace, tokenBegin, ++this.pos, '}');

      // Handle simple punctuation
      case ',':
        return new Token(TokenType.Comma, tokenBegin, ++this.pos, ',');
      case ';':
        return new Token(TokenType.Semicolon, tokenBegin, ++this.pos, ';');

      // Handle dot (qualifier, tuple access operator or start of floating point number)
      case '.': {
        // Check if dot follows an identifier, complex expression or number
        if (
          this.pos > 0 &&
          (!(this.pos + 1 < this.end && isNumericASCII(this.text[this.pos + 1])) ||
            this.prevSignificantTokenType === TokenType.ClosingRoundBracket ||
            this.prevSignificantTokenType === TokenType.ClosingSquareBracket ||
            this.prevSignificantTokenType === TokenType.BareWord ||
            this.prevSignificantTokenType === TokenType.QuotedIdentifier ||
            this.prevSignificantTokenType === TokenType.Number)
        ) {
          return new Token(TokenType.Dot, tokenBegin, ++this.pos, '.');
        }

        // Otherwise it's a number with fractional part but no integer part
        let startOfBlock = true;
        this.pos++;

        while (
          this.pos < this.end &&
          (isNumericASCII(this.text[this.pos]) || isNumberSeparator(startOfBlock, false, this.pos, this.text))
        ) {
          this.pos++;
          startOfBlock = false;
        }

        // Check for exponent
        if (this.pos + 1 < this.end && (this.text[this.pos] === 'e' || this.text[this.pos] === 'E')) {
          startOfBlock = true;
          this.pos++;

          // Check for sign of exponent
          if (this.pos + 1 < this.end && (this.text[this.pos] === '-' || this.text[this.pos] === '+')) {
            this.pos++;
          }

          // Parse exponent
          while (
            this.pos < this.end &&
            (isNumericASCII(this.text[this.pos]) || isNumberSeparator(startOfBlock, false, this.pos, this.text))
          ) {
            this.pos++;
            startOfBlock = false;
          }
        }

        return new Token(TokenType.Number, tokenBegin, this.pos, this.text.substring(tokenBegin, this.pos));
      }

      // Handle operators
      case '+':
        return new Token(TokenType.Plus, tokenBegin, ++this.pos, '+');

      case '-': {
        this.pos++;

        // Check for arrow operator
        if (this.pos < this.end && this.text[this.pos] === '>') {
          return new Token(TokenType.Arrow, tokenBegin, ++this.pos, '->');
        }

        // Check for comment
        if (this.pos < this.end && this.text[this.pos] === '-') {
          this.pos++;
          return this.commentUntilEndOfLine();
        }

        return new Token(TokenType.Minus, tokenBegin, this.pos, '-');
      }

      case '*':
        return new Token(TokenType.Asterisk, tokenBegin, ++this.pos, '*');

      case '/': {
        this.pos++;

        // Check for comment
        if (this.pos < this.end) {
          if (this.text[this.pos] === '/') {
            this.pos++;
            return this.commentUntilEndOfLine();
          }

          if (this.text[this.pos] === '*') {
            this.pos++;
            let nestingLevel = 1;

            while (this.pos + 1 < this.end) {
              if (this.text[this.pos] === '/' && this.text[this.pos + 1] === '*') {
                this.pos += 2;
                nestingLevel++;
              } else if (this.text[this.pos] === '*' && this.text[this.pos + 1] === '/') {
                this.pos += 2;
                nestingLevel--;

                if (nestingLevel === 0) {
                  return new Token(TokenType.Comment, tokenBegin, this.pos, this.text.substring(tokenBegin, this.pos));
                }
              } else {
                this.pos++;
              }
            }

            this.pos = this.end;
            return new Token(
              TokenType.ErrorMultilineCommentIsNotClosed,
              tokenBegin,
              this.pos,
              this.text.substring(tokenBegin, this.pos)
            );
          }
        }

        return new Token(TokenType.Slash, tokenBegin, this.pos, '/');
      }

      case '#': {
        this.pos++;

        // Comments only if followed by space or '!'
        if (this.pos < this.end && (this.text[this.pos] === ' ' || this.text[this.pos] === '!')) {
          return this.commentUntilEndOfLine();
        }

        return new Token(TokenType.Error, tokenBegin, this.pos, this.text.substring(tokenBegin, this.pos));
      }

      case '%':
        return new Token(TokenType.Percent, tokenBegin, ++this.pos, '%');

      case '=': {
        this.pos++;

        // Check for == operator
        if (this.pos < this.end && this.text[this.pos] === '=') {
          this.pos++;
        }

        return new Token(TokenType.Equals, tokenBegin, this.pos, this.text.substring(tokenBegin, this.pos));
      }

      case '!': {
        this.pos++;

        // Only valid as != operator
        if (this.pos < this.end && this.text[this.pos] === '=') {
          return new Token(TokenType.NotEquals, tokenBegin, ++this.pos, '!=');
        }

        return new Token(TokenType.ErrorSingleExclamationMark, tokenBegin, this.pos, '!');
      }

      case '<': {
        this.pos++;

        // Check for <=>, <=, <>
        if (this.pos + 1 < this.end && this.text[this.pos] === '=' && this.text[this.pos + 1] === '>') {
          this.pos += 2;
          return new Token(TokenType.Spaceship, tokenBegin, this.pos, '<=>');
        }

        if (this.pos < this.end && this.text[this.pos] === '=') {
          return new Token(TokenType.LessOrEquals, tokenBegin, ++this.pos, '<=');
        }

        if (this.pos < this.end && this.text[this.pos] === '>') {
          return new Token(TokenType.NotEquals, tokenBegin, ++this.pos, '<>');
        }

        return new Token(TokenType.Less, tokenBegin, this.pos, '<');
      }

      case '>': {
        this.pos++;

        // Check for >= operator
        if (this.pos < this.end && this.text[this.pos] === '=') {
          return new Token(TokenType.GreaterOrEquals, tokenBegin, ++this.pos, '>=');
        }

        return new Token(TokenType.Greater, tokenBegin, this.pos, '>');
      }

      case '?':
        return new Token(TokenType.QuestionMark, tokenBegin, ++this.pos, '?');

      case '^':
        return new Token(TokenType.Caret, tokenBegin, ++this.pos, '^');

      case ':': {
        this.pos++;

        // Check for :: operator
        if (this.pos < this.end && this.text[this.pos] === ':') {
          return new Token(TokenType.DoubleColon, tokenBegin, ++this.pos, '::');
        }

        return new Token(TokenType.Colon, tokenBegin, this.pos, ':');
      }

      case '|': {
        this.pos++;

        // Check for || operator (concatenation)
        if (this.pos < this.end && this.text[this.pos] === '|') {
          return new Token(TokenType.Concatenation, tokenBegin, ++this.pos, '||');
        }

        return new Token(TokenType.PipeMark, tokenBegin, this.pos, '|');
      }

      case '@': {
        this.pos++;

        // Check for @@ operator
        if (this.pos < this.end && this.text[this.pos] === '@') {
          return new Token(TokenType.DoubleAt, tokenBegin, ++this.pos, '@@');
        }

        return new Token(TokenType.At, tokenBegin, this.pos, '@');
      }

      case '\\': {
        this.pos++;

        // Check for \G vertical delimiter
        if (this.pos < this.end && this.text[this.pos] === 'G') {
          return new Token(TokenType.VerticalDelimiter, tokenBegin, ++this.pos, '\\G');
        }

        return new Token(TokenType.Error, tokenBegin, this.pos, '\\');
      }

      // Handle Unicode special cases
      case '\u00E2': {
        // Mathematical minus symbol in UTF-8
        if (
          this.pos + 2 < this.end &&
          this.text.charCodeAt(this.pos + 1) === 0x88 &&
          this.text.charCodeAt(this.pos + 2) === 0x92
        ) {
          this.pos += 3;
          return new Token(TokenType.Minus, tokenBegin, this.pos, this.text.substring(tokenBegin, this.pos));
        }

        // Unicode quoted string
        if (
          this.pos + 2 < this.end &&
          this.text.charCodeAt(this.pos) === 0xe2 &&
          this.text.charCodeAt(this.pos + 1) === 0x80 &&
          (this.text.charCodeAt(this.pos + 2) === 0x98 || this.text.charCodeAt(this.pos + 2) === 0x9c)
        ) {
          const expectedEndByte = this.text.charCodeAt(this.pos + 2) + 1;
          const successToken =
            this.text.charCodeAt(this.pos + 2) === 0x98 ? TokenType.StringLiteral : TokenType.QuotedIdentifier;
          const errorToken =
            this.text.charCodeAt(this.pos + 2) === 0x98
              ? TokenType.ErrorSingleQuoteIsNotClosed
              : TokenType.ErrorDoubleQuoteIsNotClosed;

          this.pos += 3;
          return this.parseUnicodeQuotedString(expectedEndByte, successToken, errorToken);
        }
      }
    }

    // Handle special cases

    // Dollar sign and here-document
    if (currentChar === '$') {
      // Try to parse here-doc
      const tokenStream = this.text.substring(this.pos);
      const heredocNameEndPosition = tokenStream.indexOf('$', 1);

      if (heredocNameEndPosition !== -1) {
        const heredocSize = heredocNameEndPosition + 1;
        const heredoc = tokenStream.substring(0, heredocSize);

        const heredocEndPosition = tokenStream.indexOf(heredoc, heredocSize);
        if (heredocEndPosition !== -1) {
          this.pos += heredocEndPosition + heredocSize;
          return new Token(TokenType.HereDoc, tokenBegin, this.pos, this.text.substring(tokenBegin, this.pos));
        }
      }

      // Standalone dollar sign
      if ((this.pos + 1 < this.end && !isWordCharASCII(this.text[this.pos + 1])) || this.pos + 1 === this.end) {
        return new Token(TokenType.DollarSign, tokenBegin, ++this.pos, '$');
      }
    }

    // Hex or binary string literals
    if (
      this.pos + 2 < this.end &&
      this.text[this.pos + 1] === "'" &&
      (currentChar.toLowerCase() === 'x' || currentChar.toLowerCase() === 'b')
    ) {
      return this.parseQuotedHexOrBinString();
    }

    // Bare words (identifiers or keywords)
    if (isWordCharASCII(currentChar) || currentChar === '$') {
      this.pos++;
      while (this.pos < this.end && (isWordCharASCII(this.text[this.pos]) || this.text[this.pos] === '$')) {
        this.pos++;
      }
      return new Token(TokenType.BareWord, tokenBegin, this.pos, this.text.substring(tokenBegin, this.pos));
    }

    // Try to skip Unicode whitespace
    const newPos = skipWhitespacesUTF8(this.text, this.pos, this.end);
    if (newPos > this.pos) {
      this.pos = newPos;
      return new Token(TokenType.Whitespace, tokenBegin, this.pos, this.text.substring(tokenBegin, this.pos));
    }

    // Skip over any UTF-8 continuation bytes
    this.pos++;
    while (this.pos < this.end && isContinuationOctet(this.text[this.pos])) {
      this.pos++;
    }

    return new Token(TokenType.Error, tokenBegin, this.pos, this.text.substring(tokenBegin, this.pos));
  }
}
