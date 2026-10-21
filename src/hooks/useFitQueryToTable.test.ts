import { renderHook } from '@testing-library/react';
import useFitQueryToTable from './useFitQueryToTable';
import { fitToTable } from './useBuilderOptionsState';

const columns = [{ name: 'a', type: 'String', picklistValues: [] }];

describe('useFitQueryToTable', () => {
  it('leaves the table the builder mounted with alone, so a saved query is never rewritten', () => {
    const dispatch = jest.fn();
    renderHook(() => useFitQueryToTable(columns, 'db', 'logs', dispatch));

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('fits the query once the columns of a new table load, and only once', () => {
    const dispatch = jest.fn();
    const { rerender } = renderHook(({ cols, table }) => useFitQueryToTable(cols, 'db', table, dispatch), {
      initialProps: { cols: columns, table: 'logs' },
    });

    rerender({ cols: [], table: 'other' }); // still loading
    expect(dispatch).not.toHaveBeenCalled();

    rerender({ cols: columns, table: 'other' });
    rerender({ cols: [...columns], table: 'other' });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(fitToTable('db', 'other', columns));
  });
});
