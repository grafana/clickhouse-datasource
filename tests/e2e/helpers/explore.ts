import { QueryType } from '../../../src/types/queryBuilder';
import { DATASOURCE_UID, PLUGIN_TYPE } from './env';

export interface ExploreUrlOptions {
  datasourceUid?: string;
  queryType?: QueryType;
  from?: string;
  to?: string;
  rawSql?: string;
  builderOptions?: Record<string, unknown>;
  /**
   * The query's plugin version. Empty (the default) marks a SQL query without queryType as a v3
   * query: the editor migrates it and sets queryType from format, which is Table here because
   * SQL queries get no format. Builder queries with builderOptions, and SQL queries with a v4
   * queryType, load as v4 queries with any version.
   */
  pluginVersion?: string;
}

/**
 * Build an Explore URL that opens on a ready-to-run query. With builderOptions
 * the query is builder-shaped (editorType 'builder'). This matters for the link
 * specs: without datasource trace defaults, the frontend attaches View trace
 * and View logs links to builder queries only. The e2e datasource has none.
 * To use the Query Builder UI without pre-built builderOptions, call
 * switchToBuilderMode after page.goto.
 */
export function exploreUrl(opts: ExploreUrlOptions = {}): string {
  const {
    datasourceUid = DATASOURCE_UID,
    queryType,
    from = 'now-1h',
    to = 'now',
    rawSql = '',
    builderOptions,
    pluginVersion = '',
  } = opts;

  const query: Record<string, unknown> = {
    refId: 'A',
    datasource: { type: PLUGIN_TYPE, uid: datasourceUid },
    editorType: builderOptions === undefined ? 'sql' : 'builder',
    pluginVersion,
    rawSql,
  };
  if (queryType !== undefined) {
    query.queryType = queryType;
  }
  if (builderOptions !== undefined) {
    query.builderOptions = builderOptions;
    // When builderOptions can run, the editor replaces rawSql and format with its own on load.
    // Otherwise the query runs the supplied rawSql in the Table format.
    query.format = 1;
  }

  const panes = JSON.stringify({
    explore: {
      datasource: datasourceUid,
      queries: [query],
      range: { from, to },
    },
  });

  return `/explore?orgId=1&schemaVersion=1&panes=${encodeURIComponent(panes)}`;
}
