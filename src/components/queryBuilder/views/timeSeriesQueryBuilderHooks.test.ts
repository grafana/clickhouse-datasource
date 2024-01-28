import { renderHook } from '@testing-library/react';
import { useDefaultFilters, useDefaultTimeColumn } from './timeSeriesQueryBuilderHooks';
import { ColumnHint, SelectedColumn, TableColumn } from 'types/queryBuilder';
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
  it('should call builderOptionsDispatch when query is new', async () => {
    const builderOptionsDispatch = jest.fn();
    const tableName = 'timeseries';
    const isNewQuery = true;

    renderHook(() => useDefaultFilters(tableName, isNewQuery, builderOptionsDispatch));

    const expectedOptions = {
      filters: [expect.anything()],
      orderBy: [expect.anything()]
    };
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setOptions(expectedOptions)));
  });

  it('should not call builderOptionsDispatch when query is not new', async () => {
    const builderOptionsDispatch = jest.fn();
    const tableName = 'timeseries';
    const isNewQuery = false;

    renderHook(() => useDefaultFilters(tableName, isNewQuery, builderOptionsDispatch));

    expect(builderOptionsDispatch).toHaveBeenCalledTimes(0);
  });

  it('should call builderOptionsDispatch when table changes', async () => {
    const builderOptionsDispatch = jest.fn();
    const tableName = 'timeseries';
    const isNewQuery = false;

    const hook = renderHook(table =>
      useDefaultFilters(table, isNewQuery, builderOptionsDispatch),
      { initialProps: tableName }
    );
    hook.rerender('other_timeseries');

    const expectedOptions = {
      filters: [expect.anything()],
      orderBy: [expect.anything()]
    };
    expect(builderOptionsDispatch).toHaveBeenCalledTimes(1);
    expect(builderOptionsDispatch).toHaveBeenCalledWith(expect.objectContaining(setOptions(expectedOptions)));
  });
});
