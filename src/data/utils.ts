import { CoreApp, DataFrame, DataQueryRequest, DataQueryResponse } from "@grafana/data";
import { ColumnHint, FilterOperator, OrderByDirection, QueryBuilderOptions, QueryType, SelectedColumn, StringFilter } from "types/queryBuilder"
import { CHBuilderQuery, CHQuery, EditorType } from "types/sql";
import { Datasource } from "./CHDatasource";
import { pluginVersion } from "utils/version";
import { logColumnHintsToAlias } from "./sqlGenerator";

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
export const transformQueryResponseWithTraceAndLogLinks = (datasource: Datasource, req: DataQueryRequest<CHQuery>, res: DataQueryResponse): DataQueryResponse => {
  res.data.forEach((frame: DataFrame) => {
    const originalQuery = req.targets.find(t => t.refId === frame.refId) as CHBuilderQuery;
    if (!originalQuery) {
      return;
    }

    const traceField = frame.fields.find(field => field.name.toLowerCase() === 'traceid' || field.name.toLowerCase() === 'trace_id');
    if (!traceField) {
      return;
    }

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
      refId: 'Trace ID'
    };

    if (originalQuery.editorType === EditorType.Builder && originalQuery.builderOptions.queryType === QueryType.Traces) {
      // Copy fields directly from trace search

      traceIdQuery.builderOptions = {
        ...originalQuery.builderOptions,
        filters: [], // Clear filters and orderBy since it's an exact ID lookup
        orderBy: [],
        meta: {
          ...originalQuery.builderOptions.meta,
          minimized: true,
          isTraceIdMode: true,
          traceId: '${__value.raw}'
        }
      };
    } else {
      // Create new query based on trace defaults

      const otelVersion = datasource.getTraceOtelVersion();
      const options: QueryBuilderOptions = {
        database: datasource.getDefaultTraceDatabase() || traceIdQuery.builderOptions.database || datasource.getDefaultDatabase(),
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
        }
      };

      const defaultColumns = datasource.getDefaultTraceColumns();
      for (let [hint, colName] of defaultColumns) {
        options.columns!.push({ name: colName, hint });
      }

      traceIdQuery.builderOptions = options;
    }

    const traceLogsQuery: CHBuilderQuery = {
      datasource: datasource,
      editorType: EditorType.Builder,
      rawSql: '',
      builderOptions: {} as QueryBuilderOptions,
      pluginVersion,
      refId: 'Trace Logs'
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
            key: '',
            hint: ColumnHint.TraceId,
            condition: 'AND',
            value: '${__value.raw}'
          } as StringFilter
        ],
        orderBy: [{ name: '', hint: ColumnHint.Time, dir: OrderByDirection.ASC }],
        meta: {
          ...originalQuery.builderOptions.meta,
          minimized: true,
        }
      };
    } else {
      // Create new query based on log defaults

      const otelVersion = datasource.getLogsOtelVersion();
      const options: QueryBuilderOptions = {
        database: datasource.getDefaultLogsDatabase() || traceLogsQuery.builderOptions.database || datasource.getDefaultDatabase(),
        table: datasource.getDefaultLogsTable() || datasource.getDefaultTable() || traceLogsQuery.builderOptions.table,
        queryType: QueryType.Logs,
        columns: [],
        orderBy: [{ name: '', hint: ColumnHint.Time, dir: OrderByDirection.ASC }],
        filters: [
          {
            type: 'string',
            operator: FilterOperator.Equals,
            filterType: 'custom',
            key: '',
            hint: ColumnHint.TraceId,
            condition: 'AND',
            value: '${__value.raw}'
          } as StringFilter
        ],
        meta: {
          minimized: true,
          otelEnabled: Boolean(otelVersion),
          otelVersion: otelVersion,
        }
      };

      const defaultColumns = datasource.getDefaultLogsColumns();
      for (let [hint, colName] of defaultColumns) {
        options.columns!.push({ name: colName, hint });
      }

      traceLogsQuery.builderOptions = options;
    }

    const openInNewWindow = req.app !== CoreApp.Explore;
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
            spanId: '${__value.raw}'
          }
        }
      }
    });
    traceField.config.links!.push({
      title: 'View logs',
      targetBlank: openInNewWindow,
      url: '',
      internal: {
        query: traceLogsQuery,
        datasourceUid: traceLogsQuery.datasource?.uid!,
        datasourceName: traceLogsQuery.datasource?.type!,
      }
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
  const field = frame.fields.find(f => f.name === logLabelsFieldName);
  if (!field || !field.values || field.values.length < 1 || !field.values.get(0)) {
    return false;
  }

  const labels = (field.values.get(0) || {}) as object;
  const labelKeys = Object.keys(labels);

  return labelKeys.includes(name);
}
