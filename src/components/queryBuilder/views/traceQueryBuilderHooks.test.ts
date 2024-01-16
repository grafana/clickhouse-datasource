import { renderHook } from '@testing-library/react';
import { useTraceDefaultsOnMount, useOtelColumns, useDefaultFilters } from './traceQueryBuilderHooks';
import { mockDatasource } from '__mocks__/datasource';
import { ColumnHint, QueryBuilderOptions, SelectedColumn } from 'types/queryBuilder';
import { setOptions } from 'hooks/useBuilderOptionsState';
import { versions as otelVersions } from 'otel';

describe('useTraceDefaultsOnMount', () => {
  it('should call builderOptionsDispatch with default trace columns', async () => {
    const builderOptionsDispatch = jest.fn();
    jest.spyOn(mockDatasource, 'getTraceOtelVersion').mockReturnValue(undefined);
    jest.spyOn(mockDatasource, 'getDefaultTraceColumns').mockReturnValue(new Map<ColumnHint, string>([[ColumnHint.Time, 'timestamp']]));

    renderHook(() => useTraceDefaultsOnMount(mockDatasource, true, {} as QueryBuilderOptions, builderOptionsDispatch));

    const expectedOptions = {
      database: expect.anything(),
      table: expect.anything(),
      columns: [{ name: 'timestamp', hint: ColumnHint.Time }],
      meta: {
        otelEnabled: expect.anything(),
        otelVersion: undefined,
        traceDurationUnit: expect.anything()
      }
    };

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setOptions(expectedOptions)));
  });

  it('should not call builderOptionsDispatch after defaults are set', async () => {
    const builderOptions = {} as QueryBuilderOptions;
    const builderOptionsDispatch = jest.fn();

    const hook = renderHook(() => useTraceDefaultsOnMount(mockDatasource, true, builderOptions, builderOptionsDispatch));
    hook.rerender();

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
  });

  it('should not call builderOptionsDispatch for existing query', async () => {
    const isNewQuery = false; // query already exists, is not new
    const builderOptionsDispatch = jest.fn();
    renderHook(() => useTraceDefaultsOnMount(mockDatasource, isNewQuery, {} as QueryBuilderOptions, builderOptionsDispatch));

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });
});

describe('useOtelColumns', () => {
  const testOtelVersion = otelVersions[0]; // use latest version

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
    const hook = renderHook(enabled => useOtelColumns(enabled, testOtelVersion.version, builderOptionsDispatch), { initialProps: otelEnabled });
    otelEnabled = true;
    hook.rerender(otelEnabled);

    const columns: SelectedColumn[] = [];
    testOtelVersion.traceColumnMap.forEach((v, k) => columns.push({ name: v, hint: k }));
    const expectedOptions = {
      columns,
      meta: {
        traceDurationUnit: expect.anything()
      }
    };

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setOptions(expectedOptions)));
  });

  it('should not call builderOptionsDispatch after OTEL columns are set', async () => {
    const builderOptionsDispatch = jest.fn();

    let otelEnabled = false; // OTEL is off
    const hook = renderHook(enabled => useOtelColumns(enabled, testOtelVersion.version, builderOptionsDispatch), { initialProps: otelEnabled });
    otelEnabled = true;
    hook.rerender(otelEnabled); // OTEL is on, columns are set
    hook.rerender(otelEnabled); // OTEL still on, should not set again

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
  });
});


describe('useDefaultFilters', () => {
  it('should not call builderOptionsDispatch when column/table are present on initial load', async () => {
    const builderOptionsDispatch = jest.fn();
    const tableName = 'timeseries';
    const timeColumn: SelectedColumn = { name: 'timestamp', hint: ColumnHint.Time };
    const filters: Filter[] = [];

    renderHook(() => useDefaultFilters(tableName, timeColumn, filters, builderOptionsDispatch));

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('should call builderOptionsDispatch when table changes', async () => {
    const builderOptionsDispatch = jest.fn();
    const tableName = 'timeseries';
    const timeColumn: SelectedColumn = { name: 'timestamp', hint: ColumnHint.Time };
    const filters: Filter[] = [];

    const hook = renderHook(table =>
      useDefaultFilters(table, timeColumn, filters, builderOptionsDispatch),
      { initialProps: tableName }
    );
    hook.rerender('other_timeseries');

    const expectedOptions = {
      filters: [expect.anything()],
    };
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setOptions(expectedOptions)));
  });

  it('should call builderOptionsDispatch when time column changes', async () => {
    const builderOptionsDispatch = jest.fn();
    const tableName = 'timeseries';
    const filters: Filter[] = [];

    const hook = renderHook(timeColumn =>
      useDefaultFilters(tableName, timeColumn, filters, builderOptionsDispatch),
      { initialProps: { name: 'timestamp', hint: ColumnHint.Time } }
    );
    hook.rerender({ name: 'other_timestamp', hint: ColumnHint.Time });

    const expectedOptions = {
      filters: [expect.anything()],
    };
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setOptions(expectedOptions)));
  });
});
