import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { Datasource } from 'data/CHDatasource';
import useHasTraceTimestampTable from './useHasTraceTimestampTable';

describe('useHasTraceTimestampTable', () => {
  it('seeds the initial render from a warm cache without a false flicker', async () => {
    const mockDs = {} as Datasource;
    mockDs.peekTraceTimestampTable = jest.fn(() => true);
    mockDs.hasTraceTimestampTable = jest.fn(() => Promise.resolve(true));

    const { result } = renderHook(() => useHasTraceTimestampTable(mockDs, 'otel', 'otel_traces'));

    // The async check cannot have settled yet, so a `true` on the first render
    // proves the value was seeded synchronously from the cache peek.
    expect(result.current).toBe(true);
    expect(mockDs.peekTraceTimestampTable).toHaveBeenCalledWith('otel', 'otel_traces');

    await act(async () => {}); // flush the pending async check
    expect(result.current).toBe(true);
  });

  it('starts false on a cold cache then updates to the resolved value', async () => {
    const mockDs = {} as Datasource;
    mockDs.peekTraceTimestampTable = jest.fn(() => undefined);
    mockDs.hasTraceTimestampTable = jest.fn(() => Promise.resolve(true));

    const { result } = renderHook(() => useHasTraceTimestampTable(mockDs, 'otel', 'otel_traces'));
    expect(result.current).toBe(false); // cold cache → initial render is false

    await act(async () => {}); // flush the async check
    expect(result.current).toBe(true); // updated once it resolves
  });

  it('returns false when database or table is empty', async () => {
    const mockDs = {} as Datasource;
    mockDs.peekTraceTimestampTable = jest.fn(() => undefined);
    mockDs.hasTraceTimestampTable = jest.fn(() => Promise.resolve(true));

    const { result } = renderHook(() => useHasTraceTimestampTable(mockDs, '', ''));

    await act(async () => {});
    expect(result.current).toBe(false);
    expect(mockDs.hasTraceTimestampTable).not.toHaveBeenCalled();
  });
});
