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
  editorType: EditorType;
  rawSql: string;
}

export interface CHSqlQuery extends CHQueryBase {
  editorType: EditorType.SQL;
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
  editorType: EditorType.Builder,
  rawSql: '',
  builderOptions: {
    database: '',
    table: '',
    queryType: QueryType.Table,
    mode: BuilderMode.List,
    columns: [],
    limit: 100,
  },
  // format: Format.TABLE,
  // selectedFormat: Format.AUTO,
};
export const defaultCHSqlQuery: Omit<CHSqlQuery, 'refId'> = {
  editorType: EditorType.SQL,
  rawSql: '',
  expand: false,
};
