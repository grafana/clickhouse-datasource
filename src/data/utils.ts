import { CoreApp, DataFrame, DataQueryRequest, DataQueryResponse } from '@grafana/data';
import {
  ColumnHint,
  FilterOperator,
  OrderByDirection,
  QueryBuilderOptions,
  QueryType,
  SelectedColumn,
  StringFilter,
} from 'types/queryBuilder';
import { CHBuilderQuery, CHQuery, EditorType } from 'types/sql';
import { Datasource } from './CHDatasource';
import { pluginVersion } from 'utils/version';
import { logColumnHintsToAlias, generateSql } from './sqlGenerator';
import {
  canAutoAddWhereColumns,
  getAllQueriedColumns,
  getSelectColumnNames,
  getTableInfo,
  getWhereColumnNames,
} from './ast';
import otel from 'otel';

/**
 * Returns true if the builder options contain enough information to start showing a query
 */
export const isBuilderOptionsRunnable = (builderOptions: QueryBuilderOptions): boolean => {
  return (
    (builderOptions.columns?.length || 0) > 0 ||
    (builderOptions.filters?.length || 0) > 0 ||
    (builderOptions.orderBy?.length || 0) > 0 ||
    (builderOptions.aggregates?.length || 0) > 0 ||
    (builderOptions.groupBy?.length || 0) > 0
  );
};

/**
 * Converts QueryBuilderOptions to Grafana format
 * src: https://github.com/grafana/sqlds/blob/main/query.go#L20
 */
export const mapQueryBuilderOptionsToGrafanaFormat = (t?: QueryBuilderOptions): number => {
  switch (t?.queryType) {
    case QueryType.Table:
      return 1;
    case QueryType.Logs:
      return 2;
    case QueryType.TimeSeries:
      return 0;
    case QueryType.Traces:
      return t.meta?.isTraceIdMode ? 3 : 1;
    default:
      return 1 << 8; // an unused u32, defaults to timeseries/graph on plugin backend.
  }
};

/**
 * Converts QueryType to Grafana format
 * src: https://github.com/grafana/sqlds/blob/main/query.go#L20
 */
export const mapQueryTypeToGrafanaFormat = (t?: QueryType): number => {
  switch (t) {
    case QueryType.Table:
      return 1;
    case QueryType.Logs:
      return 2;
    case QueryType.TimeSeries:
      return 0;
    case QueryType.Traces:
      return 3;
    default:
      return 1 << 8; // an unused u32, defaults to timeseries/graph on plugin backend.
  }
};

/**
 * Converts Grafana format to builder QueryType
 * src: https://github.com/grafana/sqlds/blob/main/query.go#L20
 */
export const mapGrafanaFormatToQueryType = (f?: number): QueryType => {
  switch (f) {
    case 0:
      return QueryType.TimeSeries;
    case 1:
      return QueryType.Table;
    case 2:
      return QueryType.Logs;
    case 3:
      return QueryType.Traces;
    default:
      return QueryType.Table;
  }
};

/**
 * Manipulates column array in-place to include column hints, loosely matched by the provided column hint map.
 */
export const tryApplyColumnHints = (columns: SelectedColumn[], hintsToColumns?: Map<ColumnHint, string>) => {
  const columnsToHints: Map<string, ColumnHint> = new Map();
  if (hintsToColumns) {
    hintsToColumns.forEach((name, hint) => {
      columnsToHints.set(name.toLowerCase().trim(), hint);
    });
  }

  for (const column of columns) {
    if (column.hint) {
      continue;
    }

    const name = column.name.toLowerCase().trim();
    const alias = column.alias?.toLowerCase().trim() || '';

    const hint = columnsToHints.get(name) || columnsToHints.get(alias);
    if (hint) {
      column.hint = hint;
      continue;
    }

    if (name.includes('time')) {
      column.hint = ColumnHint.Time;
    }
  }
};

/**
 * Converts label into sql-style column name.
 * Example: "Test Column" -> "test_column"
 */
export const columnLabelToPlaceholder = (label: string) => label.toLowerCase().replace(/ /g, '_');

/**
 * Mutates the DataQueryResponse to include trace/log links on the traceID field.
 * The link will open a second query editor in split view
 * on the explore page with the selected trace ID.
 *
 * Requires defaults to be configured when crossing query types.
 */
export const transformQueryResponseWithTraceAndLogLinks = (
  datasource: Datasource,
  req: DataQueryRequest<CHQuery>,
  res: DataQueryResponse
): DataQueryResponse => {
  res.data.forEach((frame: DataFrame) => {
    const originalQuery = req.targets.find((t) => t.refId === frame.refId) as CHBuilderQuery;
    if (!originalQuery) {
      return;
    }

    const traceField = frame.fields.find(
      (field) => field.name.toLowerCase() === 'traceid' || field.name.toLowerCase() === 'trace_id'
    );
    if (!traceField) {
      return;
    }

    // Get the configured TraceId column name for use in both trace and logs queries
    const defaultLogsColumns = datasource.getDefaultLogsColumns();
    // Use traces config traceIdColumn if available, otherwise fallback to logs default
    const traceIdColumnName =
      datasource.getTracesTraceIdColumn() || defaultLogsColumns.get(ColumnHint.TraceId) || 'TraceId';

    const traceIdQuery: CHBuilderQuery = {
      datasource: datasource,
      editorType: EditorType.Builder,
      /**
       * Evil bug:
       * The rawSql value might contain time filters such as $__fromTime and $__toTime.
       * Grafana sees these time range filters as data links and will refuse to enable the traceID link if these are present.
       * Set rawSql to empty since it gets regenerated when the panel renders anyway.
       */
      rawSql: '',
      builderOptions: {} as QueryBuilderOptions,
      pluginVersion,
      refId: 'Trace ID',
    };

    if (
      originalQuery.editorType === EditorType.Builder &&
      originalQuery.builderOptions.queryType === QueryType.Traces
    ) {
      // Copy fields directly from trace search

      traceIdQuery.builderOptions = {
        ...originalQuery.builderOptions,
        filters: [], // Clear filters and orderBy since it's an exact ID lookup
        orderBy: [],
        meta: {
          ...originalQuery.builderOptions.meta,
          minimized: true,
          isTraceIdMode: true,
          traceId: '${__value.raw}',
        },
      };
    } else {
      // Create new query based on trace defaults

      const otelVersion = datasource.getTraceOtelVersion();
      const otelConfig = otel.getVersion(otelVersion);
      const traceEventsColumnPrefix = datasource.getDefaultTraceEventsColumnPrefix();
      const traceLinksColumnPrefix = datasource.getDefaultTraceLinksColumnPrefix();
      const options: QueryBuilderOptions = {
        database:
          datasource.getDefaultTraceDatabase() ||
          traceIdQuery.builderOptions.database ||
          datasource.getDefaultDatabase(),
        table: datasource.getDefaultTraceTable() || datasource.getDefaultTable() || traceIdQuery.builderOptions.table,
        queryType: QueryType.Traces,
        columns: [],
        filters: [],
        orderBy: [],
        meta: {
          minimized: true,
          isTraceIdMode: true,
          traceId: '${__value.raw}',
          traceDurationUnit: datasource.getDefaultTraceDurationUnit(),
          otelEnabled: Boolean(otelVersion),
          otelVersion: otelVersion,
          traceEventsColumnPrefix: traceEventsColumnPrefix,
          traceLinksColumnPrefix: traceLinksColumnPrefix,
        },
      };

      if (otelConfig?.traceColumnMap) {
        options.columns = Array.from(otelConfig.traceColumnMap, ([hint, name]) => ({ name, hint }));
      } else {
        const defaultColumns = datasource.getDefaultTraceColumns();
        for (let [hint, colName] of defaultColumns) {
          options.columns!.push({ name: colName, hint });
        }
      }

      traceIdQuery.builderOptions = options;
    }

    const traceLogsQuery: CHBuilderQuery = {
      datasource: datasource,
      editorType: EditorType.Builder,
      rawSql: '',
      builderOptions: {} as QueryBuilderOptions,
      pluginVersion,
      refId: 'Trace Logs',
    };

    if (originalQuery.editorType === EditorType.Builder && originalQuery.builderOptions.queryType === QueryType.Logs) {
      // Copy fields directly from log search
      traceLogsQuery.builderOptions = {
        ...originalQuery.builderOptions,
        filters: [
          {
            type: 'string',
            operator: FilterOperator.Equals,
            filterType: 'custom',
            key: traceIdColumnName,
            hint: ColumnHint.TraceId,
            condition: 'AND',
            value: '${__value.raw}',
          } as StringFilter,
        ],
        orderBy: [{ name: '', hint: ColumnHint.Time, dir: OrderByDirection.ASC }],
        meta: {
          ...originalQuery.builderOptions.meta,
          minimized: true,
        },
      };
    } else {
      // Create new query based on log defaults

      const otelVersion = datasource.getLogsOtelVersion();
      const options: QueryBuilderOptions = {
        database:
          datasource.getDefaultLogsDatabase() ||
          traceLogsQuery.builderOptions.database ||
          datasource.getDefaultDatabase(),
        table: datasource.getDefaultLogsTable() || datasource.getDefaultTable() || traceLogsQuery.builderOptions.table,
        queryType: QueryType.Logs,
        columns: [],
        orderBy: [{ name: '', hint: ColumnHint.Time, dir: OrderByDirection.ASC }],
        filters: [
          {
            type: 'string',
            operator: FilterOperator.Equals,
            filterType: 'custom',
            key: traceIdColumnName,
            hint: ColumnHint.TraceId,
            condition: 'AND',
            value: '${__value.raw}',
          } as StringFilter,
        ],
        meta: {
          minimized: true,
          otelEnabled: Boolean(otelVersion),
          otelVersion: otelVersion,
        },
      };

      for (let [hint, colName] of defaultLogsColumns) {
        options.columns!.push({ name: colName, hint });
      }

      // Ensure TraceId column is in the array so filter can find it via hint lookup
      if (!options.columns!.find((c) => c.hint === ColumnHint.TraceId)) {
        options.columns!.push({ name: traceIdColumnName, hint: ColumnHint.TraceId });
      }

      traceLogsQuery.builderOptions = options;
    }

    // Generate rawSql for Dashboard mode to preserve query through serialization
    const openInNewWindow = req.app !== CoreApp.Explore;
    if (openInNewWindow) {
      traceLogsQuery.rawSql = generateSql(traceLogsQuery.builderOptions || {});
    } else {
      traceLogsQuery.rawSql = '';
    }
    traceField.config.links = [];
    traceField.config.links!.push({
      title: 'View trace',
      targetBlank: openInNewWindow,
      url: '',
      internal: {
        query: traceIdQuery,
        datasourceUid: traceIdQuery.datasource?.uid!,
        datasourceName: traceIdQuery.datasource?.type!,
        panelsState: {
          trace: {
            spanId: '${__value.raw}',
          },
        },
      },
    });
    traceField.config.links!.push({
      title: 'View logs',
      targetBlank: openInNewWindow,
      url: '',
      internal: {
        query: traceLogsQuery,
        datasourceUid: traceLogsQuery.datasource?.uid!,
        datasourceName: traceLogsQuery.datasource?.type!,
      },
    });
  });

  return res;
};

/**
 * Returns true if the dataframe contains a log label that matches the provided name.
 *
 * This function exists for the logs panel, when clicking "filter for value" on a single log row.
 * A dataframe will be provided for that single row, and we need to check the labels object to see if it
 * contains a field with that name. If it does then we can create a filter using the labels column hint.
 */
export const dataFrameHasLogLabelWithName = (frame: DataFrame | undefined, name: string): boolean => {
  if (!frame || !frame.fields || frame.fields.length === 0) {
    return false;
  }

  const logLabelsFieldName = logColumnHintsToAlias.get(ColumnHint.LogLabels);
  const field = frame.fields.find((f) => f.name === logLabelsFieldName);
  if (!field || !field.values || field.values.length < 1 || !field.values.get(0)) {
    return false;
  }

  const labels = (field.values.get(0) || {}) as object;
  const labelKeys = Object.keys(labels);

  return labelKeys.includes(name);
};

/**
 * Extracts database and table name from a SQL query.
 * Uses AST parsing with regex fallback for robustness.
 */
export const extractTableFromSql = (sql: string): { database?: string; table?: string } | null => {
  // Try AST parsing first
  try {
    const astResult = getTableInfo(sql);
    if (astResult?.table) {
      return astResult;
    }
  } catch {
    // AST parsing failed, fall through to regex
  }

  // Regex fallback for cases AST can't handle (e.g., ClickHouse-specific syntax)
  const fromPattern = /\bFROM\s+(?:["'`]?(\w+)["'`]?\.)?["'`]?(\w+)["'`]?/i;
  const match = sql.match(fromPattern);

  if (match) {
    return {
      database: match[1] || undefined,
      table: match[2],
    };
  }
  return null;
};

/**
 * Extracts queried column names from a SQL statement.
 * Includes both SELECT and WHERE clause columns.
 * Uses AST parsing with regex fallback for robustness.
 */
export const extractColumnsFromSql = (sql: string): Set<string> => {
  // Try AST parsing first (includes both SELECT and WHERE columns)
  try {
    const astResult = getAllQueriedColumns(sql);
    // If AST returned results, use them
    if (astResult.size > 0) {
      return astResult;
    }
    // If SELECT *, AST correctly returned empty set
    if (sql.match(/SELECT\s+\*/i)) {
      return astResult;
    }
    // AST returned empty but query might have columns - fall through to regex
  } catch {
    // AST parsing failed, fall through to regex
  }

  // Regex fallback (SELECT columns only, no WHERE support for edge cases)
  const columns = new Set<string>();
  const selectMatch = sql.match(/\bSELECT\s+([\s\S]*?)\s+FROM\b/i);
  if (!selectMatch) {
    return columns;
  }

  const selectPart = selectMatch[1];
  if (selectPart.trim() === '*') {
    return columns;
  }

  const parts = selectPart.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    const colMatch = trimmed.match(/^["'`]?(\w+)["'`]?(?:\s|$)/);
    if (colMatch) {
      columns.add(colMatch[1]);
    }
  }

  return columns;
};

/**
 * Appends WHERE clause columns to the SELECT clause if safe to do so.
 * Skips if query has aggregate functions or GROUP BY (would cause SQL errors).
 * Returns the original SQL if modification is not possible or not needed.
 */
export const appendWhereColumnsToSelect = (sql: string): string => {
  // Check if it's safe to add columns (no aggregates, no GROUP BY)
  try {
    if (!canAutoAddWhereColumns(sql)) {
      return sql;
    }
  } catch {
    // AST parsing failed, return original SQL
    return sql;
  }

  // Get columns from SELECT and WHERE
  let selectColumns: Set<string>;
  let whereColumns: Set<string>;

  try {
    selectColumns = getSelectColumnNames(sql);
    whereColumns = getWhereColumnNames(sql);
  } catch {
    // AST parsing failed, return original SQL
    return sql;
  }

  // If SELECT * or no WHERE columns, nothing to add
  if (selectColumns.size === 0 || whereColumns.size === 0) {
    return sql;
  }

  // Find WHERE columns not already in SELECT
  const columnsToAdd = [...whereColumns].filter((col) => !selectColumns.has(col));
  if (columnsToAdd.length === 0) {
    return sql;
  }

  // Insert columns before FROM clause
  // Match: SELECT ... FROM (case insensitive)
  const fromMatch = sql.match(/(\bFROM\b)/i);
  if (!fromMatch || fromMatch.index === undefined) {
    return sql;
  }

  const beforeFrom = sql.substring(0, fromMatch.index).trimEnd();
  const fromAndAfter = sql.substring(fromMatch.index);

  // Add columns with comma separator
  const newColumns = columnsToAdd.join(', ');
  return `${beforeFrom}, ${newColumns} ${fromAndAfter}`;
};
