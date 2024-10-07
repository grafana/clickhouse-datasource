import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { Datasource } from 'data/CHDatasource';
import useUniqueMapKeys from './useUniqueMapKeys';

describe('useUniqueMapKeys', () => {
  it('should return empty array if invalid datasource is provided', async () => {
    let result: { current: readonly string[] };
    await act(async () => {
      const r = renderHook(() => useUniqueMapKeys(undefined!, 'col', 'db', 'table'));
      result = r.result;
    });

    expect(result!.current).toHaveLength(0);
  });

  it('should return empty array if empty column string is provided', async () => {
    const mockDs = {} as Datasource;

    let result: { current: readonly string[] };
    await act(async () => {
      const r = renderHook(() => useUniqueMapKeys(mockDs, '', 'db', 'table'));
      result = r.result;
    });

    expect(result!.current).toHaveLength(0);
  });

  it('should return empty array if empty database string is provided', async () => {
    const mockDs = {} as Datasource;

    let result: { current: readonly string[] };
    await act(async () => {
      const r = renderHook(() => useUniqueMapKeys(mockDs, 'col', '', 'table'));
      result = r.result;
    });

    expect(result!.current).toHaveLength(0);
  });

  it('should return empty array if empty table string is provided', async () => {
    const mockDs = {} as Datasource;

    let result: { current: readonly string[] };
    await act(async () => {
      const r = renderHook(() => useUniqueMapKeys(mockDs, 'col', 'db', ''));
      result = r.result;
    });

    expect(result!.current).toHaveLength(0);
  });

  it('should fetch unique map keys', async () => {
    const mockDs = {} as Datasource;
    mockDs.fetchUniqueMapKeys = jest.fn((col: string, db: string, table: string) => Promise.resolve(['a', 'b']));

    let result: { current: readonly string[] };
    await act(async () => {
      const r = renderHook(() => useUniqueMapKeys(mockDs, 'col', 'db', 'table'));
      result = r.result;
    });

    expect(result!.current).toHaveLength(2);
  });
});
