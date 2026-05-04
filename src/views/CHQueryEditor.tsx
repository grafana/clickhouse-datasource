import React, { useEffect, useMemo, useRef } from 'react';
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
import { setAllOptions, setOptions, useBuilderOptionsState } from 'hooks/useBuilderOptionsState';
import { pluginVersion } from 'utils/version';
import { migrateCHQuery } from 'data/migration';
import useTables from 'hooks/useTables';

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
  const queryKey = query.key || '';
  const lastKey = useRef<string>(queryKey);
  if (queryKey !== lastKey.current && query.editorType === EditorType.Builder) {
    builderOptionsDispatch(setAllOptions((query as CHBuilderQuery).builderOptions || {}));
    lastKey.current = queryKey;
  }

  /**
   * Sync builder options when switching from SQL Editor to Query Builder
   */
  const lastEditorType = useRef<EditorType | undefined>(undefined);
  if (query.editorType !== lastEditorType.current && query.editorType === EditorType.Builder) {
    builderOptionsDispatch(setAllOptions((query as CHBuilderQuery).builderOptions || {}));
  }
  lastEditorType.current = query.editorType;

  // Prevent trying to run empty query on load
  const shouldSkipChanges = useRef<boolean>(true);
  if (isBuilderOptionsRunnable(builderOptions)) {
    shouldSkipChanges.current = false;
  }

  // Resolve hasTraceTimestampTable for any trace ID query — not only OTel ones.
  // Running this at the CHEditorByType level means the check fires even when
  // the builder is minimized via a logs→trace deep-link. The companion-table
  // suffix is configurable on the datasource (defaults to the OTel convention)
  // so non-OTel schemas can opt in to the two-step trace ID lookup.
  const traceTimestampTableSuffix =
    builderOptions.meta?.traceTimestampTableSuffix || props.datasource.getTraceTimestampTableSuffix();
  const needsTraceTableCheck = Boolean(builderOptions.meta?.isTraceIdMode);
  const traceDb = needsTraceTableCheck ? builderOptions.database : '';
  const traceTables = useTables(props.datasource, traceDb);
  const hasTraceTimestampTable = useMemo(
    () => traceTables.some((t) => t === builderOptions.table + traceTimestampTableSuffix),
    [builderOptions.table, traceTables, traceTimestampTableSuffix]
  );

  useEffect(() => {
    if (!needsTraceTableCheck || traceTables.length === 0) {
      return;
    }

    if (hasTraceTimestampTable !== builderOptions.meta?.hasTraceTimestampTable) {
      builderOptionsDispatch(
        setOptions({
          meta: { hasTraceTimestampTable },
        })
      );
    }
  }, [
    needsTraceTableCheck,
    traceTables,
    hasTraceTimestampTable,
    builderOptions.meta?.hasTraceTimestampTable,
    builderOptionsDispatch,
  ]);

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
      format: mapQueryBuilderOptionsToGrafanaFormat(builderOptions),
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
