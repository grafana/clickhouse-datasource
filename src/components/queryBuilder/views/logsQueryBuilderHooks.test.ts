import { renderHook } from '@testing-library/react';
import {
  useDefaultFilters,
  useDefaultLogColumnsByName,
  useDefaultTimeColumn,
  useLogDefaultsOnMount,
  useOtelColumns,
} from './logsQueryBuilderHooks';
import { mockDatasource } from '__mocks__/datasource';
import { ColumnHint, QueryBuilderOptions, SelectedColumn, TableColumn } from 'types/queryBuilder';
import { setColumnByHint, setOptions } from 'hooks/useBuilderOptionsState';
import otel from 'otel';

describe('useLogDefaultsOnMount', () => {
  it('should call builderOptionsDispatch with default log columns', async () => {
    const builderOptionsDispatch = jest.fn();
    jest.spyOn(mockDatasource, 'shouldSelectLogContextColumns').mockReturnValue(false);
    // Should not be included, since shouldSelectLogContextColumns returns false
    jest.spyOn(mockDatasource, 'getLogContextColumnNames').mockReturnValue(['SampleColumn']);
    jest.spyOn(mockDatasource, 'getLogsOtelVersion').mockReturnValue(undefined);
    jest
      .spyOn(mockDatasource, 'getDefaultLogsColumns')
      .mockReturnValue(new Map<ColumnHint, string>([[ColumnHint.Time, 'timestamp']]));

    renderHook(() => useLogDefaultsOnMount(mockDatasource, true, {} as QueryBuilderOptions, builderOptionsDispatch));

    const expectedOptions = {
      database: expect.anything(),
      table: expect.anything(),
      columns: [{ name: 'timestamp', hint: ColumnHint.Time }],
      meta: {
        otelEnabled: expect.anything(),
        otelVersion: undefined,
      },
    };

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setOptions(expectedOptions)));
  });

  it('should call builderOptionsDispatch with default log columns, including log context columns', async () => {
    const builderOptionsDispatch = jest.fn();
    jest.spyOn(mockDatasource, 'shouldSelectLogContextColumns').mockReturnValue(true);
    // timestamp is included, but also provided as a Log Context column. It should only appear once.
    jest.spyOn(mockDatasource, 'getLogContextColumnNames').mockReturnValue(['timestamp', 'SampleColumn']);
    jest.spyOn(mockDatasource, 'getLogsOtelVersion').mockReturnValue(undefined);
    jest
      .spyOn(mockDatasource, 'getDefaultLogsColumns')
      .mockReturnValue(new Map<ColumnHint, string>([[ColumnHint.Time, 'timestamp']]));

    renderHook(() => useLogDefaultsOnMount(mockDatasource, true, {} as QueryBuilderOptions, builderOptionsDispatch));

    const expectedOptions = {
      database: expect.anything(),
      table: expect.anything(),
      columns: [{ name: 'timestamp', hint: ColumnHint.Time }, { name: 'SampleColumn' }],
      meta: {
        otelEnabled: expect.anything(),
        otelVersion: undefined,
      },
    };

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setOptions(expectedOptions)));
  });

  it('should not call builderOptionsDispatch after defaults are set', async () => {
    const builderOptions = {} as QueryBuilderOptions;
    const builderOptionsDispatch = jest.fn();

    const hook = renderHook(() => useLogDefaultsOnMount(mockDatasource, true, builderOptions, builderOptionsDispatch));
    hook.rerender();

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
  });

  it('should not call builderOptionsDispatch for existing query', async () => {
    const isNewQuery = false; // query already exists, is not new
    const builderOptionsDispatch = jest.fn();
    renderHook(() =>
      useLogDefaultsOnMount(mockDatasource, isNewQuery, {} as QueryBuilderOptions, builderOptionsDispatch)
    );

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });
});

describe('useOtelColumns', () => {
  const testOtelVersion = otel.getLatestVersion();

  it('should not call builderOptionsDispatch if OTEL is already enabled', async () => {
    jest.spyOn(mockDatasource, 'shouldSelectLogContextColumns').mockReturnValue(false);
    const builderOptionsDispatch = jest.fn();
    const allColumns: readonly TableColumn[] = [{ name: 'LogAttributes', type: 'Map(String, String)', picklistValues: [] }];

    renderHook(() => useOtelColumns(mockDatasource, allColumns, true, testOtelVersion.version, builderOptionsDispatch));

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('should not call builderOptionsDispatch if OTEL is disabled', async () => {
    jest.spyOn(mockDatasource, 'shouldSelectLogContextColumns').mockReturnValue(false);
    // Should not be included, since shouldSelectLogContextColumns returns false
    jest.spyOn(mockDatasource, 'getLogContextColumnNames').mockReturnValue(['SampleColumn']);
    const builderOptionsDispatch = jest.fn();
    const allColumns: readonly TableColumn[] = [{ name: 'LogAttributes', type: 'Map(String, String)', picklistValues: [] }];

    renderHook(() => useOtelColumns(mockDatasource, allColumns, true, testOtelVersion.version, builderOptionsDispatch));

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('should not call builderOptionsDispatch if allColumns is empty', async () => {
    jest.spyOn(mockDatasource, 'shouldSelectLogContextColumns').mockReturnValue(false);
    const builderOptionsDispatch = jest.fn();

    let otelEnabled = false;
    const hook = renderHook(
      (enabled) => useOtelColumns(mockDatasource, [], enabled, testOtelVersion.version, builderOptionsDispatch),
      { initialProps: otelEnabled }
    );
    otelEnabled = true;
    hook.rerender(otelEnabled);

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('should call builderOptionsDispatch with columns when OTEL is toggled on', async () => {
    jest.spyOn(mockDatasource, 'shouldSelectLogContextColumns').mockReturnValue(false);
    const builderOptionsDispatch = jest.fn();
    const allColumns: readonly TableColumn[] = [{ name: 'LogAttributes', type: 'Map(String, String)', picklistValues: [] }];

    let otelEnabled = false;
    const hook = renderHook(
      (enabled) => useOtelColumns(mockDatasource, allColumns, enabled, testOtelVersion.version, builderOptionsDispatch),
      { initialProps: otelEnabled }
    );
    otelEnabled = true;
    hook.rerender(otelEnabled);

    const columns: SelectedColumn[] = [];
    testOtelVersion.logColumnMap.forEach((v, k) => {
      columns.push({ name: v, hint: k, type: allColumns.find((c) => c.name === v)?.type });
    });
    const expectedOptions = { columns };

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setOptions(expectedOptions)));
  });

  it('should call builderOptionsDispatch with log context columns when auto-select is enabled', async () => {
    jest.spyOn(mockDatasource, 'shouldSelectLogContextColumns').mockReturnValue(true);
    // Timestamp is an OTel column, but also provided as a Log Context column. It should only appear once.
    jest.spyOn(mockDatasource, 'getLogContextColumnNames').mockReturnValue(['Timestamp', 'SampleColumn']);
    const builderOptionsDispatch = jest.fn();
    const allColumns: readonly TableColumn[] = [
      { name: 'LogAttributes', type: 'Map(String, String)', picklistValues: [] },
      { name: 'SampleColumn', type: 'String', picklistValues: [] },
    ];

    let otelEnabled = false;
    const hook = renderHook(
      (enabled) => useOtelColumns(mockDatasource, allColumns, enabled, testOtelVersion.version, builderOptionsDispatch),
      { initialProps: otelEnabled }
    );
    otelEnabled = true;
    hook.rerender(otelEnabled);

    const columns: SelectedColumn[] = [];
    testOtelVersion.logColumnMap.forEach((v, k) => {columns.push({ name: v, hint: k, type: allColumns.find((c) => c.name === v)?.type })});
    columns.push({ name: 'SampleColumn', type: allColumns.find((c) => c.name === 'SampleColumn')?.type });
    const expectedOptions = { columns };

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setOptions(expectedOptions)));
  });

  it('should not call builderOptionsDispatch after OTEL columns are set', async () => {
    jest.spyOn(mockDatasource, 'shouldSelectLogContextColumns').mockReturnValue(false);
    const builderOptionsDispatch = jest.fn();
    const allColumns: readonly TableColumn[] = [{ name: 'LogAttributes', type: 'Map(String, String)', picklistValues: [] }];

    let otelEnabled = false; // OTEL is off
    const hook = renderHook(
      (enabled) => useOtelColumns(mockDatasource, allColumns, enabled, testOtelVersion.version, builderOptionsDispatch),
      { initialProps: otelEnabled }
    );
    otelEnabled = true;
    hook.rerender(otelEnabled); // OTEL is on, columns are set
    hook.rerender(otelEnabled); // OTEL still on, should not set again

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
  });
});

describe('useDefaultTimeColumn', () => {
  it('should call builderOptionsDispatch when there are no configured defaults', async () => {
    const builderOptionsDispatch = jest.fn();
    const tableName = 'logs';
    const timeColumnName = 'time';
    jest.spyOn(mockDatasource, 'getDefaultLogsTable').mockReturnValue(undefined);
    const allColumns: readonly TableColumn[] = [{ name: timeColumnName, type: 'DateTime', picklistValues: [] }];
    const timeColumn = undefined;
    const otelEnabled = false;

    renderHook(() =>
      useDefaultTimeColumn(mockDatasource, allColumns, tableName, timeColumn, otelEnabled, builderOptionsDispatch)
    );

    const expectedColumn: SelectedColumn = { name: timeColumnName, type: 'DateTime', hint: ColumnHint.Time };
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setColumnByHint(expectedColumn)));
  });

  it('should not call builderOptionsDispatch when column is already set', async () => {
    const builderOptionsDispatch = jest.fn();
    const tableName = 'logs';
    const timeColumnName = 'time';
    jest.spyOn(mockDatasource, 'getDefaultLogsTable').mockReturnValue(tableName);
    jest
      .spyOn(mockDatasource, 'getDefaultLogsColumns')
      .mockReturnValue(new Map<ColumnHint, string>([[ColumnHint.Time, timeColumnName]]));
    const allColumns: readonly TableColumn[] = [{ name: timeColumnName, type: 'DateTime', picklistValues: [] }];
    const timeColumn: SelectedColumn = { name: timeColumnName, hint: ColumnHint.Time };
    const otelEnabled = false;

    renderHook(() =>
      useDefaultTimeColumn(mockDatasource, allColumns, tableName, timeColumn, otelEnabled, builderOptionsDispatch)
    );

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('should call builderOptionsDispatch when table changes', async () => {
    const builderOptionsDispatch = jest.fn();
    const tableName = 'logs';
    const timeColumnName = 'time';
    jest.spyOn(mockDatasource, 'getDefaultLogsTable').mockReturnValue(tableName);
    jest
      .spyOn(mockDatasource, 'getDefaultLogsColumns')
      .mockReturnValue(new Map<ColumnHint, string>([[ColumnHint.Time, timeColumnName]]));
    const allColumns: readonly TableColumn[] = [{ name: timeColumnName, type: 'DateTime', picklistValues: [] }];
    const timeColumn = undefined;
    const otelEnabled = false;

    const hook = renderHook(
      (table) =>
        useDefaultTimeColumn(mockDatasource, allColumns, table, timeColumn, otelEnabled, builderOptionsDispatch),
      { initialProps: tableName }
    );
    hook.rerender('other_logs');

    const expectedColumn: SelectedColumn = { name: timeColumnName, type: 'DateTime', hint: ColumnHint.Time };
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setColumnByHint(expectedColumn)));
  });

  it('prefers a conventionally-named DateTime column over the first DateTime column', async () => {
    const builderOptionsDispatch = jest.fn();
    jest.spyOn(mockDatasource, 'getDefaultLogsTable').mockReturnValue(undefined);
    const allColumns: readonly TableColumn[] = [
      { name: 'ingested_at', type: 'DateTime', picklistValues: [] },
      { name: 'timestamp', type: 'DateTime64(9)', picklistValues: [] },
      { name: 'other_date', type: 'Date', picklistValues: [] },
    ];

    renderHook(() =>
      useDefaultTimeColumn(mockDatasource, allColumns, 'logs', undefined, false, builderOptionsDispatch)
    );

    const expectedColumn: SelectedColumn = { name: 'timestamp', type: 'DateTime64(9)', hint: ColumnHint.Time };
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setColumnByHint(expectedColumn)));
  });

  it('falls back to the first DateTime column when no name matches the heuristic', async () => {
    const builderOptionsDispatch = jest.fn();
    jest.spyOn(mockDatasource, 'getDefaultLogsTable').mockReturnValue(undefined);
    const allColumns: readonly TableColumn[] = [
      { name: 'weird_name', type: 'DateTime', picklistValues: [] },
      { name: 'other_name', type: 'DateTime64(3)', picklistValues: [] },
    ];

    renderHook(() =>
      useDefaultTimeColumn(mockDatasource, allColumns, 'logs', undefined, false, builderOptionsDispatch)
    );

    const expectedColumn: SelectedColumn = { name: 'weird_name', type: 'DateTime', hint: ColumnHint.Time };
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setColumnByHint(expectedColumn)));
  });
});

describe('useDefaultLogColumnsByName', () => {
  it('fills the Message and Log Level slots from conventional column names', async () => {
    const builderOptionsDispatch = jest.fn();
    const allColumns: readonly TableColumn[] = [
      { name: 'timestamp', type: 'DateTime', picklistValues: [] },
      { name: 'message', type: 'String', picklistValues: [] },
      { name: 'level', type: 'LowCardinality(String)', picklistValues: [] },
    ];

    renderHook(() =>
      useDefaultLogColumnsByName(allColumns, 'logs', undefined, undefined, false, builderOptionsDispatch)
    );

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(2);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(
      expect.objectContaining(
        setColumnByHint({ name: 'message', type: 'String', hint: ColumnHint.LogMessage })
      )
    );
    expect(builderOptionsDispatch).toHaveBeenCalledWith(
      expect.objectContaining(
        setColumnByHint({ name: 'level', type: 'LowCardinality(String)', hint: ColumnHint.LogLevel })
      )
    );
  });

  it('does not overwrite a slot that is already set by the user', async () => {
    const builderOptionsDispatch = jest.fn();
    const allColumns: readonly TableColumn[] = [
      { name: 'message', type: 'String', picklistValues: [] },
      { name: 'level', type: 'String', picklistValues: [] },
    ];
    const userPickedMessage: SelectedColumn = { name: 'custom_msg', type: 'String', hint: ColumnHint.LogMessage };

    renderHook(() =>
      useDefaultLogColumnsByName(allColumns, 'logs', userPickedMessage, undefined, false, builderOptionsDispatch)
    );

    // Only Log Level should be filled; Message is preserved.
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(
      expect.objectContaining(setColumnByHint({ name: 'level', type: 'String', hint: ColumnHint.LogLevel }))
    );
  });

  it('does nothing when OTel mode is enabled', async () => {
    const builderOptionsDispatch = jest.fn();
    const allColumns: readonly TableColumn[] = [
      { name: 'Body', type: 'String', picklistValues: [] },
      { name: 'SeverityText', type: 'LowCardinality(String)', picklistValues: [] },
    ];

    renderHook(() =>
      useDefaultLogColumnsByName(allColumns, 'otel_logs', undefined, undefined, true, builderOptionsDispatch)
    );

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('does nothing when the table has no matching columns', async () => {
    const builderOptionsDispatch = jest.fn();
    const allColumns: readonly TableColumn[] = [
      { name: 'unrelated', type: 'String', picklistValues: [] },
    ];

    renderHook(() =>
      useDefaultLogColumnsByName(allColumns, 'logs', undefined, undefined, false, builderOptionsDispatch)
    );

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('re-runs on table change and fills empty slots for the new table', async () => {
    const builderOptionsDispatch = jest.fn();
    const allColumns: readonly TableColumn[] = [
      { name: 'body', type: 'String', picklistValues: [] },
      { name: 'severity', type: 'String', picklistValues: [] },
    ];

    const hook = renderHook(
      (table) => useDefaultLogColumnsByName(allColumns, table, undefined, undefined, false, builderOptionsDispatch),
      { initialProps: 'logs' }
    );
    // After the first render both slots are filled (2 dispatches). Changing the
    // table resets the per-table guard so another run fires.
    const initialCalls = builderOptionsDispatch.mock.calls.length;
    expect(initialCalls).toBe(2);
    hook.rerender('other_logs');
    expect(builderOptionsDispatch.mock.calls.length).toBeGreaterThan(initialCalls);
  });
});

describe('useDefaultFilters', () => {
  it('should call builderOptionsDispatch when query is new', async () => {
    const builderOptionsDispatch = jest.fn();
    const tableName = 'logs';
    const isNewQuery = true;

    renderHook(() => useDefaultFilters(tableName, isNewQuery, builderOptionsDispatch));

    const expectedOptions = {
      filters: [expect.anything(), expect.anything()],
      orderBy: [expect.anything(), expect.anything()],
    };
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setOptions(expectedOptions)));
  });

  it('should not call builderOptionsDispatch when query is not new', async () => {
    const builderOptionsDispatch = jest.fn();
    const tableName = 'logs';
    const isNewQuery = false;

    renderHook(() => useDefaultFilters(tableName, isNewQuery, builderOptionsDispatch));

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('should call builderOptionsDispatch when table changes', async () => {
    const builderOptionsDispatch = jest.fn();
    const tableName = 'logs';
    const isNewQuery = false;

    const hook = renderHook((table) => useDefaultFilters(table, isNewQuery, builderOptionsDispatch), {
      initialProps: tableName,
    });
    hook.rerender('other_logs');

    const expectedOptions = {
      filters: [expect.anything(), expect.anything()],
      orderBy: [expect.anything(), expect.anything()],
    };
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setOptions(expectedOptions)));
  });
});
