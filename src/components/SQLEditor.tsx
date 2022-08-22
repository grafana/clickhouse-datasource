import React, { useState } from 'react';
import { QueryEditorProps } from '@grafana/data';
import { CodeEditor, InlineSwitch } from '@grafana/ui';
import { Datasource } from '../data/CHDatasource';
import { registerSQL, Range, Fetcher } from './sqlProvider';
import { CHQuery, CHConfig, QueryType, CHSQLQuery } from '../types';
import { styles } from '../styles';
import { fetchSuggestions as sugg, Schema } from './suggestions';
import { selectors } from 'selectors';
import { getFormat } from './editor';
import { validate } from 'data/validate';

type SQLEditorProps = QueryEditorProps<Datasource, CHQuery, CHConfig>;

interface Expand {
  height: string;
  icon: 'plus' | 'minus';
  on: boolean;
}

export const SQLEditor = (props: SQLEditorProps) => {
  const defaultHeight = '150px';
  const { query, onRunQuery, onChange, datasource } = props;
  const [codeEditor, setCodeEditor] = useState<any>();
  const [expand, setExpand] = useState<Expand>({
    height: defaultHeight,
    icon: 'plus',
    on: (query as CHSQLQuery).expand || false,
  });

  const onSqlChange = (sql: string) => {
    const format = getFormat(sql);
    onChange({ ...query, rawSql: sql, format, queryType: QueryType.SQL });
    onRunQuery();
  };

  const onIsExploreChange = (val: boolean) => {
    onChange({ ...query, isExploreLog: val});
    onRunQuery();
  };

  const onToggleExpand = () => {
    const sqlQuery = query as CHSQLQuery;
    const on = !expand.on;
    const icon = on ? 'minus' : 'plus';
    onChange({ ...sqlQuery, expand: on });

    if (!codeEditor) {
      return;
    }
    if (on) {
      codeEditor.expanded = true;
      const height = getEditorHeight(codeEditor);
      setExpand({ height: `${height}px`, on, icon });
      return;
    }

    codeEditor.expanded = false;
    setExpand({ height: defaultHeight, icon, on });
  };

  const schema: Schema = {
    databases: () => datasource.fetchDatabases(),
    tables: (db?: string) => datasource.fetchTables(db),
    fields: (db: string, table: string) => datasource.fetchFields(db, table),
    defaultDatabase: datasource.getDefaultDatabase(),
  };

  const fetchSuggestions: Fetcher = async (text: string, range: Range) => {
    const suggestions = await sugg(text, schema, range);
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

  const handleMount = (editor: any) => {
    const me = registerSQL('chSql', editor, fetchSuggestions);
    editor.expanded = (query as CHSQLQuery).expand;
    editor.onDidChangeModelDecorations((a: any) => {
      if (editor.expanded) {
        const height = getEditorHeight(editor);
        setExpand({ height: `${height}px`, on: true, icon: 'minus' });
      }
    });
    editor.onKeyUp((e: any) => {
      if (datasource.settings.jsonData.validate) {
        const sql = editor.getValue();
        validateSql(sql, editor.getModel(), me);
      }
    });
    setCodeEditor(editor);
  };

  return (
    <div className={styles.Common.wrapper}>
      <a
        onClick={() => onToggleExpand()}
        className={styles.Common.expand}
        data-testid={selectors.components.QueryEditor.CodeEditor.Expand}
      >
        <i className={`fa fa-${expand.icon}`}></i>
      </a>
      <CodeEditor
        aria-label="SQL"
        height={expand.height}
        language="sql"
        value={query.rawSql || ''}
        onSave={onSqlChange}
        showMiniMap={false}
        showLineNumbers={true}
        onBlur={(text) => onChange({ ...query, rawSql: text })}
        onEditorDidMount={(editor: any) => handleMount(editor)}
      />
      { props.app === 'explore' ? 
      <InlineSwitch
        aria-label="formatLogs"
        label="Format as logs"
        showLabel={true}
        value={query.isExploreLog || false}
        onChange={(e) => onIsExploreChange(e.currentTarget.checked)}
        transparent={true}
      /> : ''}
    </div>
  );
};

const getEditorHeight = (editor: any): number | undefined => {
  const editorElement = editor.getDomNode();
  if (!editorElement) {
    return;
  }

  const lineCount = editor.getModel()?.getLineCount() || 1;
  return editor.getTopForLineNumber(lineCount + 1) + 40;
};
