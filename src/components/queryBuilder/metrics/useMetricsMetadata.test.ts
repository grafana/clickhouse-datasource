import { renderHook, waitFor } from '@testing-library/react';
import { Datasource } from 'data/CHDatasource';
import { useMetricLabelKeys } from './useMetricsMetadata';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const render = (fetchMetricLabelKeys: jest.Mock, initialMetric = 'm1') => {
  const datasource = { fetchMetricLabelKeys } as unknown as Datasource;
  return renderHook(({ metric }) => useMetricLabelKeys(datasource, 'db', 'gauge', metric, false, 'range'), {
    initialProps: { metric: initialMetric },
  });
};

describe('useMetricsMetadata useAsync', () => {
  it('starts loading, then holds the loaded value', async () => {
    const first = deferred<Array<{ key: string }>>();
    const { result } = render(jest.fn().mockReturnValue(first.promise));
    expect(result.current).toEqual({ value: [], loading: true });

    first.resolve([{ key: 'host' }]);
    await waitFor(() => expect(result.current).toEqual({ value: [{ key: 'host' }], loading: false }));
  });

  it('keeps the previous value while a new key loads, and drops a stale response', async () => {
    const first = deferred<Array<{ key: string }>>();
    const second = deferred<Array<{ key: string }>>();
    const third = deferred<Array<{ key: string }>>();
    const fetch = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise);
    const { result, rerender } = render(fetch);
    first.resolve([{ key: 'host' }]);
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ metric: 'm2' });
    expect(result.current).toEqual({ value: [{ key: 'host' }], loading: true });

    rerender({ metric: 'm3' });
    second.resolve([{ key: 'stale' }]);
    third.resolve([{ key: 'zone' }]);
    await waitFor(() => expect(result.current).toEqual({ value: [{ key: 'zone' }], loading: false }));
  });

  it('resets to the initial value for an empty key, and does not load', async () => {
    const fetch = jest.fn().mockResolvedValue([{ key: 'host' }]);
    const { result, rerender } = render(fetch);
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ metric: '' });
    expect(result.current).toEqual({ value: [], loading: false });
    expect(fetch).toHaveBeenCalledTimes(1);

    // Picking a metric again does not show the value from before the reset.
    fetch.mockReturnValueOnce(new Promise(() => {}));
    rerender({ metric: 'm2' });
    expect(result.current).toEqual({ value: [], loading: true });
  });

  it('reports an error with the initial value', async () => {
    const { result } = render(jest.fn().mockRejectedValue(new Error('no table')));
    await waitFor(() => expect(result.current).toEqual({ value: [], loading: false, error: 'no table' }));
  });
});
