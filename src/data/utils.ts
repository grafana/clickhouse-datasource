import { CoreApp, DataFrame, DataQueryRequest, DataQueryResponse } from "@grafana/data";
import { QueryBuilderOptions, QueryType } from "types/queryBuilder"
import { CHBuilderQuery, CHQuery, EditorType } from "types/sql";

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
 * Converts label into sql-style column name.
 * Example: "Test Column" -> "test_column"
 */
export const columnLabelToPlaceholder = (label: string) => label.toLowerCase().replace(/ /g, '_');

/**
 * Mutates the DataQueryResponse to include links on the traceID field.
 * The link will open a second query editor in split view
 * on the explore page with the selected trace ID.
 */
export const transformQueryResponseWithTraceLinks = (req: DataQueryRequest<CHQuery>, res: DataQueryResponse): DataQueryResponse => {
  res.data.forEach((frame: DataFrame) => {
    const originalQuery = req.targets.find(t => t.refId === frame.refId) as CHBuilderQuery;
    const originalQueryValid = originalQuery && originalQuery.editorType === EditorType.Builder;
    const isExploreView = req.app === CoreApp.Explore
    // Query should only be linked if it's a builder query in explore view
    if (!originalQueryValid || !isExploreView) {
      return;
    }

    const traceField = frame.fields.find(field => field.name === 'traceID');
    if (traceField) {
      const traceIdQuery: CHBuilderQuery = {
        ...originalQuery,
        builderOptions: {
          ...originalQuery.builderOptions,
          filters: [], // Clear filters since it's an exact ID lookup
          meta: {
            ...originalQuery.builderOptions.meta,
            isTraceIdMode: true,
            traceId: '${__value.raw}'
          }
        }
      };

      traceField.config.links = [];
      traceField.config.links!.push({
        title: 'View Trace ${__value.raw}',
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
    }
  });

  return res;
};
