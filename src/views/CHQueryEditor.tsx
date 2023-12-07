import React from 'react';
import { QueryEditorProps } from '@grafana/data';
import { Datasource } from '../data/CHDatasource';
import {
  BuilderMode,
  CHConfig,
  CHQuery,
  defaultCHBuilderQuery,
  Format,
  QueryType,
  SqlBuilderOptions,
  CHBuilderQuery,
} from '../types';
import { SQLEditor } from 'components/SQLEditor';
import { getSQLFromQueryOptions } from 'components/queryBuilder/utils';
import { QueryBuilder } from 'components/queryBuilder/QueryBuilder';
import { Preview } from 'components/queryBuilder/Preview';
import { getFormat } from 'components/editor';
import { QueryHeader } from 'components/QueryHeader';

export type CHQueryEditorProps = QueryEditorProps<Datasource, CHQuery, CHConfig>;

const CHEditorByType = (props: CHQueryEditorProps) => {
  const { query, onChange, app } = props;
  const onBuilderOptionsChange = (builderOptions: SqlBuilderOptions) => {
    const sql = getSQLFromQueryOptions(builderOptions);
    const format =
      query.selectedFormat === Format.AUTO
        ? builderOptions.mode === BuilderMode.Trend
          ? Format.TIMESERIES
          : Format.TABLE
        : query.selectedFormat;
    onChange({ ...query, queryType: QueryType.Builder, rawSql: sql, builderOptions, format });
  };

  switch (query.queryType) {
    case QueryType.SQL:
      return (
        <div data-testid="query-editor-section-sql">
          <SQLEditor {...props} />
        </div>
      );
    case QueryType.Builder:
    default:
      let newQuery: CHBuilderQuery = { ...query };
      if (query.rawSql && !query.builderOptions) {
        return (
          <div data-testid="query-editor-section-sql">
            <SQLEditor {...props} />
          </div>
        );
      }
      if (!query.rawSql || !query.builderOptions) {
        newQuery = {
          ...newQuery,
          rawSql: defaultCHBuilderQuery.rawSql,
          builderOptions: {
            ...defaultCHBuilderQuery.builderOptions,
            database: props.datasource.getDefaultDatabase() || 'default',
          },
        };
      }
      return (
        <div data-testid="query-editor-section-builder">
          <QueryBuilder
            datasource={props.datasource}
            builderOptions={newQuery.builderOptions}
            onBuilderOptionsChange={onBuilderOptionsChange}
            format={newQuery.format}
            app={app}
          />
          <Preview sql={newQuery.rawSql} />
        </div>
      );
  }
};

export const CHQueryEditor = (props: CHQueryEditorProps) => {
  const { query, onChange, onRunQuery } = props;

  React.useEffect(() => {
    if (typeof query.selectedFormat === 'undefined' && query.queryType === QueryType.SQL) {
      const selectedFormat = Format.AUTO;
      const format = getFormat(query.rawSql, selectedFormat);
      onChange({ ...query, selectedFormat, format });
    }
  }, [query, onChange]);

  return (
    <>
      <QueryHeader query={query} onChange={onChange} onRunQuery={onRunQuery} />
      <CHEditorByType {...props} />
    </>
  );
};
