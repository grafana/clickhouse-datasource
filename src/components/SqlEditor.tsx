import React, { useEffect, useRef } from 'react';
import { PanelData, QueryEditorProps } from '@grafana/data';
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

type SqlEditorProps = QueryEditorProps<Datasource, CHQuery, CHConfig>;

// Kept apart from the 'clickhouse' owner of the as-you-type validation, so each clears only its own markers.
const queryErrorOwner = 'clickhouse-query-error';

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
  }, [props.data, query.refId]);

  const handleMount = (editor: monacoTypes.editor.IStandaloneCodeEditor, monaco: typeof monacoTypes) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    showQueryErrors(editor, monaco, props.data, query.refId);
    // The marker belongs to the SQL that ran, so it goes away as soon as the text changes.
    editor.onDidChangeModelContent(() => {
      const model = editor.getModel();
      if (model) {
        monaco.editor.setModelMarkers(model, queryErrorOwner, []);
      }
    });
    const registration = registerSQL('sql', editor, _getSuggestions);
    disposeRegistrationRef.current = registration.dispose;
    setupAutoSize(editor);
    editor.onKeyUp((e: any) => {
      if (datasource.settings.jsonData.validateSql) {
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
