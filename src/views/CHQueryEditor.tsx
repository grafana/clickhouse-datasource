import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QueryEditorProps } from '@grafana/data';
import { Datasource } from 'data/CHDatasource';
import { EditorTypeSwitcher } from 'components/queryBuilder/EditorTypeSwitcher';
import { styles } from 'styles';
import { Button, ConfirmModal, ErrorBoundaryAlert, InlineFieldRow, Stack } from '@grafana/ui';
import { CHBuilderQuery, CHQuery, EditorType } from 'types/sql';
import { CHConfig } from 'types/config';
import { QueryBuilder } from 'components/queryBuilder/QueryBuilder';
import { generateSql } from 'data/sqlGenerator';
import { SqlEditor } from 'components/SqlEditor';
import { isBuilderOptionsRunnable, mapQueryBuilderOptionsToGrafanaFormat } from 'data/utils';
import { setAllOptions, setOptions, useBuilderOptionsState } from 'hooks/useBuilderOptionsState';
import { QueryBuilderOptions } from 'types/queryBuilder';
import { pluginVersion } from 'utils/version';
import { migrateCHQuery } from 'data/migration';
import useHasTraceTimestampTable from 'hooks/useHasTraceTimestampTable';
import { buildCompactQueryDefaults, getCompactQueryType } from 'components/queryBuilder/compactQueryDefaults';
import { isEqual } from 'lodash';

export type CHQueryEditorProps = QueryEditorProps<Datasource, CHQuery, CHConfig>;

/**
 * Grafana core injects a one-shot top-level `query` field into the pane query when a span
 * link is followed (see Datasource.retargetSpanLinkTrace). The injected value must only
 * apply until the user next edits the query, so drop it from every change the editor
 * propagates. Otherwise it survives in the saved model and pins every run to the linked
 * trace, even after the user targets a different trace id.
 */
const removeSpanLinkQueryField = (query: CHQuery): CHQuery => {
  if (!('query' in query)) {
    return query;
  }

  const { query: discardedSpanLinkQuery, ...rest } = query;
  void discardedSpanLinkQuery;
  return rest;
};

/**
 * Top level query editor component.
 * Wrapped in an error boundary so a crash while rendering the editor surfaces
 * an alert instead of breaking the panel edit view (#1931).
 */
export const CHQueryEditor = (props: CHQueryEditorProps) => {
  return (
    <ErrorBoundaryAlert title="ClickHouse query editor failed to load" style="alertbox">
      <CHQueryEditorContent {...props} />
    </ErrorBoundaryAlert>
  );
};

const CHQueryEditorContent = (props: CHQueryEditorProps) => {
  const { datasource, query: savedQuery, onChange, onRunQuery } = props;
  // Fold a span-link injected trace id into the builder options before rendering, so the
  // editor shows the linked trace and the first propagated change keeps targeting it once
  // removeSpanLinkQueryField drops the one-shot field.
  const query = datasource.retargetSpanLinkTrace(migrateCHQuery(savedQuery));
  const handleChange = useCallback((nextQuery: CHQuery) => onChange(removeSpanLinkQueryField(nextQuery)), [onChange]);
  const singleTableMode = datasource.isSingleTableMode();

  if (singleTableMode && query.editorType === EditorType.SQL) {
    return <CompactSqlMode {...props} query={query} onChange={handleChange} />;
  }

  if (singleTableMode) {
    return <CHEditorByType {...props} query={query} onChange={handleChange} />;
  }

  return (
    <>
      <InlineFieldRow className={styles.QueryEditor.queryType}>
        <EditorTypeSwitcher {...props} query={query} onChange={handleChange} datasource={datasource} />
        <Button onClick={() => onRunQuery()}>Run Query</Button>
      </InlineFieldRow>
      <CHEditorByType {...props} query={query} onChange={handleChange} />
    </>
  );
};

const CHEditorByType = (props: CHQueryEditorProps) => {
  const { query, onChange, onRunQuery, app } = props;
  const [builderOptions, builderOptionsDispatch] = useBuilderOptionsState((query as CHBuilderQuery).builderOptions);
  const singleTableMode = props.datasource.isSingleTableMode();
  const signalType = props.datasource.getSignalType();

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

  const propBuilderOptions =
    query.editorType === EditorType.Builder ? (query as CHBuilderQuery).builderOptions : undefined;
  const lastPropBuilderOptions = useRef<QueryBuilderOptions | undefined>(propBuilderOptions);
  useEffect(() => {
    if (!propBuilderOptions) {
      lastPropBuilderOptions.current = undefined;
      return;
    }

    if (isEqual(propBuilderOptions, lastPropBuilderOptions.current)) {
      return;
    }

    lastPropBuilderOptions.current = propBuilderOptions;
    if (!isEqual(propBuilderOptions, builderOptions)) {
      builderOptionsDispatch(setAllOptions(propBuilderOptions));
    }
  }, [builderOptions, builderOptionsDispatch, propBuilderOptions]);

  // Prevent trying to run empty query on load, or stale query after datasource/signal switches.
  const shouldSkipChanges = useRef<boolean>(true);
  if (isBuilderOptionsRunnable(builderOptions)) {
    if (singleTableMode && signalType) {
      shouldSkipChanges.current = builderOptions.queryType !== getCompactQueryType(signalType);
    } else {
      shouldSkipChanges.current = false;
    }
  }

  // Resolve hasTraceTimestampTable for any trace ID query — not only OTel ones.
  // Running this at the CHEditorByType level means the check fires even when
  // the builder is minimized via a logs→trace deep-link.
  const needsTraceTableCheck = Boolean(builderOptions.meta?.isTraceIdMode);
  const hasTraceTimestampTable = useHasTraceTimestampTable(
    props.datasource,
    needsTraceTableCheck ? builderOptions.database || '' : '',
    needsTraceTableCheck ? builderOptions.table || '' : '',
    // Probe the companion table the generated SQL will reference: a saved
    // query's baked suffix wins over the current datasource config suffix.
    builderOptions.meta?.traceTimestampTableSuffix
  );

  useEffect(() => {
    if (!needsTraceTableCheck) {
      return;
    }

    // While the hook resolves on a cold cache it returns `undefined`. The
    // response-transform path has already baked the authoritative value into
    // `meta.hasTraceTimestampTable`, so leave it alone until we have a real
    // answer — otherwise a transient `false` regenerates rawSql without the
    // _trace_id_ts optimization (#1918).
    if (hasTraceTimestampTable === undefined) {
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

  const onQueryChange = useCallback(
    (newOptions: QueryBuilderOptions) => {
      onChange({
        ...query,
        pluginVersion,
        editorType: EditorType.Builder,
        rawSql: generateSql(newOptions),
        builderOptions: newOptions,
        format: mapQueryBuilderOptionsToGrafanaFormat(newOptions),
      });
    },
    [onChange, query]
  );

  const onMinIntervalChange = useCallback(
    (timeInterval: string) => {
      onChange({ ...query, timeInterval: timeInterval || undefined });
      onRunQuery();
    },
    [onChange, onRunQuery, query]
  );

  const onEditAsSql = useCallback(
    (newOptions: QueryBuilderOptions) => {
      const {
        builderOptions: discardedBuilderOptions,
        queryType: discardedQueryType,
        ...baseQuery
      } = query as CHBuilderQuery;
      void discardedBuilderOptions;
      void discardedQueryType;

      onChange({
        ...baseQuery,
        pluginVersion,
        editorType: EditorType.SQL,
        rawSql: generateSql(newOptions),
        queryType: newOptions.queryType,
        meta: {
          ...baseQuery.meta,
          builderOptions: newOptions,
        },
        format: mapQueryBuilderOptionsToGrafanaFormat(newOptions),
      });
    },
    [onChange, query]
  );

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
      minInterval={query.timeInterval}
      onQueryChange={onQueryChange}
      onEditAsSql={onEditAsSql}
      onMinIntervalChange={onMinIntervalChange}
      onRunQuery={onRunQuery}
    />
  );
};

const CompactSqlMode = (props: CHQueryEditorProps) => {
  const { datasource, query, onChange, onRunQuery } = props;
  const signalType = datasource.getSignalType();
  const [confirmSwitchOpen, setConfirmSwitchOpen] = useState(false);

  const switchToBuilder = (confirmed = false) => {
    if (!signalType) {
      return;
    }

    const builderOptions = buildCompactQueryDefaults(datasource, signalType);
    const compactSql = generateSql(builderOptions);
    // rawSql may be undefined for provisioned / hand-authored / alert query
    // models that carry only { editorType: 'sql' }; migrateCHQuery leaves those
    // unchanged, so guard before calling .trim().
    const currentSql = (query.rawSql ?? '').trim();
    if (!confirmed && currentSql && currentSql !== compactSql.trim()) {
      setConfirmSwitchOpen(true);
      return;
    }

    onChange({
      ...query,
      pluginVersion,
      editorType: EditorType.Builder,
      rawSql: compactSql,
      builderOptions,
      format: mapQueryBuilderOptionsToGrafanaFormat(builderOptions),
    });
  };

  return (
    <>
      <Stack gap={1} alignItems="center" data-testid="compact-sql-toolbar">
        <Button variant="secondary" onClick={() => switchToBuilder()}>
          Switch to compact view
        </Button>
        <Button onClick={() => onRunQuery()}>Run Query</Button>
      </Stack>
      <ConfirmModal
        isOpen={confirmSwitchOpen}
        title="Discard SQL changes?"
        body="Switching to compact view replaces the current SQL with generated compact query defaults."
        confirmText="Discard SQL and switch"
        dismissText="Cancel"
        onConfirm={() => {
          setConfirmSwitchOpen(false);
          switchToBuilder(true);
        }}
        onDismiss={() => setConfirmSwitchOpen(false)}
      />
      <div data-testid="query-editor-section-sql">
        <SqlEditor {...props} />
      </div>
    </>
  );
};
