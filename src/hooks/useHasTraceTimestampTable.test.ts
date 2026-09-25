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
    expect(mockDs.peekTraceTimestampTable).toHaveBeenCalledWith('otel', 'otel_traces', undefined);

    await act(async () => {}); // flush the pending async check
    expect(result.current).toBe(true);
  });

  it('stays undefined on a cold cache then updates to the resolved value', async () => {
    // Returning `undefined` (rather than a transient `false`) is what lets the
    // CHQueryEditor effect skip dispatching while the async lookup is in
    // flight, preserving any pre-set `meta.hasTraceTimestampTable: true` baked
    // into trace ID deep-link queries by the response transform (#1918).
    const mockDs = {} as Datasource;
    mockDs.peekTraceTimestampTable = jest.fn(() => undefined);
    mockDs.hasTraceTimestampTable = jest.fn(() => Promise.resolve(true));

    const { result } = renderHook(() => useHasTraceTimestampTable(mockDs, 'otel', 'otel_traces'));
    expect(result.current).toBeUndefined(); // cold cache → "don't know yet"

    await act(async () => {}); // flush the async check
    expect(result.current).toBe(true); // updated once it resolves
  });

  it('resolves to false when the companion table does not exist', async () => {
    // A definitive false from the async check must propagate so the editor can
    // correct stale optimistic meta (e.g. a saved query from a table that has
    // since lost its companion).
    const mockDs = {} as Datasource;
    mockDs.peekTraceTimestampTable = jest.fn(() => undefined);
    mockDs.hasTraceTimestampTable = jest.fn(() => Promise.resolve(false));

    const { result } = renderHook(() => useHasTraceTimestampTable(mockDs, 'otel', 'otel_traces'));
    expect(result.current).toBeUndefined();

    await act(async () => {});
    expect(result.current).toBe(false);
  });

  it('passes the per-query suffix through to the peek and the async check', async () => {
    // A saved query can bake a meta.traceTimestampTableSuffix that differs
    // from the datasource config suffix. The hook must probe the companion
    // table the SQL generator will reference, not the config one.
    const mockDs = {} as Datasource;
    mockDs.peekTraceTimestampTable = jest.fn(() => undefined);
    mockDs.hasTraceTimestampTable = jest.fn(() => Promise.resolve(true));

    const { result } = renderHook(() => useHasTraceTimestampTable(mockDs, 'otel', 'otel_traces', '_saved_ts'));

    await act(async () => {});
    expect(result.current).toBe(true);
    expect(mockDs.peekTraceTimestampTable).toHaveBeenCalledWith('otel', 'otel_traces', '_saved_ts');
    expect(mockDs.hasTraceTimestampTable).toHaveBeenCalledWith('otel', 'otel_traces', '_saved_ts');
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
