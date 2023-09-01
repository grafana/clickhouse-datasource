import { DataQuery } from '@grafana/schema';
import { BuilderMode, SqlBuilderOptions } from './queryBuilder';

/**
 * EditorType determines the query editor type.
 */
export enum EditorType {
  SQL = 'sql',
  Builder = 'builder',
}

/**
 * QueryType determines the display/query format.
 */
export enum QueryType {
  Table = 'table',
  Logs = 'logs',
  TimeSeries = 'timeSeries',
  Traces = 'traces',
}

export interface CHQueryBase extends DataQuery {
  editorType: EditorType;
  queryType: QueryType;
  database: string;
  table: string;
  selectedQueryType?: QueryType;

  rawSql: string;
}

export interface CHSqlQuery extends CHQueryBase {
  editorType: EditorType.SQL;
  meta?: {
    timezone?: string;
    // meta fields to be used just for building builder options when migrating back to EditorType.Builder
    builderOptions?: SqlBuilderOptions;
  };
  expand?: boolean;
}

export interface CHBuilderQuery extends CHQueryBase {
  editorType: EditorType.Builder;
  builderOptions: SqlBuilderOptions;
  meta?: {
    timezone?: string;
  };
}

export type CHQuery = CHSqlQuery | CHBuilderQuery;

// TODO: these aren't really types
export const defaultEditorType: EditorType = EditorType.Builder;
export const defaultCHBuilderQuery: Omit<CHBuilderQuery, 'refId'> = {
  editorType: EditorType.Builder,
  queryType: QueryType.Table,
  database: '',
  table: '',
  rawSql: '',
  builderOptions: {
    mode: BuilderMode.List,
    fields: [],
    limit: 100,
  },
  // format: Format.TABLE,
  // selectedFormat: Format.AUTO,
};
export const defaultCHSqlQuery: Omit<CHSqlQuery, 'refId'> = {
  editorType: EditorType.SQL,
  queryType: QueryType.Table,
  database: '',
  table: '',
  rawSql: '',
  // format: Format.TABLE,
  // selectedFormat: Format.AUTO,
  expand: false,
};
