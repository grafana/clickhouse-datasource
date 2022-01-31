import React from 'react';
import { QueryEditorProps } from '@grafana/data';
import { Datasource } from '../data/CHDatasource';
import { CHConfig, CHQuery, SqlBuilderOptions, QueryType, defaultCHBuilderQuery, BuilderMode, Format } from '../types';
import { SQLEditor } from 'components/SQLEditor';
import { getSQLFromQueryOptions } from 'components/queryBuilder/utils';
import { QueryBuilder } from 'components/queryBuilder/QueryBuilder';
import { Preview } from 'components/queryBuilder/Preview';
import { QueryTypeSwitcher } from 'components/QueryTypeSwitcher';
import { Button } from '@grafana/ui';
import { styles } from 'styles';

export type CHQueryEditorProps = QueryEditorProps<Datasource, CHQuery, CHConfig>;

const CHEditorByType = (props: CHQueryEditorProps) => {
  const { query, onChange } = props;
  const onBuilderOptionsChange = (builderOptions: SqlBuilderOptions) => {
    const sql = getSQLFromQueryOptions(builderOptions);
    const format = builderOptions.mode === BuilderMode.Trend ? Format.TIMESERIES : Format.TABLE;
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
      let newQuery = { ...query };
      if (query.rawSql && !query.builderOptions) {
        return (
          <div data-testid="query-editor-section-sql">
            <SQLEditor {...props} />
          </div>
        );
      }
      if (!query.rawSql || !query.builderOptions) {
        let { rawSql, builderOptions } = defaultCHBuilderQuery;
        newQuery = { ...newQuery, rawSql, builderOptions };
      }
      return (
        <div data-testid="query-editor-section-builder">
          <QueryBuilder
            datasource={props.datasource}
            builderOptions={newQuery.builderOptions}
            onBuilderOptionsChange={onBuilderOptionsChange}
          />
          <Preview sql={newQuery.rawSql} />
        </div>
      );
  }
};

export const CHQueryEditor = (props: CHQueryEditorProps) => {
  return (
    <>
      <div className={'gf-form ' + styles.QueryEditor.queryType}>
        <span>
          <QueryTypeSwitcher {...props} />
        </span>
        <Button onClick={() => props.onRunQuery()}>Run Query</Button>
      </div>
      <CHEditorByType {...props} />
    </>
  );
};
