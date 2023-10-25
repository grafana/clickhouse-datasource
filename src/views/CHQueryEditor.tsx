import React, { useCallback, useEffect } from 'react';
import { QueryEditorProps } from '@grafana/data';
import { Datasource } from 'data/CHDatasource';
import { EditorTypeSwitcher } from 'components/queryBuilder/EditorTypeSwitcher';
import { styles } from 'styles';
import { Button } from '@grafana/ui';
import { CHQuery, EditorType, CHBuilderQuery, defaultCHBuilderQuery } from 'types/sql';
import { CHConfig } from 'types/config';
import { QueryBuilderOptions, QueryType } from 'types/queryBuilder';
import { QueryBuilder } from 'components/queryBuilder/QueryBuilder';
import { generateSql } from 'data/sqlGenerator';
import { SqlEditor } from 'components/SqlEditor';
import { mapQueryTypeToGrafanaFormat } from 'data/utils';

export type CHQueryEditorProps = QueryEditorProps<Datasource, CHQuery, CHConfig>;

/**
 * Top level query editor component
 */
export const CHQueryEditor = (props: CHQueryEditorProps) => {
  const { query, onChange, onRunQuery } = props;

  useEffect(() => {
    if (query.editorType) {
      return;
    }

    onChange({
      ...query as CHQuery,
      ...defaultCHBuilderQuery,
      builderOptions: {
        ...defaultCHBuilderQuery.builderOptions,
      },
    });
  }, [query, query.editorType, onChange]);

  if (!query.editorType) {
    return null;
  }

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
  const onBuilderOptionsChange = useCallback((nextBuilderOptions: Partial<QueryBuilderOptions>) => {
    let builderOptions: QueryBuilderOptions = {
      ...(query as CHBuilderQuery).builderOptions,
      ...nextBuilderOptions,
      meta: {
        ...(query as CHBuilderQuery).builderOptions.meta,
        ...nextBuilderOptions.meta
      },
    };

    // If switching query type, reset the editor.
    // Excludes Table/TimeSeries, since they're similar and less guided.
    const prevQueryType = (query as CHBuilderQuery).builderOptions?.queryType;
    const nextQueryType = nextBuilderOptions.queryType;
    const queryTypeChanged = prevQueryType !== nextQueryType;
    const isSwitchingBetweenTableAndTimeSeries = (prevQueryType === QueryType.Table && nextQueryType === QueryType.TimeSeries) || (prevQueryType === QueryType.TimeSeries && nextQueryType === QueryType.Table);
    if (nextQueryType && queryTypeChanged && !isSwitchingBetweenTableAndTimeSeries) {
      builderOptions = {
        ...(query as CHBuilderQuery).builderOptions,
        ...defaultCHBuilderQuery.builderOptions,
        queryType: nextQueryType
      }
    }

    const sql = generateSql(builderOptions);
    onChange({
      ...query,
      editorType: EditorType.Builder,
      rawSql: sql,
      builderOptions,
      format: mapQueryTypeToGrafanaFormat(builderOptions.queryType)
    });
  }, [query, onChange]);

  if (query.editorType === EditorType.SQL) {
    return (
      <div data-testid="query-editor-section-sql">
        <SqlEditor {...props} />
      </div>
    );
  }

  const builderQuery: CHBuilderQuery = { ...query };
  return (
    <QueryBuilder
      datasource={props.datasource}
      builderOptions={builderQuery.builderOptions}
      onBuilderOptionsChange={onBuilderOptionsChange}
      generatedSql={builderQuery.rawSql}
      app={app}
    />
  );
};
