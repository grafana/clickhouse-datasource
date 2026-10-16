import { Lexer } from 'ch-parser/lexer';
import { unquoteIdentifier } from 'ch-parser/spans';
import { Token, TokenType } from 'ch-parser/types';

// system.tables normalizes the Distributed engine arguments to string literals.
const DISTRIBUTED_ENGINE =
  /^Distributed\(\s*'(?:[^'\\]|\\.)*'\s*,\s*'((?:[^'\\]|\\.)+)'\s*,\s*'((?:[^'\\]|\\.)+)'\s*[,)]/;

const unescapeStringLiteral = (body: string): string => body.replace(/\\(.)/g, '$1');

const identifierName = (token: Token): string | undefined => {
  if (token.type === TokenType.BareWord) {
    return token.text;
  }
  return token.type === TokenType.QuotedIdentifier ? unquoteIdentifier(token.text) : undefined;
};

/** True when the key expression names `column` as an identifier. */
export const keyReferencesColumn = (key: string, column: string): boolean => {
  const lexer = new Lexer(key);
  for (let token = lexer.nextToken(); !token.isEnd() && !token.isError(); token = lexer.nextToken()) {
    if (identifierName(token) === column) {
      return true;
    }
  }
  return false;
};

/** Reads the database and table a `Distributed(cluster, database, table, ...)` engine points at. */
export const parseDistributedTarget = (engineFull: string): { database: string; table: string } | undefined => {
  const match = engineFull.match(DISTRIBUTED_ENGINE);
  return match ? { database: unescapeStringLiteral(match[1]), table: unescapeStringLiteral(match[2]) } : undefined;
};
