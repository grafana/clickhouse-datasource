import { renderHook } from '@testing-library/react';
import { useDefaultFilters, useDefaultTimeColumn } from './timeSeriesQueryBuilderHooks';
import { ColumnHint, Filter, SelectedColumn, TableColumn } from 'types/queryBuilder';
import { setColumnByHint, setOptions } from 'hooks/useBuilderOptionsState';

describe('useDefaultTimeColumn', () => {
  it('should call builderOptionsDispatch when time column is unset', async () => {
    const builderOptionsDispatch = jest.fn();
    const tableName = 'timeseries';
    const timeColumnName = 'time';
    const allColumns: readonly TableColumn[] = [{ name: timeColumnName, type: 'DateTime', picklistValues: [] }];
    const timeColumn = undefined;

    renderHook(() => useDefaultTimeColumn(allColumns, tableName, timeColumn, builderOptionsDispatch));

    const expectedColumn: SelectedColumn = { name: timeColumnName, type: 'DateTime', hint: ColumnHint.Time };
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setColumnByHint(expectedColumn)));
  });

  it('should not call builderOptionsDispatch when time column is already set', async () => {
    const builderOptionsDispatch = jest.fn();
    const tableName = 'timeseries';
    const timeColumnName = 'time';
    const allColumns: readonly TableColumn[] = [{ name: timeColumnName, type: 'DateTime', picklistValues: [] }];
    const timeColumn: SelectedColumn = { name: timeColumnName, hint: ColumnHint.Time };

    renderHook(() => useDefaultTimeColumn(allColumns, tableName, timeColumn, builderOptionsDispatch));

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('should call builderOptionsDispatch when table changes', async () => {
    const builderOptionsDispatch = jest.fn();
    const tableName = 'timeseries';
    const timeColumnName = 'time';
    const allColumns: readonly TableColumn[] = [{ name: timeColumnName, type: 'DateTime', picklistValues: [] }];
    const timeColumn = undefined;

    renderHook(table => 
      useDefaultTimeColumn(
        allColumns,
        table,
        timeColumn,
        builderOptionsDispatch
      ),
      { initialProps: tableName }
    );

    const expectedColumn: SelectedColumn = { name: timeColumnName, type: 'DateTime', hint: ColumnHint.Time };
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setColumnByHint(expectedColumn)));
  });
});

describe('useDefaultFilters', () => {
  it('should not call builderOptionsDispatch when column/table are present on initial load', async () => {
    const builderOptionsDispatch = jest.fn();
    const tableName = 'timeseries';
    const filters: Filter[] = [];

    renderHook(() => useDefaultFilters(tableName, filters, builderOptionsDispatch));

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('should call builderOptionsDispatch when table changes', async () => {
    const builderOptionsDispatch = jest.fn();
    const tableName = 'timeseries';
    const filters: Filter[] = [];

    const hook = renderHook(table =>
      useDefaultFilters(table, filters, builderOptionsDispatch),
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
      useDefaultFilters(tableName, filters, builderOptionsDispatch),
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
