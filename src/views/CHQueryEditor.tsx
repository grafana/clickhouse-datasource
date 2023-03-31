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
import { QueryTypeSwitcher } from 'components/QueryTypeSwitcher';
import { FormatSelect } from '../components/FormatSelect';
import { Button } from '@grafana/ui';
import { styles } from 'styles';
import { getFormat } from 'components/editor';

export type CHQueryEditorProps = QueryEditorProps<Datasource, CHQuery, CHConfig>;

const CHEditorByType = (props: CHQueryEditorProps) => {
  const { query, onChange } = props;
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
            format={newQuery.format}
          />
          <Preview sql={newQuery.rawSql} />
        </div>
      );
  }
};

export const CHQueryEditor = (props: CHQueryEditorProps) => {
  const { query, onChange, onRunQuery } = props;

  const runQuery = () => {
    if (query.queryType === QueryType.SQL) {
      const format = getFormat(query.rawSql, query.selectedFormat);
      if (format !== query.format) {
        onChange({ ...query, format });
      }
    }
    onRunQuery();
  };

  const onFormatChange = (selectedFormat: Format) => {
    switch (query.queryType) {
      case QueryType.SQL:
        onChange({ ...query, format: getFormat(query.rawSql, selectedFormat), selectedFormat });
      case QueryType.Builder:
      default:
        if (selectedFormat === Format.AUTO) {
          let builderOptions = (query as CHBuilderQuery).builderOptions;
          const format = builderOptions && builderOptions.mode === BuilderMode.Trend ? Format.TIMESERIES : Format.TABLE;
          onChange({ ...query, format, selectedFormat });
        } else {
          onChange({ ...query, format: selectedFormat, selectedFormat });
        }
    }
  };

  return (
    <>
      <div className={'gf-form ' + styles.QueryEditor.queryType}>
        <span>
          <QueryTypeSwitcher {...props} />
        </span>
        <Button onClick={() => runQuery()}>Run Query</Button>
      </div>
      <FormatSelect format={query.selectedFormat ?? Format.AUTO} onChange={onFormatChange} />
      <CHEditorByType {...props} />
    </>
  );
};
