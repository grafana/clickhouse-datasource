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
        traceTimestampTableSuffix: expect.anything(),
        tagsAreJSON: expect.anything(),
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

  const makeAllColumns = (overrides: Partial<Record<string, string>> = {}): TableColumn[] => {
    const cols: TableColumn[] = [];
    testOtelVersion.traceColumnMap.forEach((name) => {
      cols.push({ name, type: overrides[name] ?? 'String', label: name, picklistValues: [] });
    });
    return cols;
  };

  it('should not call builderOptionsDispatch when OTel is already enabled on mount (saved query, non-JSON columns)', async () => {
    // didSetColumns starts true when otelEnabled=true on mount (saved query).
    // The saved-query path runs once allColumns loads and finds no JSON — no dispatch.
    const builderOptionsDispatch = jest.fn();
    renderHook(() => useOtelColumns(true, testOtelVersion.version, makeAllColumns(), builderOptionsDispatch));

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('should not call builderOptionsDispatch if OTEL is disabled', async () => {
    const builderOptionsDispatch = jest.fn();
    renderHook(() => useOtelColumns(false, testOtelVersion.version, makeAllColumns(), builderOptionsDispatch));

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('should call builderOptionsDispatch with columns when OTEL is toggled on', async () => {
    const builderOptionsDispatch = jest.fn();

    let otelEnabled = false;
    const hook = renderHook(
      (enabled) => useOtelColumns(enabled, testOtelVersion.version, makeAllColumns(), builderOptionsDispatch),
      { initialProps: otelEnabled }
    );
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
        tagsAreJSON: false,
      },
    };

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setOptions(expectedOptions)));
  });

  it('should not call builderOptionsDispatch after OTEL columns are set', async () => {
    const builderOptionsDispatch = jest.fn();

    let otelEnabled = false;
    const hook = renderHook(
      (enabled) => useOtelColumns(enabled, testOtelVersion.version, makeAllColumns(), builderOptionsDispatch),
      { initialProps: otelEnabled }
    );
    otelEnabled = true;
    hook.rerender(otelEnabled); // OTEL is on, columns are set
    hook.rerender(otelEnabled); // OTEL still on, should not set again

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
  });

  it('should stamp TraceTags/TraceServiceTags columns with type JSON when allColumns reports JSON type', async () => {
    // When OTel is toggled on and allColumns is already loaded with JSON types,
    // Effect 1 detects them immediately and dispatches once with JSON types stamped.
    // Effect 2 is skipped (didDetectColumnTypes is set by Effect 1).
    const builderOptionsDispatch = jest.fn();
    const tagsName = testOtelVersion.traceColumnMap.get(ColumnHint.TraceTags)!;
    const serviceTagsName = testOtelVersion.traceColumnMap.get(ColumnHint.TraceServiceTags)!;

    let otelEnabled = false;
    const hook = renderHook(
      (enabled) =>
        useOtelColumns(
          enabled,
          testOtelVersion.version,
          makeAllColumns({ [tagsName]: 'JSON', [serviceTagsName]: 'JSON' }),
          builderOptionsDispatch
        ),
      { initialProps: otelEnabled }
    );
    otelEnabled = true;
    hook.rerender(otelEnabled);

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);

    const dispatchedColumns: SelectedColumn[] = builderOptionsDispatch.mock.calls[0][0].payload.columns;
    const tagsCol = dispatchedColumns.find((c) => c.hint === ColumnHint.TraceTags);
    const serviceTagsCol = dispatchedColumns.find((c) => c.hint === ColumnHint.TraceServiceTags);

    expect(tagsCol?.type).toBe('JSON');
    expect(serviceTagsCol?.type).toBe('JSON');
  });

  it('should not stamp type JSON on TraceTags/TraceServiceTags when allColumns reports String type', async () => {
    const builderOptionsDispatch = jest.fn();

    let otelEnabled = false;
    const hook = renderHook(
      (enabled) => useOtelColumns(enabled, testOtelVersion.version, makeAllColumns(), builderOptionsDispatch),
      { initialProps: otelEnabled }
    );
    otelEnabled = true;
    hook.rerender(otelEnabled);

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);

    const dispatchedColumns: SelectedColumn[] = builderOptionsDispatch.mock.calls[0][0].payload.columns;
    const tagsCol = dispatchedColumns.find((c) => c.hint === ColumnHint.TraceTags);
    const serviceTagsCol = dispatchedColumns.find((c) => c.hint === ColumnHint.TraceServiceTags);

    expect(tagsCol?.type).toBeUndefined();
    expect(serviceTagsCol?.type).toBeUndefined();
  });

  it('dispatches OTel columns immediately when toggled on even if the schema has not loaded', async () => {
    // Regression guard: when the table schema cannot be fetched (permission
    // denied, dropped/renamed table) allColumns stays [] indefinitely. The
    // toggle must still apply the OTel column map so the query is not left
    // without any column mappings — otherwise flipping OTel on is a no-op with
    // no recovery path (every manual column selector is disabled while OTel is
    // on). JSON detection is deferred to a later correction when/if the schema
    // arrives.
    const builderOptionsDispatch = jest.fn();

    type Props = { enabled: boolean; cols: TableColumn[] };
    const hook = renderHook(
      ({ enabled, cols }: Props) => useOtelColumns(enabled, testOtelVersion.version, cols, builderOptionsDispatch),
      { initialProps: { enabled: false, cols: [] as TableColumn[] } }
    );

    // Toggle on while the schema is still empty (loading or fetch failed).
    hook.rerender({ enabled: true, cols: [] });
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);

    const payload = builderOptionsDispatch.mock.calls[0][0].payload;
    const dispatchedColumns: SelectedColumn[] = payload.columns;
    expect(dispatchedColumns.find((c) => c.hint === ColumnHint.TraceId)).toBeDefined();
    expect(payload.meta.tagsAreJSON).toBe(false);
  });

  it('stamps JSON via a correction once the schema loads after an empty toggle', async () => {
    // After the immediate empty-schema dispatch, JSON type detection is still
    // pending, so when the schema later arrives with JSON-typed tag columns a
    // second dispatch corrects the column types.
    const builderOptionsDispatch = jest.fn();
    const tagsName = testOtelVersion.traceColumnMap.get(ColumnHint.TraceTags)!;
    const serviceTagsName = testOtelVersion.traceColumnMap.get(ColumnHint.TraceServiceTags)!;

    type Props = { enabled: boolean; cols: TableColumn[] };
    const hook = renderHook(
      ({ enabled, cols }: Props) => useOtelColumns(enabled, testOtelVersion.version, cols, builderOptionsDispatch),
      { initialProps: { enabled: false, cols: [] as TableColumn[] } }
    );

    // Toggle on with an empty schema: immediate dispatch, no JSON types yet.
    hook.rerender({ enabled: true, cols: [] });
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);

    // Schema arrives with JSON-typed tags: a correction dispatch stamps JSON.
    hook.rerender({ enabled: true, cols: makeAllColumns({ [tagsName]: 'JSON', [serviceTagsName]: 'JSON' }) });
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(2);

    const correctedColumns: SelectedColumn[] = builderOptionsDispatch.mock.calls[1][0].payload.columns;
    expect(correctedColumns.find((c) => c.hint === ColumnHint.TraceTags)?.type).toBe('JSON');
    expect(correctedColumns.find((c) => c.hint === ColumnHint.TraceServiceTags)?.type).toBe('JSON');
  });

  it('should re-dispatch columns when otelVersion changes while OTel is enabled', async () => {
    // prevOtelVersion detects the version change and resets flags so the Effect
    // re-dispatches with the new version's column map.
    const builderOptionsDispatch = jest.fn();
    const versionA = testOtelVersion.version;
    const versionB = versionA + '-changed';

    // Make both version strings resolve to a valid config
    const getVersionSpy = jest
      .spyOn(otel, 'getVersion')
      .mockImplementation((v) => (v === versionA || v === versionB ? testOtelVersion : undefined));

    // Mount with OTel already enabled (saved query) — no dispatch expected
    const hook = renderHook(
      (version: string) => useOtelColumns(true, version, makeAllColumns(), builderOptionsDispatch),
      { initialProps: versionA }
    );
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);

    // Change version while OTel is on — flags reset, Effect dispatches new column map
    hook.rerender(versionB);
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);

    getVersionSpy.mockRestore();
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
      useDefaultTraceColumnsByName(traceTableColumns, 'traces', true, {}, false, builderOptionsDispatch)
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
        true,
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
    renderHook(() =>
      useDefaultTraceColumnsByName(traceTableColumns, 'traces', true, {}, true, builderOptionsDispatch)
    );
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('does nothing when allColumns is empty', () => {
    const builderOptionsDispatch = jest.fn();
    renderHook(() => useDefaultTraceColumnsByName([], 'traces', true, {}, false, builderOptionsDispatch));
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('does not fill empty slots on mount for a saved query', () => {
    const builderOptionsDispatch = jest.fn();
    // Conventional names are present, but the saved query has its slots
    // deliberately cleared. Opening the editor must not re-add them.
    renderHook(() =>
      useDefaultTraceColumnsByName(traceTableColumns, 'traces', false, {}, false, builderOptionsDispatch)
    );
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('fills empty slots when the table changes on a saved query', () => {
    const builderOptionsDispatch = jest.fn();
    const hook = renderHook(
      (table) => useDefaultTraceColumnsByName(traceTableColumns, table, false, {}, false, builderOptionsDispatch),
      { initialProps: 'traces' }
    );
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
    hook.rerender('other_traces');
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(7);
  });

  it('re-runs when the table changes', () => {
    const builderOptionsDispatch = jest.fn();
    const hook = renderHook(
      (table) => useDefaultTraceColumnsByName(traceTableColumns, table, true, {}, false, builderOptionsDispatch),
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

    renderHook(() => useDefaultTraceColumnsByName(cols, 'traces', true, {}, false, builderOptionsDispatch));

    const durationDispatch = builderOptionsDispatch.mock.calls.find(
      ([action]) => action?.payload?.column?.hint === ColumnHint.TraceDurationTime
    );
    expect(durationDispatch).toBeUndefined();
  });
});
