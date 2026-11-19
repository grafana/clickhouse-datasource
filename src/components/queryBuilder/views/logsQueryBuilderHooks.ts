import { Datasource } from 'data/CHDatasource';
import { BuilderOptionsReducerAction, setColumnByHint, setOptions } from 'hooks/useBuilderOptionsState';
import { useEffect, useMemo, useRef } from 'react';
import { ColumnHint, QueryBuilderOptions, SelectedColumn, TableColumn } from 'types/queryBuilder';
import otel from 'otel';
import useTableKeys from 'hooks/useTableKeys';
import { findColumnByNameHeuristic, isDateTimeColumn, isStringLikeColumn } from './columnNameHeuristics';
import { getDefaultLogsFilters, getDefaultLogsOrderBy } from '../defaultQueryOptions';
import { appendAdditionalLogColumns } from '../compactQueryDefaults';

/**
 * The columns a new logs query on the configured logs table starts with: the configured role columns,
 * the log context columns when "Auto-Select Columns" is on, and the extra default columns. Pass the
 * table's columns when they are loaded, so the extra columns carry their types.
 */
export const buildDefaultLogsColumns = (
  datasource: Datasource,
  allColumns: readonly TableColumn[] = []
): SelectedColumn[] => {
  const columns: SelectedColumn[] = [];
  const includedColumns = new Set<string>();
  for (let [hint, colName] of datasource.getDefaultLogsColumns()) {
    columns.push({ name: colName, hint });
    includedColumns.add(colName);
  }

  if (datasource.shouldSelectLogContextColumns()) {
    for (let columnName of datasource.getLogContextColumnNames()) {
      // Excludes columns already added, and maps that contain the selected key (such as "ResourceAttributes['x']")
      if (includedColumns.has(columnName) || includedColumns.has(columnName.split('[')[0])) {
        continue;
      }

      columns.push({ name: columnName });
      includedColumns.add(columnName);
    }
  }

  // Extra fields configured via the Columns setting. Pass the fetched schema (when it is loaded)
  // so each column carries its type; the fold uses that to skip collection- and date-typed columns.
  appendAdditionalLogColumns(datasource, allColumns, columns, includedColumns);
  return columns;
};

/**
 * Loads the default configuration for new queries. (Only runs on new queries)
 */
export const useLogDefaultsOnMount = (
  datasource: Datasource,
  isNewQuery: boolean,
  builderOptions: QueryBuilderOptions,
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>,
  allColumns: readonly TableColumn[] = []
) => {
  const didSetDefaults = useRef<boolean>(false);
  useEffect(() => {
    if (!isNewQuery || didSetDefaults.current) {
      return;
    }

    const defaultDb = datasource.getDefaultLogsDatabase() || datasource.getDefaultDatabase();
    const defaultTable = datasource.getDefaultLogsTable() || datasource.getDefaultTable();
    const otelVersion = datasource.getLogsOtelVersion();

    builderOptionsDispatch(
      setOptions({
        database: defaultDb,
        table: defaultTable || builderOptions.table,
        columns: buildDefaultLogsColumns(datasource, allColumns),
        meta: {
          otelEnabled: Boolean(otelVersion),
          otelVersion,
        },
      })
    );
    didSetDefaults.current = true;
  }, [
    allColumns,
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
 * Does not run if OTEL is already enabled, only when the toggle or the
 * selected schema version changes.
 */
export const useOtelColumns = (
  datasource: Datasource,
  allColumns: readonly TableColumn[],
  otelEnabled: boolean,
  otelVersion: string,
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>,
  database: string,
  table: string
) => {
  const didSetColumns = useRef<boolean>(otelEnabled);
  const prevOtelVersion = useRef<string>(otelVersion);
  if (!otelEnabled) {
    didSetColumns.current = false;
    prevOtelVersion.current = otelVersion;
  } else if (otelVersion !== prevOtelVersion.current) {
    // Version changed while OTel is on: reset the flag so the Effect re-applies
    // the new version's column map ('latest' re-runs auto-detection).
    didSetColumns.current = false;
    prevOtelVersion.current = otelVersion;
  }
  const detectsVersion = otelEnabled && !didSetColumns.current && otel.getVersion(otelVersion)?.version === 'latest';
  const tableKeys = useTableKeys(datasource, database, detectsVersion ? table : '');

  useEffect(() => {
    if (!otelEnabled || didSetColumns.current || allColumns.length === 0 || tableKeys === undefined) {
      return;
    }

    let otelConfig = otel.getVersion(otelVersion);
    // The "latest" alias resolves against the actual table instead of a fixed
    // schema: pre-v0.151.0 collector tables keep their TimestampTime column,
    // newer ones don't, and both exist in the wild (see #1900). The table keys
    // refine that check (see detectLogsVersion).
    // Pinned versions (1.29.0, 1.30.0, ...) are honoured as-is.
    if (otelConfig?.version === 'latest') {
      otelConfig = otel.detectLogsVersion(
        allColumns.map((c) => c.name),
        tableKeys ?? undefined
      );
    }
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

    // Extra fields configured in Default columns (all detected scalars, or an explicit list).
    appendAdditionalLogColumns(datasource, allColumns, columns, includedColumns);

    builderOptionsDispatch(setOptions({ columns }));
    didSetColumns.current = true;
  }, [datasource, allColumns, otelEnabled, otelVersion, builderOptionsDispatch, tableKeys]);
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
    // column if nothing matches. This keeps existing behavior for schemas that
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
 *   - the query is new, or the current table has changed since last run, and
 *   - the role slot is still empty (never overwrites explicit user picks).
 *
 * Saved queries never auto-fill on mount: a deliberately cleared slot must
 * stay cleared, otherwise opening the panel editor would silently mutate the
 * saved query model.
 *
 * The Time role is handled separately by `useDefaultTimeColumn` so the two
 * stay independently testable and the Time fallback behavior is preserved.
 */
export const useDefaultLogColumnsByName = (
  allColumns: readonly TableColumn[],
  table: string,
  isNewQuery: boolean,
  messageColumn: SelectedColumn | undefined,
  logLevelColumn: SelectedColumn | undefined,
  otelEnabled: boolean,
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>
) => {
  const lastTable = useRef<string>(table || '');
  const didRun = useRef<boolean>(!isNewQuery);
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
        builderOptionsDispatch(setColumnByHint({ name: match.name, type: match.type, hint: ColumnHint.LogMessage }));
      }
    }

    if (!logLevelColumn) {
      const match = findColumnByNameHeuristic(allColumns, ColumnHint.LogLevel, isStringLikeColumn);
      if (match) {
        builderOptionsDispatch(setColumnByHint({ name: match.name, type: match.type, hint: ColumnHint.LogLevel }));
      }
    }

    lastTable.current = table;
    didRun.current = true;
  }, [allColumns, table, messageColumn, logLevelColumn, otelEnabled, builderOptionsDispatch]);
};

// Apply default filters to a new query once it has a table; a table change keeps the query's filters
export const useDefaultFilters = (
  table: string,
  isNewQuery: boolean,
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>
) => {
  const appliedDefaultFilters = useRef<boolean>(!isNewQuery);

  useEffect(() => {
    if (!table || appliedDefaultFilters.current) {
      return;
    }

    appliedDefaultFilters.current = true;
    builderOptionsDispatch(
      setOptions({
        filters: getDefaultLogsFilters(),
        orderBy: getDefaultLogsOrderBy(),
      })
    );
  }, [table, builderOptionsDispatch]);
};
