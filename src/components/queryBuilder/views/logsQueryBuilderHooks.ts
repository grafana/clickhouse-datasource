import { Datasource } from "data/CHDatasource";
import { columnFilterDateTime } from "data/columnFilters";
import { BuilderOptionsReducerAction, setColumnByHint, setOptions } from "hooks/useBuilderOptionsState";
import { useEffect, useMemo, useRef } from "react";
import { ColumnHint, DateFilterWithoutValue, Filter, FilterOperator, OrderBy, OrderByDirection, QueryBuilderOptions, SelectedColumn, StringFilter, TableColumn } from "types/queryBuilder";
import otel from 'otel';

/**
 * Loads the default configuration for new queries. (Only runs on new queries)
 */
export const useLogDefaultsOnMount = (datasource: Datasource, isNewQuery: boolean, builderOptions: QueryBuilderOptions, builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>) => {
  const didSetDefaults = useRef<boolean>(false);
  useEffect(() => {
    if (!isNewQuery || didSetDefaults.current) {
      return;
    }

    const defaultDb = datasource.getDefaultLogsDatabase() || datasource.getDefaultDatabase();
    const defaultTable = datasource.getDefaultLogsTable() || datasource.getDefaultTable();
    const otelVersion = datasource.getLogsOtelVersion();
    const defaultColumns = datasource.getDefaultLogsColumns();

    const nextColumns: SelectedColumn[] = [];
    const includedColumns = new Set<string>();
    for (let [hint, colName] of defaultColumns) {
      nextColumns.push({ name: colName, hint });
      includedColumns.add(colName);
    }

    if (datasource.shouldSelectLogContextColumns()) {
      const contextColumnNames = datasource.getLogContextColumnNames();

      for (let columnName of contextColumnNames) {
        if (includedColumns.has(columnName)) {
          continue;
        }

        nextColumns.push({ name: columnName });
        includedColumns.add(columnName);
      }
    }

    builderOptionsDispatch(setOptions({
      database: defaultDb,
      table: defaultTable || builderOptions.table,
      columns: nextColumns,
      meta: {
        otelEnabled: Boolean(otelVersion),
        otelVersion,
      }
    }));
    didSetDefaults.current = true;
  }, [builderOptions.columns, builderOptions.orderBy, builderOptions.table, builderOptionsDispatch, datasource, isNewQuery]);
};

/**
 * Sets OTEL Logs columns automatically when OTEL is enabled.
 * Does not run if OTEL is already enabled, only when it's changed.
 */
export const useOtelColumns = (datasource: Datasource, otelEnabled: boolean, otelVersion: string, builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>) => {
  const didSetColumns = useRef<boolean>(otelEnabled);
  if (!otelEnabled) {
    didSetColumns.current = false;
  }

  useEffect(() => {
    if (!otelEnabled || didSetColumns.current) {
      return;
    }

    const otelConfig = otel.getVersion(otelVersion);
    const logColumnMap = otelConfig?.logColumnMap;
    if (!logColumnMap) {
      return;
    }

    const columns: SelectedColumn[] = [];
    const includedColumns = new Set<string>();
    logColumnMap.forEach((name, hint) => {
      columns.push({ name, hint });
      includedColumns.add(name);
    });

    if (datasource.shouldSelectLogContextColumns()) {
      const contextColumnNames = datasource.getLogContextColumnNames();

      for (let columnName of contextColumnNames) {
        if (includedColumns.has(columnName)) {
          continue;
        }

        columns.push({ name: columnName });
        includedColumns.add(columnName);
      }
    }

    builderOptionsDispatch(setOptions({ columns }));
    didSetColumns.current = true;
  }, [datasource, otelEnabled, otelVersion, builderOptionsDispatch]);
};

// Finds and selects a default log time column, updates when table changes
export const useDefaultTimeColumn = (datasource: Datasource, allColumns: readonly TableColumn[], table: string, timeColumn: SelectedColumn | undefined, otelEnabled: boolean, builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>) => {
  const hasDefaultColumnConfigured = useMemo(() => Boolean(datasource.getDefaultLogsTable()) && datasource.getDefaultLogsColumns().has(ColumnHint.Time), [datasource]);
  const didSetDefaultTime = useRef<boolean>(Boolean(timeColumn) || hasDefaultColumnConfigured);
  const lastTable = useRef<string>(table || '');
  if (table !== lastTable.current) {
    didSetDefaultTime.current = false;
  }

  if (Boolean(timeColumn) || otelEnabled) {
    lastTable.current = table;
    didSetDefaultTime.current = true;
  }

  useEffect(() => {
    if (didSetDefaultTime.current || allColumns.length === 0 || !table) {
      return;
    }

    const col = allColumns.filter(columnFilterDateTime)[0];
    if (!col) {
      return;
    }

    const timeColumn: SelectedColumn = {
      name: col.name,
      type: col.type,
      hint: ColumnHint.Time
    };

    builderOptionsDispatch(setColumnByHint(timeColumn));
    lastTable.current = table;
    didSetDefaultTime.current = true;
  }, [datasource, allColumns, table, builderOptionsDispatch]);
};

// Apply default filters/orderBy on table change
export const useDefaultFilters = (table: string, isNewQuery: boolean, builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>) => {
  const appliedDefaultFilters = useRef<boolean>(!isNewQuery);
  const lastTable = useRef<string>(table || '');
  if (table !== lastTable.current) {
    appliedDefaultFilters.current = false;
  }

  useEffect(() => {
    if (!table || appliedDefaultFilters.current) {
      return;
    }

    const defaultFilters: Filter[] = [
      {
        type: 'datetime',
        operator: FilterOperator.WithInGrafanaTimeRange,
        filterType: 'custom',
        key: '',
        hint: ColumnHint.Time,
        condition: 'AND'
      } as DateFilterWithoutValue,
      {
        type: 'string',
        operator: FilterOperator.IsAnything,
        filterType: 'custom',
        key: '',
        hint: ColumnHint.LogLevel,
        condition: 'AND'
      } as StringFilter,
    ];

    const defaultOrderBy: OrderBy[] = [
      { name: '', hint: ColumnHint.Time, dir: OrderByDirection.DESC, default: true }
    ];
    
    lastTable.current = table;
    appliedDefaultFilters.current = true;
    builderOptionsDispatch(setOptions({
      filters: defaultFilters,
      orderBy: defaultOrderBy
    }));
  }, [table, builderOptionsDispatch]);
};
