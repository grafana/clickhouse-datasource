import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { Datasource } from 'data/CHDatasource';
import useColumns, { useColumnsState } from './useColumns';
import { TableColumn } from 'types/queryBuilder';

describe('useColumns', () => {
  it('should return empty array if datasource is invalid', async () => {
    let result: { current: readonly TableColumn[] };
    await act(async () => {
      const r = renderHook(() => useColumns(undefined!, 'db', 'table'));
      result = r.result;
    });

    expect(result!.current).toHaveLength(0);
  });

  it('should return empty array if database string is empty', async () => {
    const mockDs = {} as Datasource;
    mockDs.fetchColumns = jest.fn((db: string, table: string) => Promise.resolve([]));
    let result: { current: readonly TableColumn[] };
    await act(async () => {
      const r = renderHook(() => useColumns(mockDs, '', 'table'));
      result = r.result;
    });

    expect(result!.current).toHaveLength(0);
  });

  it('should return empty array if table string is empty', async () => {
    const mockDs = {} as Datasource;
    mockDs.fetchColumns = jest.fn((db: string, table: string) => Promise.resolve([]));
    let result: { current: readonly TableColumn[] };
    await act(async () => {
      const r = renderHook(() => useColumns(mockDs, 'db', ''));
      result = r.result;
    });

    expect(result!.current).toHaveLength(0);
  });

  it('should fetch table columns', async () => {
    const mockDs = {} as Datasource;
    mockDs.fetchColumns = jest.fn((db: string, table: string) =>
      Promise.resolve([
        { name: 'a', type: 'string', picklistValues: [] },
        { name: 'b', type: 'string', picklistValues: [] },
        // { name: '*' } (an "all" column is added by the hook)
      ])
    );

    let result: { current: readonly TableColumn[] };
    await act(async () => {
      const r = renderHook(() => useColumns(mockDs, 'db', 'table'));
      result = r.result;
    });

    expect(result!.current).toHaveLength(2);
  });

  it('should treat colliding (database, table) pairs as distinct', async () => {
    const mockDs = {} as Datasource;
    mockDs.fetchColumns = jest.fn((db: string, table: string) => Promise.resolve([]));

    const { rerender } = renderHook(({ db, table }) => useColumnsState(mockDs, db, table), {
      initialProps: { db: 'a', table: 'bc' },
    });

    await act(async () => {
      rerender({ db: 'ab', table: 'c' });
    });

    expect(mockDs.fetchColumns).toHaveBeenCalledTimes(2);
    expect(mockDs.fetchColumns).toHaveBeenNthCalledWith(2, 'ab', 'c');
  });
});
