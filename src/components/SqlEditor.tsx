import React, { useEffect, useRef } from 'react';
import { getDefaultTimeRange, LoadingState, PanelData, QueryEditorProps } from '@grafana/data';
import { CodeEditor, InlineFieldRow, monacoTypes } from '@grafana/ui';
import { Datasource } from 'data/CHDatasource';
import { registerSQL, Range, Fetcher } from './sqlProvider';
import { CHConfig } from 'types/config';
import { CHQuery, EditorType, CHSqlQuery } from 'types/sql';
import { styles } from 'styles';
import { getSuggestions } from './suggestions';
import { validate } from 'data/validate';
import { mapQueryTypeToGrafanaFormat } from 'data/utils';
import { QueryType } from 'types/queryBuilder';
import { QueryTypeSwitcher } from 'components/queryBuilder/QueryTypeSwitcher';
import { pluginVersion } from 'utils/version';
import { useSchemaSuggestionsProvider } from 'hooks/useSchemaSuggestionsProvider';
import { QueryToolbox } from './QueryToolbox';
import { MinIntervalEditor } from './MinIntervalEditor';
import { getRunErrorMarkers } from './sqlErrorMarker';
import { createSqlServerCheck, SqlServerCheck } from './sqlServerCheck';

type SqlEditorProps = QueryEditorProps<Datasource, CHQuery, CHConfig>;

// Kept apart from the 'clickhouse' owner of the as-you-type validation, so each clears only its own markers.
const queryErrorOwner = 'clickhouse-query-error';
// Markers from checking the text with the server while it is edited.
const queryCheckOwner = 'clickhouse-query-check';
// How long typing has to pause before the text is checked.
const queryCheckDelayMs = 800;

function showQueryErrors(
  editor: monacoTypes.editor.IStandaloneCodeEditor | null,
  monaco: typeof monacoTypes | null,
  data: PanelData | undefined,
  refId: string
) {
  const model = editor?.getModel();
  if (!editor || !monaco || !model) {
    return;
  }
  const markers = getRunErrorMarkers(data, refId, editor.getValue()).map((marker) => ({
    ...marker,
    severity: monaco.MarkerSeverity.Error,
    source: 'ClickHouse',
  }));
  monaco.editor.setModelMarkers(model, queryErrorOwner, markers);
}

// Whether the cursor is in or right after the text of `marker`, as it is while that name is typed.
function touchesCursor(marker: monacoTypes.editor.IMarkerData, cursor: monacoTypes.IPosition | null): boolean {
  return (
    !!cursor &&
    marker.startLineNumber === cursor.lineNumber &&
    cursor.column >= marker.startColumn &&
    cursor.column <= marker.endColumn
  );
}

function setupAutoSize(editor: monacoTypes.editor.IStandaloneCodeEditor) {
  const container = editor.getDomNode();
  const updateHeight = () => {
    if (container) {
      const contentHeight = Math.max(100, Math.min(1000, editor.getContentHeight()));
      const width = parseInt(container.style.width, 10);
      container.style.width = `${width}px`;
      container.style.height = `${contentHeight}px`;
      editor.layout({ width, height: contentHeight });
    }
  };
  editor.onDidContentSizeChange(updateHeight);
  updateHeight();
}

export const SqlEditor = (props: SqlEditorProps) => {
  const { query, onChange, onRunQuery, datasource } = props;
  const editorRef = useRef<monacoTypes.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monacoTypes | null>(null);
  const disposeRegistrationRef = useRef<(() => void) | null>(null);
  const queryCheckRef = useRef<SqlServerCheck | null>(null);
  const queryCheckTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The SQL of the last run that succeeded, which needs no check.
  const lastGoodRunRef = useRef<string | undefined>(undefined);
  // The unknown names of the last check, and those held back because the cursor was on them.
  const nameMarkersRef = useRef<{ all: monacoTypes.editor.IMarkerData[]; held: Set<monacoTypes.editor.IMarkerData> }>({
    all: [],
    held: new Set(),
  });
  const rangeRef = useRef(props.range);
  rangeRef.current = props.range;
  // On unless the data source turns "Validate SQL" off.
  const validationEnabled = datasource.settings.jsonData.validateSql !== false;
  const sqlQuery = query as CHSqlQuery;
  const queryType = sqlQuery.queryType || QueryType.Table;

  const saveChanges = (changes: Partial<CHSqlQuery>) => {
    onChange({
      ...sqlQuery,
      pluginVersion,
      editorType: EditorType.SQL,
      format: mapQueryTypeToGrafanaFormat(changes.queryType || queryType),
      ...changes,
    });
  };

  const schema = useSchemaSuggestionsProvider(datasource);

  const _getSuggestions: Fetcher = async (text: string, range: Range, cursorPosition: number) => {
    const suggestions = await getSuggestions(text, schema, range, cursorPosition);
    return { suggestions };
  };

  const validateSql = (sql: string, model: any, me: any) => {
    const v = validate(sql);
    const errorSeverity = 8;
    if (v.valid) {
      me.setModelMarkers(model, 'clickhouse', []);
    } else {
      const err = v.error!;
      me.setModelMarkers(model, 'clickhouse', [
        {
          startLineNumber: err.startLine,
          startColumn: err.startCol,
          endLineNumber: err.endLine,
          endColumn: err.endCol,
          message: err.expected,
          severity: errorSeverity,
        },
      ]);
    }
  };

  // Show where the last run failed, for example after Run Query, and again when new results arrive.
  useEffect(() => {
    showQueryErrors(editorRef.current, monacoRef.current, props.data, query.refId);
    const ran = props.data?.request?.targets.find((target) => target.refId === query.refId);
    const ranSql = ran && 'rawSql' in ran && typeof ran.rawSql === 'string' ? ran.rawSql : undefined;
    const failed = (props.data?.errors ?? []).some((error) => !error.refId || error.refId === query.refId);
    if (ranSql !== undefined && props.data?.state === LoadingState.Done && !failed) {
      lastGoodRunRef.current = ranSql;
    }
    // A run of the current text replaces what the check said about it.
    const model = editorRef.current?.getModel();
    if (model && monacoRef.current && ranSql !== undefined && ranSql === editorRef.current?.getValue()) {
      monacoRef.current.editor.setModelMarkers(model, queryCheckOwner, []);
      nameMarkersRef.current = { all: [], held: new Set() };
    }
  }, [props.data, query.refId]);

  const runQueryCheck = (editor: monacoTypes.editor.IStandaloneCodeEditor, monaco: typeof monacoTypes) => {
    const queryCheck = queryCheckRef.current;
    const sql = editor.getValue();
    if (!queryCheck || !validationEnabled || sql === lastGoodRunRef.current) {
      return;
    }
    queryCheck.check(sql).then((outcome) => {
      const model = editor.getModel();
      if (!model || editor.getValue() !== sql) {
        return;
      }
      if (outcome.kind === 'skipped' && outcome.retryInMs) {
        queryCheckTimerRef.current = setTimeout(() => runQueryCheck(editor, monaco), outcome.retryInMs);
        return;
      }
      if (outcome.kind === 'ok') {
        monaco.editor.setModelMarkers(model, queryCheckOwner, []);
      } else if (outcome.kind === 'names') {
        // A name under the cursor is most likely still being typed, with the suggestions open, so it
        // is marked once the cursor moves off it.
        const cursor = editor.getPosition();
        const all = outcome.markers.map((marker) => ({
          ...marker,
          severity: monaco.MarkerSeverity.Error,
          source: 'ClickHouse',
        }));
        const held = new Set(all.filter((marker) => touchesCursor(marker, cursor)));
        nameMarkersRef.current = { all, held };
        monaco.editor.setModelMarkers(
          model,
          queryCheckOwner,
          all.filter((marker) => !held.has(marker))
        );
      } else if (outcome.kind === 'syntax') {
        // An error at the end of the query, or ahead of the cursor on its line, is most likely text
        // still being typed, so it is shown as a warning.
        const cursor = editor.getPosition();
        const ahead =
          !!cursor &&
          outcome.marker.startLineNumber === cursor.lineNumber &&
          outcome.marker.startColumn >= cursor.column - 1;
        const severity = outcome.atEnd || ahead ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error;
        monaco.editor.setModelMarkers(model, queryCheckOwner, [{ ...outcome.marker, severity, source: 'ClickHouse' }]);
      }
    });
  };

  const handleMount = (editor: monacoTypes.editor.IStandaloneCodeEditor, monaco: typeof monacoTypes) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    showQueryErrors(editor, monaco, props.data, query.refId);
    queryCheckRef.current = createSqlServerCheck(
      datasource,
      query.refId,
      () => rangeRef.current ?? getDefaultTimeRange()
    );
    // Markers belong to the text they were made for, so they go away as soon as it changes. Once
    // typing pauses, the new text is checked; nothing is sent when the editor opens.
    editor.onDidChangeModelContent(() => {
      const model = editor.getModel();
      if (model) {
        monaco.editor.setModelMarkers(model, queryCheckOwner, []);
        monaco.editor.setModelMarkers(model, queryErrorOwner, []);
      }
      nameMarkersRef.current = { all: [], held: new Set() };
      clearTimeout(queryCheckTimerRef.current);
      queryCheckTimerRef.current = setTimeout(() => runQueryCheck(editor, monaco), queryCheckDelayMs);
    });
    // Moving the cursor off a name that was held back marks it, with no new check.
    editor.onDidChangeCursorPosition((event) => {
      const { all, held } = nameMarkersRef.current;
      const model = editor.getModel();
      const released = [...held].filter((marker) => !touchesCursor(marker, event.position));
      if (!model || released.length === 0) {
        return;
      }
      released.forEach((marker) => held.delete(marker));
      monaco.editor.setModelMarkers(
        model,
        queryCheckOwner,
        all.filter((marker) => !held.has(marker))
      );
    });
    const registration = registerSQL('sql', editor, _getSuggestions);
    disposeRegistrationRef.current = registration.dispose;
    setupAutoSize(editor);
    editor.onKeyUp((e: any) => {
      if (validationEnabled) {
        const sql = editor.getValue();
        validateSql(sql, editor.getModel(), registration.monacoEditor);
      }
    });

    editor.addAction({
      id: 'run-query',
      label: 'Run Query',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: (editor: monacoTypes.editor.IStandaloneCodeEditor) => {
        saveChanges({ rawSql: editor.getValue() });
        props.onRunQuery();
      },
    });
  };

  const onEditorWillUnmount = () => {
    clearTimeout(queryCheckTimerRef.current);
    queryCheckRef.current?.cancel();
    queryCheckRef.current = null;
    disposeRegistrationRef.current?.();
    disposeRegistrationRef.current = null;
    editorRef.current = null;
    monacoRef.current = null;
  };
  const triggerFormat = () => {
    if (editorRef.current !== null) {
      editorRef.current.trigger('editor', 'editor.action.formatDocument', '');
    }
  };

  return (
    <>
      <InlineFieldRow className={styles.QueryEditor.queryType}>
        <QueryTypeSwitcher queryType={queryType} onChange={(queryType) => saveChanges({ queryType })} sqlEditor />
      </InlineFieldRow>
      <InlineFieldRow className={styles.QueryEditor.queryType}>
        <MinIntervalEditor
          minInterval={sqlQuery.minInterval}
          onMinIntervalChange={(minInterval) => {
            // Deliberately not saveChanges: that recomputes `format` from
            // queryType, which flips a hand-authored model carrying only
            // { editorType, format } to the Table format.
            onChange({ ...sqlQuery, minInterval: minInterval || undefined });
            onRunQuery();
          }}
        />
      </InlineFieldRow>
      <div className={styles.Common.wrapper}>
        <CodeEditor
          aria-label="SQL Editor"
          language="sql"
          value={query.rawSql}
          onSave={(sql) => saveChanges({ rawSql: sql })}
          showMiniMap={false}
          showLineNumbers={true}
          onBlur={(sql) => saveChanges({ rawSql: sql })}
          onEditorDidMount={handleMount}
          onEditorWillUnmount={onEditorWillUnmount}
        />
        <QueryToolbox showTools onFormatCode={triggerFormat} />
      </div>
    </>
  );
};
