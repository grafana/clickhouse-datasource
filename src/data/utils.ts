import { QueryType } from "types/queryBuilder"


/**
 * Converts QueryType to Grafana format
 * src: https://github.com/grafana/sqlds/blob/main/query.go#L20
 */
export const mapQueryTypeToGrafanaFormat = (t: QueryType): number => {
  switch (t) {
    case QueryType.Table:
      return 1;
    case QueryType.Logs:
      return 2;
    case QueryType.TimeSeries:
      return 0;
    case QueryType.Traces:
      return 3
    default:
      return -1 // defaults to timeseries/graph on plugin backend.
  }
}