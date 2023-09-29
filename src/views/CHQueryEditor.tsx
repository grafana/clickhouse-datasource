import React from 'react';
import { QueryEditorProps } from '@grafana/data';
import { Datasource } from 'data/CHDatasource';
import { EditorTypeSwitcher } from 'components/queryBuilder/EditorTypeSwitcher';
import { styles } from 'styles';
import { Button } from '@grafana/ui';
import { CHQuery, EditorType, CHBuilderQuery, defaultCHBuilderQuery } from 'types/sql';
import { CHConfig } from 'types/config';
import { QueryBuilderOptions } from 'types/queryBuilder';
import { QueryBuilder } from 'components/queryBuilder/QueryBuilder';
import { generateSql } from 'data/sqlGenerator';
import { SqlEditor } from 'components/SqlEditor';

export type CHQueryEditorProps = QueryEditorProps<Datasource, CHQuery, CHConfig>;

/**
 * Top level query editor component
 */
export const CHQueryEditor = (props: CHQueryEditorProps) => {
  const { onRunQuery } = props;

  return (
    <>
      <div className={'gf-form ' + styles.QueryEditor.queryType}>
          <EditorTypeSwitcher {...props} />
        <Button onClick={() => onRunQuery()}>Run Query</Button>
      </div>
      <CHEditorByType {...props} />
    </>
  );
};

const CHEditorByType = (props: CHQueryEditorProps) => {
  const { query, onChange, app } = props;
  const onBuilderOptionsChange = (builderOptions: QueryBuilderOptions) => {
    const sql = generateSql(builderOptions);
    onChange({ ...query, editorType: EditorType.Builder, rawSql: sql, builderOptions });
  };

  if (query.editorType === EditorType.SQL) {
    return (
      <div data-testid="query-editor-section-sql">
        <SqlEditor {...props} />
      </div>
    );
  }
  
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
};
