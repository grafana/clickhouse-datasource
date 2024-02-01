import { renderHook } from "@testing-library/react";
import useIsNewQuery from "./useIsNewQuery";
import { QueryBuilderOptions, QueryType } from "types/queryBuilder";

describe('useIsNewQuery', () => {
  const newQueryOpts: QueryBuilderOptions = {
    database: 'default',
    table: 'test',
    queryType: QueryType.Table
  };

  const existingQueryOpts: QueryBuilderOptions = {
    database: 'default',
    table: 'test',
    queryType: QueryType.Table,
    columns: [
      { name: 'valid_column' }
    ]
  };

  it('should return true when new query is provided', async () => {
    const hook = renderHook(() => useIsNewQuery(newQueryOpts));
    expect(hook.result.current).toBe(true);
  });

  it('should return false when existing query is provided', async () => {
    const hook = renderHook(() => useIsNewQuery(existingQueryOpts));
    expect(hook.result.current).toBe(false);
  });

  it('should continue to return true when new query is updated', async () => {
    const hook = renderHook(opts => useIsNewQuery(opts), { initialProps: newQueryOpts });
    const firstResult = hook.result.current;
    hook.rerender(existingQueryOpts);
    const secondResult = hook.result.current;

    expect(firstResult).toBe(true);
    expect(secondResult).toBe(true);
  });

  it('should continue to return false when existing query is updated', async () => {
    const hook = renderHook(opts => useIsNewQuery(opts), { initialProps: existingQueryOpts });
    const firstResult = hook.result.current;
    hook.rerender(existingQueryOpts);
    const secondResult = hook.result.current;

    expect(firstResult).toBe(false);
    expect(secondResult).toBe(false);
  });
});
