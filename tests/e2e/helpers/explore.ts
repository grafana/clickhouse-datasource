import { QueryType } from '../../../src/types/queryBuilder';
import { DATASOURCE_UID, PLUGIN_TYPE } from './env';

export interface ExploreUrlOptions {
  datasourceUid?: string;
  queryType?: QueryType;
  from?: string;
  to?: string;
  rawSql?: string;
  builderOptions?: Record<string, unknown>;
}

/**
 * Build an Explore URL encoding the full pane state.
 *
 * The query defaults to editorType 'sql' (the SQL Editor). When builderOptions
 * is supplied the query is builder-shaped, so editorType becomes 'builder':
 * the datasource's frontend transform branches on editorType === 'builder'
 * (e.g. transformQueryResponseWithTraceAndLogLinks in src/data/utils.ts only
 * attaches View trace / View logs links to builder queries unless
 * datasource-level trace defaults are configured, and the local e2e
 * datasource has none). rawSql is passed alongside so the query runs
 * deterministically on load without depending on editor re-generation.
 * queryType is restored via the query's top-level queryType field (used by
 * SQL mode). Tests that need the Query Builder UI without pre-built
 * builderOptions should call switchToBuilderMode after
 * page.goto(exploreUrl(...)).
 */
export function exploreUrl(opts: ExploreUrlOptions = {}): string {
  const { datasourceUid = DATASOURCE_UID, queryType, from = 'now-1h', to = 'now', rawSql = '', builderOptions } = opts;

  const query: Record<string, unknown> = {
    refId: 'A',
    datasource: { type: PLUGIN_TYPE, uid: datasourceUid },
    editorType: builderOptions === undefined ? 'sql' : 'builder',
    pluginVersion: '',
    rawSql,
  };
  if (queryType !== undefined) {
    query.queryType = queryType;
  }
  if (builderOptions !== undefined) {
    query.builderOptions = builderOptions;
    // Builder-shaped queries also carry format so the supplied rawSql runs
    // deterministically on load without depending on editor re-generation.
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
