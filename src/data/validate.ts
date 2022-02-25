import * as parser from 'js-sql-parser';

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

export interface ParseError {
  message: string;
  hash: {
    text: string;
    loc: {
      first_line: number;
      last_line: number;
      first_column: number;
      last_column: number;
    };
  };
}

// the sql parser only handles generic syntax, allow any clickhouse specific syntax
const allow = ['INTERVAL'];

export function validate(sql: string): Validation {
  try {
    parser.parse(sql);
    return { valid: true };
  } catch (e: any) {
    const err = e as ParseError;
    const parts = err.message.split('\n');
    const loc = err.hash.loc;
    const lines = sql.split('\n');
    const line = lines[loc.first_line - 1];
    const bad = line.substring(loc.first_column, loc.last_column);
    if (allow.includes(bad.toUpperCase())) {
      return { valid: true };
    }

    if (line.trim() === bad) {
      // issue is on next line
      const nextLine = lines[loc.first_line];
      if (nextLine?.trim().startsWith('$')) {
        return { valid: true };
      }
    }

    const badSection = line.substring(loc.last_column + 1);
    if (badSection.trim().startsWith('$')) {
      return { valid: true };
    }

    return {
      valid: false,
      error: {
        startLine: loc.first_line,
        endLine: loc.last_line,
        startCol: loc.first_column + 1,
        endCol: loc.last_column + 1,
        message: e.message,
        expected: parts[3],
      },
    };
  }
}
