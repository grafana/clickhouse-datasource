import { renderHook, waitFor } from '@testing-library/react';
import { Datasource } from 'data/CHDatasource';
import useUniqueJSONPaths from './useUniqueJSONPaths';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('useUniqueJSONPaths', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the paths fetched for the column', async () => {
    const datasource = { fetchUniqueJSONPaths: jest.fn().mockResolvedValue(['a.b']) } as unknown as Datasource;
    const { result } = renderHook(() => useUniqueJSONPaths(datasource, 'attrs', 'db', 'table'));

    await waitFor(() => expect(result.current).toEqual(['a.b']));
    expect(datasource.fetchUniqueJSONPaths).toHaveBeenCalledWith('attrs', 'db', 'table', undefined);
  });

  it('reads as empty straight away when the column changes', async () => {
    const second = deferred<string[]>();
    const fetchUniqueJSONPaths = jest.fn().mockResolvedValueOnce(['a.b']).mockReturnValueOnce(second.promise);
    const datasource = { fetchUniqueJSONPaths } as unknown as Datasource;
    const { result, rerender } = renderHook(({ column }) => useUniqueJSONPaths(datasource, column, 'db', 'table'), {
      initialProps: { column: 'attrs' },
    });
    await waitFor(() => expect(result.current).toEqual(['a.b']));

    rerender({ column: 'other' });
    expect(result.current).toEqual([]);

    second.resolve(['c.d']);
    await waitFor(() => expect(result.current).toEqual(['c.d']));
  });

  it('does not bring back earlier paths when returning to the same column', async () => {
    const refetch = deferred<string[]>();
    const fetchUniqueJSONPaths = jest.fn().mockResolvedValueOnce(['a.old']).mockReturnValueOnce(refetch.promise);
    const datasource = { fetchUniqueJSONPaths } as unknown as Datasource;
    const { result, rerender } = renderHook(({ column }) => useUniqueJSONPaths(datasource, column, 'db', 'table'), {
      initialProps: { column: 'attrs' },
    });
    await waitFor(() => expect(result.current).toEqual(['a.old']));

    // A non-JSON column disables the hook, then the JSON column is picked again.
    rerender({ column: '' });
    expect(result.current).toEqual([]);
    rerender({ column: 'attrs' });
    expect(result.current).toEqual([]);

    // The refetch fails: the earlier paths must not reappear.
    refetch.reject(new Error('boom'));
    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(result.current).toEqual([]);
    expect(fetchUniqueJSONPaths).toHaveBeenCalledTimes(2);
  });
});
