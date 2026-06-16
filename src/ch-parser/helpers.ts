/**
 * Helper functions for character classification and string handling
 */

/**
 * Check if a character is a whitespace ASCII character
 */
export function isWhitespaceASCII(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
}

/**
 * Check if a character is a numeric ASCII character
 */
export function isNumericASCII(c: string): boolean {
  return c >= '0' && c <= '9';
}

/**
 * Check if a character is a word character (letter, digit, or underscore)
 */
export function isWordCharASCII(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_';
}

/**
 * Check if a character is a hexadecimal digit
 */
export function isHexDigit(c: string): boolean {
  return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}

/**
 * Check if a character is a valid number separator, like underscore in 1_000_000
 */
export function isNumberSeparator(startOfBlock: boolean, hex: boolean, pos: number, text: string): boolean {
  if (startOfBlock) {
    return false;
  }

  if (pos >= text.length) {
    return false;
  }

  if (text[pos] !== '_') {
    return false;
  }

  if (pos + 1 >= text.length) {
    return false;
  }

  if (hex) {
    return isHexDigit(text[pos + 1]);
  }

  return isNumericASCII(text[pos + 1]);
}

/**
 * Find the first occurrence of any of the given characters
 */
export function findFirstSymbols(text: string, pos: number, end: number, ...symbols: string[]): number {
  while (pos < end) {
    if (symbols.includes(text[pos])) {
      return pos;
    }
    pos++;
  }
  return end;
}

/**
 * Find the first character that is not any of the given characters
 */
export function findFirstNotSymbols(text: string, pos: number, end: number, ...symbols: string[]): number {
  while (pos < end) {
    if (!symbols.includes(text[pos])) {
      return pos;
    }
    pos++;
  }
  return end;
}

/**
 * Skip UTF-8 whitespaces (including Unicode ones)
 */
export function skipWhitespacesUTF8(text: string, pos: number, end: number): number {
  // Skip whitespace characters in Unicode
  // This is a simplified version that just skips common Unicode whitespace
  while (pos < end) {
    const code = text.charCodeAt(pos);

    // Skip ASCII whitespace
    if (code <= 127 && isWhitespaceASCII(String.fromCharCode(code))) {
      pos++;
      continue;
    }

    // Skip some common Unicode whitespace
    // U+00A0 - NO-BREAK SPACE
    // U+2000 to U+200A - Various space characters
    // U+2028 - LINE SEPARATOR
    // U+2029 - PARAGRAPH SEPARATOR
    // U+202F - NARROW NO-BREAK SPACE
    // U+205F - MEDIUM MATHEMATICAL SPACE
    // U+3000 - IDEOGRAPHIC SPACE
    if (
      code === 0x00a0 ||
      (code >= 0x2000 && code <= 0x200a) ||
      code === 0x2028 ||
      code === 0x2029 ||
      code === 0x202f ||
      code === 0x205f ||
      code === 0x3000
    ) {
      pos++;
      continue;
    }

    break;
  }

  return pos;
}

/**
 * Check if a character is a UTF-8 continuation octet
 */
export function isContinuationOctet(c: string): boolean {
  const code = c.charCodeAt(0);
  return (code & 0xc0) === 0x80;
}
