import React from 'react';
import { QueryEditorProps } from '@grafana/data';
import { Datasource } from '../../data/CHDatasource';
import { EditorTypeSwitcher } from 'components/v4/EditorTypeSwitcher';
import { styles } from 'styles';
import { Button } from '@grafana/ui';
import { CHQuery, EditorType, CHBuilderQuery, defaultCHBuilderQuery } from 'types/sql';
import { CHConfig } from 'types/config';
import { QueryBuilderOptions } from 'types/queryBuilder';
import { SqlEditor } from 'components/v4/SqlEditor';
import { QueryBuilder } from 'components/v4/queryBuilder/QueryBuilder';
import { getSQLFromQueryOptions } from 'components/queryBuilder/utils';

export type CHQueryEditorProps = QueryEditorProps<Datasource, CHQuery, CHConfig>;

/**
 * Top level query editor component
 */
export const CHQueryEditor = (props: CHQueryEditorProps) => {
  const { query, onRunQuery } = props;

  const runQuery = () => {
    if (query.editorType === EditorType.SQL) {
      // const format = getFormat(query.rawSql, query.selectedFormat);
      // if (format !== query.format) {
        // onChange({ ...query, format });
        // onChange({ ...query });
      // }
    }
    onRunQuery();
  };

  // const onFormatChange = (selectedFormat: Format) => {
  //   switch (query.queryType) {
  //     case QueryType.SQL:
  //       onChange({ ...query, format: getFormat(query.rawSql, selectedFormat), selectedFormat });
  //     case QueryType.Builder:
  //     default:
  //       if (selectedFormat === Format.AUTO) {
  //         let builderOptions = (query as CHBuilderQuery).builderOptions;
  //         const format = builderOptions && builderOptions.mode === BuilderMode.Trend ? Format.TIMESERIES : Format.TABLE;
  //         onChange({ ...query, format, selectedFormat });
  //       } else {
  //         onChange({ ...query, format: selectedFormat, selectedFormat });
  //       }
  //   }
  // };

  return (
    <>
      <div className={'gf-form ' + styles.QueryEditor.queryType}>
          <EditorTypeSwitcher {...props} />
        <Button onClick={() => runQuery()}>Run Query</Button>
      </div>
      <CHEditorByType {...props} />
    </>
  );
};

const CHEditorByType = (props: CHQueryEditorProps) => {
  const { query, onChange, app } = props;
  const onBuilderOptionsChange = (builderOptions: QueryBuilderOptions) => {
    const sql = getSQLFromQueryOptions(builderOptions.database, builderOptions.table, builderOptions);
    onChange({ ...query, editorType: EditorType.Builder, rawSql: sql, builderOptions });
  };

  switch (query.editorType) {
    case EditorType.SQL:
      return (
        <div data-testid="query-editor-section-sql">
          <SqlEditor {...props} />
        </div>
      );
    case EditorType.Builder:
    default:
      let newQuery: CHBuilderQuery = { ...query };
      if (query.rawSql && !query.builderOptions) {
        return (
          <div data-testid="query-editor-section-sql">
            <SqlEditor {...props} />
          </div>
        );
      }

      if (!query.rawSql || !query.builderOptions) {
        newQuery = {
          ...newQuery,
          rawSql: defaultCHBuilderQuery.rawSql,
          builderOptions: {
            ...defaultCHBuilderQuery.builderOptions,
          },
        };
      }

      return (
        <QueryBuilder
          datasource={props.datasource}
          builderOptions={newQuery.builderOptions}
          onBuilderOptionsChange={onBuilderOptionsChange}
          generatedSql={newQuery.rawSql}
          app={app}
        />
      );
  }
};
