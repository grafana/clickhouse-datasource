import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { Datasource } from 'data/CHDatasource';
import useTables from './useTables';

describe('useTables', () => {
  it('should return empty array if invalid datasource is provided', async () => {
    let result: { current: readonly string[] };
    await act(async () => {
      const r = renderHook(() => useTables(undefined!, 'db'));
      result = r.result;
    });

    expect(result!.current).toHaveLength(0);
  });

  it('should return empty array if empty database string is provided', async () => {
    const mockDs = {} as Datasource;
    mockDs.fetchTables = jest.fn((db: string) => Promise.resolve(['a', 'b']));

    let result: { current: readonly string[] };
    await act(async () => {
      const r = renderHook(() => useTables(mockDs, ''));
      result = r.result;
    });

    expect(result!.current).toHaveLength(0);
  });

  it('should fetch tables', async () => {
    const mockDs = {} as Datasource;
    mockDs.fetchTables = jest.fn((db: string) => Promise.resolve(['a', 'b']));

    let result: { current: readonly string[] };
    await act(async () => {
      const r = renderHook(() => useTables(mockDs, 'db'));
      result = r.result;
    });

    expect(result!.current).toHaveLength(2);
  });
});
