import React, { useCallback, useEffect, useState } from 'react';
import { QueryEditorProps } from '@grafana/data';
import { Datasource } from 'data/CHDatasource';
import { EditorTypeSwitcher } from 'components/queryBuilder/EditorTypeSwitcher';
import { styles } from 'styles';
import { Button } from '@grafana/ui';
import { CHBuilderQuery, CHQuery, EditorType, defaultCHBuilderQuery } from 'types/sql';
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
  const [builderOptions, setBuilderOptions] = useState<QueryBuilderOptions>({
    ...defaultCHBuilderQuery.builderOptions,
    ...(query as CHBuilderQuery).builderOptions,
    meta: {
      ...defaultCHBuilderQuery.builderOptions.meta,
      ...(query as CHBuilderQuery).builderOptions?.meta
    }
  });

  const onBuilderOptionsChange = useCallback((nextBuilderOptions: Partial<QueryBuilderOptions>) => {
    setBuilderOptions(prevBuilderOptions => {
      // If switching query type, reset the editor.
      // Excludes Table/TimeSeries, since they're similar and less guided.
      const prevQueryType = prevBuilderOptions.queryType;
      const nextQueryType = nextBuilderOptions.queryType;
      const queryTypeChanged = prevQueryType !== nextQueryType;
      const isSwitchingBetweenTableAndTimeSeries = (prevQueryType === QueryType.Table && nextQueryType === QueryType.TimeSeries) || (prevQueryType === QueryType.TimeSeries && nextQueryType === QueryType.Table);
      if (nextQueryType && queryTypeChanged && !isSwitchingBetweenTableAndTimeSeries) {
        return {
          ...defaultCHBuilderQuery.builderOptions,
          queryType: nextQueryType
        }
      }

      return {
        ...prevBuilderOptions,
        ...nextBuilderOptions,
        meta: {
          ...prevBuilderOptions.meta,
          ...nextBuilderOptions.meta
        }
      };
    });
  }, []);

  useEffect(() => {
    const sql = generateSql(builderOptions);
    onChange({
      ...query,
      editorType: EditorType.Builder,
      rawSql: sql,
      builderOptions,
      format: mapQueryTypeToGrafanaFormat(builderOptions.queryType)
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderOptions]);

  if (query.editorType === EditorType.SQL) {
    return (
      <div data-testid="query-editor-section-sql">
        <SqlEditor {...props} />
      </div>
    );
  }

  return (
    <QueryBuilder
      datasource={props.datasource}
      builderOptions={builderOptions}
      onBuilderOptionsChange={onBuilderOptionsChange}
      generatedSql={query.rawSql}
      app={app}
    />
  );
};
