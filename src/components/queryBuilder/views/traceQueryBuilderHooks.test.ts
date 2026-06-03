import { renderHook } from '@testing-library/react';
import { useTraceDefaultsOnMount, useOtelColumns, useDefaultFilters } from './traceQueryBuilderHooks';
import { mockDatasource } from '__mocks__/datasource';
import { ColumnHint, QueryBuilderOptions, SelectedColumn, TableColumn } from 'types/queryBuilder';
import { setOptions } from 'hooks/useBuilderOptionsState';
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

  it('should defer dispatch until allColumns loads when OTel is toggled on', async () => {
    // When OTel is toggled on with empty allColumns (schema still loading),
    // no dispatch occurs. Once allColumns loads the Effect re-runs and dispatches once.
    const builderOptionsDispatch = jest.fn();

    type Props = { enabled: boolean; cols: TableColumn[] };
    const hook = renderHook(
      ({ enabled, cols }: Props) =>
        useOtelColumns(enabled, testOtelVersion.version, cols, builderOptionsDispatch),
      { initialProps: { enabled: false, cols: [] as TableColumn[] } }
    );

    // Toggle on but schema hasn't arrived yet
    hook.rerender({ enabled: true, cols: [] });
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);

    // Schema loads — single dispatch with correct tagsAreJSON
    hook.rerender({ enabled: true, cols: makeAllColumns() });
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
  });

  it('should re-dispatch columns when otelVersion changes while OTel is enabled', async () => {
    // prevOtelVersion detects the version change and resets flags so the Effect
    // re-dispatches with the new version's column map.
    const builderOptionsDispatch = jest.fn();
    const versionA = testOtelVersion.version;
    const versionB = versionA + '-changed';

    // Make both version strings resolve to a valid config
    const getVersionSpy = jest.spyOn(otel, 'getVersion').mockImplementation((v) =>
      v === versionA || v === versionB ? testOtelVersion : undefined
    );

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
