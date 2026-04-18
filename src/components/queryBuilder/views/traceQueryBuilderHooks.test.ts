import { renderHook } from '@testing-library/react';
import {
  useDefaultFilters,
  useDefaultTraceColumnsByName,
  useOtelColumns,
  useTraceDefaultsOnMount,
} from './traceQueryBuilderHooks';
import { mockDatasource } from '__mocks__/datasource';
import { ColumnHint, QueryBuilderOptions, SelectedColumn, TableColumn } from 'types/queryBuilder';
import { setColumnByHint, setOptions } from 'hooks/useBuilderOptionsState';
import otel from 'otel';

describe('useTraceDefaultsOnMount', () => {
  it('should call builderOptionsDispatch with default trace columns', async () => {
    const builderOptionsDispatch = jest.fn();
    jest.spyOn(mockDatasource, 'getTraceOtelVersion').mockReturnValue(undefined);
    jest
      .spyOn(mockDatasource, 'getDefaultTraceColumns')
      .mockReturnValue(new Map<ColumnHint, string>([[ColumnHint.Time, 'timestamp']]));

    renderHook(() => useTraceDefaultsOnMount(mockDatasource, true, {} as QueryBuilderOptions, builderOptionsDispatch));

    const expectedOptions = {
      database: expect.anything(),
      table: expect.anything(),
      columns: [{ name: 'timestamp', hint: ColumnHint.Time }],
      meta: {
        otelEnabled: expect.anything(),
        otelVersion: undefined,
        traceDurationUnit: expect.anything(),
        flattenNested: expect.anything(),
        traceEventsColumnPrefix: expect.anything(),
        traceLinksColumnPrefix: expect.anything(),
      },
    };

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setOptions(expectedOptions)));
  });

  it('should not call builderOptionsDispatch after defaults are set', async () => {
    const builderOptions = {} as QueryBuilderOptions;
    const builderOptionsDispatch = jest.fn();

    const hook = renderHook(() =>
      useTraceDefaultsOnMount(mockDatasource, true, builderOptions, builderOptionsDispatch)
    );
    hook.rerender();

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
  });

  it('should not call builderOptionsDispatch for existing query', async () => {
    const isNewQuery = false; // query already exists, is not new
    const builderOptionsDispatch = jest.fn();
    renderHook(() =>
      useTraceDefaultsOnMount(mockDatasource, isNewQuery, {} as QueryBuilderOptions, builderOptionsDispatch)
    );

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });
});

describe('useOtelColumns', () => {
  const testOtelVersion = otel.getLatestVersion();

  it('should not call builderOptionsDispatch if OTEL is already enabled', async () => {
    const builderOptionsDispatch = jest.fn();
    renderHook(() => useOtelColumns(true, testOtelVersion.version, builderOptionsDispatch));

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('should not call builderOptionsDispatch if OTEL is disabled', async () => {
    const builderOptionsDispatch = jest.fn();
    renderHook(() => useOtelColumns(true, testOtelVersion.version, builderOptionsDispatch));

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('should call builderOptionsDispatch with columns when OTEL is toggled on', async () => {
    const builderOptionsDispatch = jest.fn();

    let otelEnabled = false;
    const hook = renderHook((enabled) => useOtelColumns(enabled, testOtelVersion.version, builderOptionsDispatch), {
      initialProps: otelEnabled,
    });
    otelEnabled = true;
    hook.rerender(otelEnabled);

    const columns: SelectedColumn[] = [];
    testOtelVersion.traceColumnMap.forEach((v, k) => columns.push({ name: v, hint: k }));
    const expectedOptions = {
      columns,
      meta: {
        traceDurationUnit: expect.anything(),
        flattenNested: expect.anything(),
        traceEventsColumnPrefix: expect.anything(),
        traceLinksColumnPrefix: expect.anything(),
      },
    };

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setOptions(expectedOptions)));
  });

  it('should not call builderOptionsDispatch after OTEL columns are set', async () => {
    const builderOptionsDispatch = jest.fn();

    let otelEnabled = false; // OTEL is off
    const hook = renderHook((enabled) => useOtelColumns(enabled, testOtelVersion.version, builderOptionsDispatch), {
      initialProps: otelEnabled,
    });
    otelEnabled = true;
    hook.rerender(otelEnabled); // OTEL is on, columns are set
    hook.rerender(otelEnabled); // OTEL still on, should not set again

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
  });
});

describe('useDefaultFilters', () => {
  it('should call builderOptionsDispatch when query is new', async () => {
    const builderOptionsDispatch = jest.fn();
    const tableName = 'timeseries';
    const isTraceIdMode = false;
    const isNewQuery = true;

    renderHook(() => useDefaultFilters(tableName, isTraceIdMode, isNewQuery, builderOptionsDispatch));

    const expectedOptions = {
      filters: [expect.anything(), expect.anything(), expect.anything(), expect.anything()],
      orderBy: [expect.anything(), expect.anything()],
    };
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setOptions(expectedOptions)));
  });

  it('should not call builderOptionsDispatch when query is not new', async () => {
    const builderOptionsDispatch = jest.fn();
    const tableName = 'timeseries';
    const isTraceIdMode = false;
    const isNewQuery = false;

    renderHook(() => useDefaultFilters(tableName, isTraceIdMode, isNewQuery, builderOptionsDispatch));

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('should not call builderOptionsDispatch when query is trace ID mode', async () => {
    const builderOptionsDispatch = jest.fn();
    const tableName = 'timeseries';
    const isTraceIdMode = true;
    const isNewQuery = true;

    renderHook(() => useDefaultFilters(tableName, isTraceIdMode, isNewQuery, builderOptionsDispatch));

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('should call builderOptionsDispatch when table changes', async () => {
    const builderOptionsDispatch = jest.fn();
    const tableName = 'timeseries';
    const isTraceIdMode = false;
    const isNewQuery = false;

    const hook = renderHook((table) => useDefaultFilters(table, isTraceIdMode, isNewQuery, builderOptionsDispatch), {
      initialProps: tableName,
    });
    hook.rerender('other_timeseries');

    const expectedOptions = {
      filters: [expect.anything(), expect.anything(), expect.anything(), expect.anything()],
      orderBy: [expect.anything(), expect.anything()],
    };
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setOptions(expectedOptions)));
  });
});

describe('useDefaultTraceColumnsByName', () => {
  const traceTableColumns: readonly TableColumn[] = [
    { name: 'trace_id', type: 'String', picklistValues: [] },
    { name: 'span_id', type: 'String', picklistValues: [] },
    { name: 'parent_span_id', type: 'String', picklistValues: [] },
    { name: 'service_name', type: 'LowCardinality(String)', picklistValues: [] },
    { name: 'span_name', type: 'String', picklistValues: [] },
    { name: 'timestamp', type: 'DateTime64(9)', picklistValues: [] },
    { name: 'duration_ns', type: 'UInt64', picklistValues: [] },
  ];

  it('fills every role slot from conventional column names', () => {
    const builderOptionsDispatch = jest.fn();

    renderHook(() =>
      useDefaultTraceColumnsByName(traceTableColumns, 'traces', {}, false, builderOptionsDispatch)
    );

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(7);
    const expected: Array<[ColumnHint, string, string]> = [
      [ColumnHint.TraceId, 'trace_id', 'String'],
      [ColumnHint.TraceSpanId, 'span_id', 'String'],
      [ColumnHint.TraceParentSpanId, 'parent_span_id', 'String'],
      [ColumnHint.TraceServiceName, 'service_name', 'LowCardinality(String)'],
      [ColumnHint.TraceOperationName, 'span_name', 'String'],
      [ColumnHint.Time, 'timestamp', 'DateTime64(9)'],
      [ColumnHint.TraceDurationTime, 'duration_ns', 'UInt64'],
    ];
    for (const [hint, name, type] of expected) {
      expect(builderOptionsDispatch).toHaveBeenCalledWith(
        expect.objectContaining(setColumnByHint({ name, type, hint }))
      );
    }
  });

  it('skips slots the user has already filled', () => {
    const builderOptionsDispatch = jest.fn();
    const userTraceId: SelectedColumn = { name: 'myTraceId', type: 'String', hint: ColumnHint.TraceId };

    renderHook(() =>
      useDefaultTraceColumnsByName(
        traceTableColumns,
        'traces',
        { traceId: userTraceId },
        false,
        builderOptionsDispatch
      )
    );

    // 7 slots minus the already-filled TraceId = 6 dispatches.
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(6);
    const traceIdDispatch = builderOptionsDispatch.mock.calls.find(
      ([action]) => action?.payload?.column?.hint === ColumnHint.TraceId
    );
    expect(traceIdDispatch).toBeUndefined();
  });

  it('does nothing when OTel mode is enabled', () => {
    const builderOptionsDispatch = jest.fn();
    renderHook(() => useDefaultTraceColumnsByName(traceTableColumns, 'traces', {}, true, builderOptionsDispatch));
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('does nothing when allColumns is empty', () => {
    const builderOptionsDispatch = jest.fn();
    renderHook(() => useDefaultTraceColumnsByName([], 'traces', {}, false, builderOptionsDispatch));
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('re-runs when the table changes', () => {
    const builderOptionsDispatch = jest.fn();
    const hook = renderHook(
      (table) => useDefaultTraceColumnsByName(traceTableColumns, table, {}, false, builderOptionsDispatch),
      { initialProps: 'traces' }
    );
    const first = builderOptionsDispatch.mock.calls.length;
    hook.rerender('other_traces');
    expect(builderOptionsDispatch.mock.calls.length).toBeGreaterThan(first);
  });

  it('does not match a String column for the numeric Duration role', () => {
    const builderOptionsDispatch = jest.fn();
    // `duration` here is a String — heuristic must skip it, leaving the slot empty.
    const cols: readonly TableColumn[] = [{ name: 'duration', type: 'String', picklistValues: [] }];

    renderHook(() => useDefaultTraceColumnsByName(cols, 'traces', {}, false, builderOptionsDispatch));

    const durationDispatch = builderOptionsDispatch.mock.calls.find(
      ([action]) => action?.payload?.column?.hint === ColumnHint.TraceDurationTime
    );
    expect(durationDispatch).toBeUndefined();
  });
});
