import sqlToAST, { astToSql } from './ast';

describe('grammar', () => {
  it('grammar', () => {
    const ast = sqlToAST(
      `  SelectQuery (children 3)
      ExpressionList (children 1)
       Identifier hello
      TablesInSelectQuery (children 1)
       TablesInSelectQueryElement (children 1)
        TableExpression (children 1)
         TableIdentifier table1
      Function and (children 1)
       ExpressionList (children 2)
        Function equals (children 1)
         ExpressionList (children 2)
          Identifier k
          Literal UInt64_1
        Function like (children 1)
         ExpressionList (children 2)
          Identifier j
          Literal 'hello'
    Identifier TabSeparatedWithNamesAndTypes`);
    expect(astToSql(ast)).toEqual(`SELECT hello FROM table1 WHERE and ( equals ( k , 1 ) , like ( j , 'hello' ) )`);
  });
});