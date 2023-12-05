import { DataQuery } from '@grafana/schema';
import { BuilderMode, QueryType, QueryBuilderOptions } from './queryBuilder';

/**
 * EditorType determines the query editor type.
 */
export enum EditorType {
  SQL = 'sql',
  Builder = 'builder',
}

export interface CHQueryBase extends DataQuery {
  pluginVersion: string,
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

export type CHQuery = CHSqlQuery | CHBuilderQuery;

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
    limit: 1000
  },
};
export const defaultCHSqlQuery: Omit<CHSqlQuery, 'refId'> = {
  pluginVersion: '',
  editorType: EditorType.SQL,
  rawSql: '',
  expand: false,
};
