import { DataQuery } from '@grafana/schema';
import { BuilderMode, QueryType, QueryBuilderOptions } from './queryBuilder';

/**
 * EditorType determines the query editor type.
 */
export enum EditorType {
  SQL = 'sql',
  Builder = 'builder',
  Schema = 'schema',
}

/** Persisted on the query so reopening a saved panel returns to the same selection. */
export interface SchemaExplorerState {
  database?: string;
  table?: string;
  selectedColumns?: string[];
  /**
   * Column used for `$__timeFilter()` in generated SQL. Empty string means the
   * user explicitly chose no time filter; undefined means "resolve a default".
   */
  timeColumn?: string;
}

export interface CHQueryBase extends DataQuery {
  pluginVersion: string;
  editorType: EditorType;
  rawSql: string;

  /**
   * REQUIRED by backend for auto selecting preferredVisualizationType.
   * Only used in explore view.
   * src: https://github.com/grafana/sqlds/blob/dda2dc0a54b128961fc9f7885baabf555f3ddfdc/query.go#L36
   */
  format?: number;
}

export interface CHSqlQuery extends CHQueryBase {
  editorType: EditorType.SQL;
  queryType?: QueryType; // only used in explore view
  meta?: {
    timezone?: string;
    // meta fields to be used just for building builder options when migrating back to EditorType.Builder
    builderOptions?: QueryBuilderOptions;
  };
  expand?: boolean;
}

export interface CHBuilderQuery extends CHQueryBase {
  editorType: EditorType.Builder;
  builderOptions: QueryBuilderOptions;
  meta?: {
    timezone?: string;
  };
}

/** Schema Explorer query. */
export interface CHSchemaQuery extends CHQueryBase {
  editorType: EditorType.Schema;
  queryType?: QueryType;
  schemaExplorer?: SchemaExplorerState;
  meta?: {
    timezone?: string;
    builderOptions?: QueryBuilderOptions;
  };
}

export type CHQuery = CHSqlQuery | CHBuilderQuery | CHSchemaQuery;

// TODO: these aren't really types
export const defaultEditorType: EditorType = EditorType.Builder;
export const defaultCHBuilderQuery: Omit<CHBuilderQuery, 'refId'> = {
  pluginVersion: '',
  editorType: EditorType.Builder,
  rawSql: '',
  builderOptions: {
    database: '',
    table: '',
    queryType: QueryType.Table,
    mode: BuilderMode.List,
    columns: [],
    meta: {},
    limit: 1000,
  },
};
export const defaultCHSqlQuery: Omit<CHSqlQuery, 'refId'> = {
  pluginVersion: '',
  editorType: EditorType.SQL,
  rawSql: '',
  expand: false,
};
