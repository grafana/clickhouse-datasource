import { ColumnHint, FilterOperator, QueryBuilderOptions, QueryType } from 'types/queryBuilder';
import { generateSql } from './sqlGenerator';

// Parentheses enforce the documented message-search constraint on every OR arm.
describe('log message search with OR column filters', () => {
  const options: QueryBuilderOptions = {
    database: '',
    table: 'logs',
    queryType: QueryType.Logs,
    columns: [{ name: 'Body', type: 'String', hint: ColumnHint.LogMessage }],
    filters: [
      {
        filterType: 'custom', key: 'SeverityText', type: 'String',
        operator: FilterOperator.Equals, condition: 'AND', value: 'info',
      },
      {
        filterType: 'custom', key: 'SeverityText', type: 'String',
        operator: FilterOperator.Equals, condition: 'OR', value: 'warn',
      },
    ],
    meta: { logMessageLike: 'needle' },
  };

  it('applies the message predicate to both OR branches', () => {
    expect(generateSql(options)).toBe(
      'SELECT Body as "body" FROM "logs" ' +
      "WHERE (( SeverityText = 'info' ) OR ( SeverityText = 'warn' )) AND (body LIKE '%needle%')"
    );
  });

  it('applies the message predicate to all three OR branches', () => {
    const filters = [...options.filters!, {
      filterType: 'custom' as const, key: 'SeverityText', type: 'String',
      operator: FilterOperator.Equals, condition: 'OR' as const, value: 'error',
    }];
    expect(generateSql({ ...options, filters })).toBe(
      'SELECT Body as "body" FROM "logs" ' +
      "WHERE (( SeverityText = 'info' ) OR ( SeverityText = 'warn' ) OR ( SeverityText = 'error' )) " +
      "AND (body LIKE '%needle%')"
    );
  });

  it('preserves OR selection when no message search is present', () => {
    expect(generateSql({ ...options, meta: {} })).toBe(
      'SELECT Body as "body" FROM "logs" ' +
      "WHERE ( SeverityText = 'info' ) OR ( SeverityText = 'warn' )"
    );
  });

  it('retains a message search without column filters', () => {
    expect(generateSql({ ...options, filters: [] })).toBe(
      'SELECT Body as "body" FROM "logs" WHERE (body LIKE \'%needle%\')'
    );
  });
});
