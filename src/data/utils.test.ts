import { QueryBuilderOptions, QueryType } from "types/queryBuilder";
import { columnLabelToPlaceholder, isBuilderOptionsRunnable } from "./utils";

describe('isBuilderOptionsRunnable', () => {
  it('should return false for empty builder options', () => {
    const opts: QueryBuilderOptions = {
      database: 'default',
      table: 'test',
      queryType: QueryType.Table
    };

    const runnable = isBuilderOptionsRunnable(opts);
    expect(runnable).toBe(false);
  });

  it('should return true for valid builder options', () => {
    const opts: QueryBuilderOptions = {
      database: 'default',
      table: 'test',
      queryType: QueryType.Table,
      columns: [
        { name: 'valid_column' }
      ]
    };

    const runnable = isBuilderOptionsRunnable(opts);
    expect(runnable).toBe(true);
  });
});

describe('columnLabelToPlaceholder', () => {
  it('converts to lowercase and removes multiple spaces', () => {
    const expected = 'expected_test_output';
    const actual = columnLabelToPlaceholder('Expected TEST output');
    expect(actual).toEqual(expected);
  });
});
