import { renderHook } from '@testing-library/react';
import useFitQueryToTable, { sourceKey } from './useFitQueryToTable';
import { fitToTable } from './useBuilderOptionsState';

const columns = [{ name: 'a', type: 'String', picklistValues: [] }];

describe('useFitQueryToTable', () => {
  const render = (initialProps: { cols: typeof columns; table: string; picked?: string }) => {
    const dispatch = jest.fn();
    const hook = renderHook(({ cols, table, picked }) => useFitQueryToTable(cols, 'db', table, picked, dispatch), {
      initialProps,
    });
    return { dispatch, ...hook };
  };

  it('leaves the table the builder mounted with alone, so a saved query is never rewritten', () => {
    const { dispatch } = render({ cols: columns, table: 'logs' });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('fits the query once the columns of a picked table load, and only once', () => {
    const { dispatch, rerender } = render({ cols: columns, table: 'logs' });

    rerender({ cols: [], table: 'other', picked: sourceKey('db', 'other') }); // still loading
    expect(dispatch).not.toHaveBeenCalled();

    rerender({ cols: columns, table: 'other', picked: sourceKey('db', 'other') });
    rerender({ cols: [...columns], table: 'other', picked: sourceKey('db', 'other') });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(fitToTable('db', 'other', columns));
  });

  it('leaves a table that Grafana replaced the query with alone', () => {
    // A query history pick or a dashboard change: same type, so the view stays mounted.
    const { dispatch, rerender } = render({ cols: columns, table: 'logs', picked: sourceKey('db', 'logs') });

    rerender({ cols: columns, table: 'from_history', picked: sourceKey('db', 'logs') });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('fits a table picked again after Grafana replaced the query', () => {
    const picked = sourceKey('db', 'other');
    const { dispatch, rerender } = render({ cols: columns, table: 'logs' });
    rerender({ cols: columns, table: 'other', picked });
    rerender({ cols: columns, table: 'from_history', picked });
    dispatch.mockClear();

    rerender({ cols: columns, table: 'other', picked });

    expect(dispatch).toHaveBeenCalledWith(fitToTable('db', 'other', columns));
  });
});
