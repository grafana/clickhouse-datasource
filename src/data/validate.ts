import { Lexer } from 'ch-parser/lexer';
import { getErrorTokenDescription } from 'ch-parser/types';

export interface Error {
  startLine: number;
  endLine: number;
  startCol: number;
  endCol: number;
  message: string;
  expected: string;
}

export interface Validation {
  valid: boolean;
  error?: Error;
}

function offsetToLineCol(sql: string, offset: number): { line: number; col: number } {
  const lines = sql.substring(0, offset).split('\n');
  return {
    line: lines.length,
    col: lines[lines.length - 1].length + 1,
  };
}

export function validate(sql: string): Validation {
  const lexer = new Lexer(sql);
  while (true) {
    const token = lexer.nextToken();
    if (token.isEnd()) {
      break;
    }
    if (token.isError()) {
      const start = offsetToLineCol(sql, token.begin);
      const end = offsetToLineCol(sql, token.end);
      const description = getErrorTokenDescription(token.type);
      return {
        valid: false,
        error: {
          startLine: start.line,
          endLine: end.line,
          startCol: start.col,
          endCol: end.col,
          message: description,
          expected: description,
        },
      };
    }
  }
  return { valid: true };
}
