import { Datasource } from 'data/CHDatasource';
import { BuilderOptionsReducerAction, setColumnByHint, setOptions } from 'hooks/useBuilderOptionsState';
import { useEffect, useMemo, useRef } from 'react';
import {
  ColumnHint,
  DateFilterWithoutValue,
  Filter,
  FilterOperator,
  OrderBy,
  OrderByDirection,
  QueryBuilderOptions,
  SelectedColumn,
  StringFilter,
  TableColumn,
} from 'types/queryBuilder';
import otel from 'otel';
import { findColumnByNameHeuristic, isDateTimeColumn, isStringLikeColumn } from './columnNameHeuristics';

/**
 * Loads the default configuration for new queries. (Only runs on new queries)
 */
export const useLogDefaultsOnMount = (
  datasource: Datasource,
  isNewQuery: boolean,
  builderOptions: QueryBuilderOptions,
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>
) => {
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
        // Excludes columns already added, and maps that contain the selected key (such as "ResourceAttributes['x']")
        if (includedColumns.has(columnName) || includedColumns.has(columnName.split('[')[0])) {
          continue;
        }

        nextColumns.push({ name: columnName });
        includedColumns.add(columnName);
      }
    }

    builderOptionsDispatch(
      setOptions({
        database: defaultDb,
        table: defaultTable || builderOptions.table,
        columns: nextColumns,
        meta: {
          otelEnabled: Boolean(otelVersion),
          otelVersion,
        },
      })
    );
    didSetDefaults.current = true;
  }, [
    builderOptions.columns,
    builderOptions.orderBy,
    builderOptions.table,
    builderOptionsDispatch,
    datasource,
    isNewQuery,
  ]);
};

/**
 * Sets OTEL Logs columns automatically when OTEL is enabled.
 * Does not run if OTEL is already enabled, only when it's changed.
 */
export const useOtelColumns = (
  datasource: Datasource,
  allColumns: readonly TableColumn[],
  otelEnabled: boolean,
  otelVersion: string,
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>
) => {
  const didSetColumns = useRef<boolean>(otelEnabled);
  if (!otelEnabled) {
    didSetColumns.current = false;
  }

  useEffect(() => {
    if (!otelEnabled || didSetColumns.current || allColumns.length === 0) {
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
      columns.push({ name, hint, type: allColumns.find((c) => c.name === name)?.type });
      includedColumns.add(name);
    });

    if (datasource.shouldSelectLogContextColumns()) {
      const contextColumnNames = datasource.getLogContextColumnNames();

      for (let columnName of contextColumnNames) {
        // Excludes columns already added, and maps that contain the selected key (such as "ResourceAttributes['x']")
        if (includedColumns.has(columnName) || includedColumns.has(columnName.split('[')[0])) {
          continue;
        }

        columns.push({ name: columnName, type: allColumns.find((c) => c.name === columnName)?.type });
        includedColumns.add(columnName);
      }
    }

    builderOptionsDispatch(setOptions({ columns }));
    didSetColumns.current = true;
  }, [datasource, allColumns, otelEnabled, otelVersion, builderOptionsDispatch]);
};

// Finds and selects a default log time column, updates when table changes
export const useDefaultTimeColumn = (
  datasource: Datasource,
  allColumns: readonly TableColumn[],
  table: string,
  timeColumn: SelectedColumn | undefined,
  otelEnabled: boolean,
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>
) => {
  const hasDefaultColumnConfigured = useMemo(
    () => Boolean(datasource.getDefaultLogsTable()) && datasource.getDefaultLogsColumns().has(ColumnHint.Time),
    [datasource]
  );
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

    // Prefer a DateTime column whose name matches a common timestamp convention
    // (timestamp, event_time, created_at, ...); fall back to the first DateTime
    // column if nothing matches. This keeps existing behaviour for schemas that
    // use unusual names while auto-picking the right column for conventional ones.
    const dateTimeColumns = allColumns.filter((c) => isDateTimeColumn(c));
    const col = findColumnByNameHeuristic(dateTimeColumns, ColumnHint.Time) || dateTimeColumns[0];
    if (!col) {
      return;
    }

    const timeColumn: SelectedColumn = {
      name: col.name,
      type: col.type,
      hint: ColumnHint.Time,
    };

    builderOptionsDispatch(setColumnByHint(timeColumn));
    lastTable.current = table;
    didSetDefaultTime.current = true;
  }, [datasource, allColumns, table, builderOptionsDispatch]);
};

/**
 * Fills the Message and Log Level role slots from common non-OTel column names
 * (message, body, log_message; level, severity, severity_text, ...) when:
 *   - OTel mode is off (OTel has its own detection path),
 *   - the current table has changed since last run, and
 *   - the role slot is still empty (never overwrites explicit user picks).
 *
 * The Time role is handled separately by `useDefaultTimeColumn` so the two
 * stay independently testable and the Time fallback behaviour is preserved.
 */
export const useDefaultLogColumnsByName = (
  allColumns: readonly TableColumn[],
  table: string,
  messageColumn: SelectedColumn | undefined,
  logLevelColumn: SelectedColumn | undefined,
  otelEnabled: boolean,
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>
) => {
  const lastTable = useRef<string>(table || '');
  const didRun = useRef<boolean>(false);
  if (table !== lastTable.current) {
    didRun.current = false;
  }

  useEffect(() => {
    if (otelEnabled || didRun.current || !table || allColumns.length === 0) {
      return;
    }

    if (!messageColumn) {
      const match = findColumnByNameHeuristic(allColumns, ColumnHint.LogMessage, isStringLikeColumn);
      if (match) {
        builderOptionsDispatch(
          setColumnByHint({ name: match.name, type: match.type, hint: ColumnHint.LogMessage })
        );
      }
    }

    if (!logLevelColumn) {
      const match = findColumnByNameHeuristic(allColumns, ColumnHint.LogLevel, isStringLikeColumn);
      if (match) {
        builderOptionsDispatch(
          setColumnByHint({ name: match.name, type: match.type, hint: ColumnHint.LogLevel })
        );
      }
    }

    lastTable.current = table;
    didRun.current = true;
  }, [allColumns, table, messageColumn, logLevelColumn, otelEnabled, builderOptionsDispatch]);
};

// Apply default filters/orderBy on table change
export const useDefaultFilters = (
  table: string,
  isNewQuery: boolean,
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>
) => {
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
        hint: ColumnHint.FilterTime,
        condition: 'AND',
      } as DateFilterWithoutValue,
      {
        type: 'string',
        operator: FilterOperator.IsAnything,
        filterType: 'custom',
        key: '',
        hint: ColumnHint.LogLevel,
        condition: 'AND',
      } as StringFilter,
    ];

    const defaultOrderBy: OrderBy[] = [
      { name: '', hint: ColumnHint.FilterTime, dir: OrderByDirection.DESC, default: true },
      { name: '', hint: ColumnHint.Time, dir: OrderByDirection.DESC, default: true }
    ];

    lastTable.current = table;
    appliedDefaultFilters.current = true;
    builderOptionsDispatch(
      setOptions({
        filters: defaultFilters,
        orderBy: defaultOrderBy,
      })
    );
  }, [table, builderOptionsDispatch]);
};
