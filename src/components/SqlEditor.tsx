import React from 'react';
import { QueryEditorProps } from '@grafana/data';
import { CodeEditor, monacoTypes } from '@grafana/ui';
import { Datasource } from 'data/CHDatasource';
import { registerSQL, Range, Fetcher } from './sqlProvider';
import { CHConfig } from 'types/config';
import { CHQuery, EditorType, CHSqlQuery } from 'types/sql';
import { styles } from 'styles';
import { fetchSuggestions, Schema } from './suggestions';
import { validate } from 'data/validate';
import { mapQueryTypeToGrafanaFormat } from 'data/utils';
import { QueryType } from 'types/queryBuilder';
import { QueryTypeSwitcher } from 'components/queryBuilder/QueryTypeSwitcher';
import { pluginVersion } from 'utils/version';

type SqlEditorProps = QueryEditorProps<Datasource, CHQuery, CHConfig>;

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
  const { query, onChange, datasource } = props;
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

  const schema: Schema = {
    databases: () => datasource.fetchDatabases(),
    tables: (db?: string) => datasource.fetchTables(db),
    fields: (db: string, table: string) => datasource.fetchFields(db, table),
    defaultDatabase: datasource.getDefaultDatabase(),
  };

  const getSuggestions: Fetcher = async (text: string, range: Range) => {
    const suggestions = await fetchSuggestions(text, schema, range);
    return Promise.resolve({ suggestions });
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

  const handleMount = (editor: monacoTypes.editor.IStandaloneCodeEditor, monaco: typeof monacoTypes) => {
    const me = registerSQL('chSql', editor, getSuggestions);
    setupAutoSize(editor);
    editor.onKeyUp((e: any) => {
      if (datasource.settings.jsonData.validateSql) {
        const sql = editor.getValue();
        validateSql(sql, editor.getModel(), me);
      }
    });
    editor.addAction({
      id: 'run-query',
      label: 'Run Query',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: function() {
        props.onRunQuery();
      },
    });
  };

  return (
    <>
      <div className={'gf-form ' + styles.QueryEditor.queryType}>
        <QueryTypeSwitcher queryType={queryType} onChange={(queryType) => saveChanges({ queryType })} sqlEditor />
      </div>
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
        />
      </div>
    </>
  );
};
