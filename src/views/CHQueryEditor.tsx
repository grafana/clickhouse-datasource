import React, { useEffect, useRef } from 'react';
import { QueryEditorProps } from '@grafana/data';
import { Datasource } from 'data/CHDatasource';
import { EditorTypeSwitcher } from 'components/queryBuilder/EditorTypeSwitcher';
import { styles } from 'styles';
import { Button } from '@grafana/ui';
import { CHBuilderQuery, CHQuery, EditorType } from 'types/sql';
import { CHConfig } from 'types/config';
import { QueryBuilder } from 'components/queryBuilder/QueryBuilder';
import { generateSql } from 'data/sqlGenerator';
import { SqlEditor } from 'components/SqlEditor';
import { isBuilderOptionsRunnable, mapQueryBuilderOptionsToGrafanaFormat } from 'data/utils';
import { setAllOptions, useBuilderOptionsState } from 'hooks/useBuilderOptionsState';
import { pluginVersion } from 'utils/version';
import { migrateCHQuery } from 'data/migration';

export type CHQueryEditorProps = QueryEditorProps<Datasource, CHQuery, CHConfig>;

/**
 * Top level query editor component
 */
export const CHQueryEditor = (props: CHQueryEditorProps) => {
  const { datasource, query: savedQuery, onRunQuery } = props;
  const query = migrateCHQuery(savedQuery);

  return (
    <>
      <div className={'gf-form ' + styles.QueryEditor.queryType}>
        <EditorTypeSwitcher {...props} query={query} datasource={datasource} />
        <Button onClick={() => onRunQuery()}>Run Query</Button>
      </div>
      <CHEditorByType {...props} query={query} />
    </>
  );
};

const CHEditorByType = (props: CHQueryEditorProps) => {
  const { query, onChange, app } = props;
  const [builderOptions, builderOptionsDispatch] = useBuilderOptionsState((query as CHBuilderQuery).builderOptions);

  /**
   * Grafana will sometimes replace the builder options directly, so we need to sync in both directions.
   * For example, selecting an entry from the query history will cause the local state to fall out of sync.
   * The "key" property is present on these historical entries.
   */
  const queryKey = query.key || ''
  const lastKey = useRef<string>(queryKey);
  if (queryKey !== lastKey.current && query.editorType === EditorType.Builder) {
    builderOptionsDispatch(setAllOptions((query as CHBuilderQuery).builderOptions || {}));
    lastKey.current = queryKey;
  }

  /**
   * Sync builder options when switching from SQL Editor to Query Builder
   */
  const lastEditorType = useRef<EditorType>();
  if (query.editorType !== lastEditorType.current && query.editorType === EditorType.Builder) {
    builderOptionsDispatch(setAllOptions((query as CHBuilderQuery).builderOptions || {}));
    lastEditorType.current = query.editorType;
  }

  // Prevent trying to run empty query on load
  const shouldSkipChanges = useRef<boolean>(true);
  if (isBuilderOptionsRunnable(builderOptions)) {
    shouldSkipChanges.current = false;
  }

  useEffect(() => {
    if (shouldSkipChanges.current || query.editorType === EditorType.SQL) {
      return;
    }

    onChange({
      ...query,
      pluginVersion,
      editorType: EditorType.Builder,
      rawSql: generateSql(builderOptions),
      builderOptions,
      format: mapQueryBuilderOptionsToGrafanaFormat(builderOptions)
    });

    // TODO: fix dependency warning with "useEffectEvent" once added to stable version of react
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
      builderOptionsDispatch={builderOptionsDispatch}
      generatedSql={query.rawSql}
      app={app}
    />
  );
};
