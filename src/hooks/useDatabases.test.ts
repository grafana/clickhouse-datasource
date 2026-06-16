import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { Datasource } from 'data/CHDatasource';
import useDatabases from './useDatabases';

describe('useDatabases', () => {
  it('should return empty array if invalid datasource is provided', async () => {
    let result: { current: readonly string[] };
    await act(async () => {
      const r = renderHook(() => useDatabases(undefined!));
      result = r.result;
    });

    expect(result!.current).toHaveLength(0);
  });

  it('should fetch databases', async () => {
    const mockDs = {} as Datasource;
    mockDs.fetchDatabases = jest.fn(() => Promise.resolve(['a', 'b']));

    let result: { current: readonly string[] };
    await act(async () => {
      const r = renderHook(() => useDatabases(mockDs));
      result = r.result;
    });

    expect(result!.current).toHaveLength(2);
  });
});
