import React, { useState } from 'react';
import { CoreApp, QueryEditorProps } from '@grafana/data';
import { CodeEditor } from '@grafana/ui';
import { Datasource } from 'data/CHDatasource';
import { registerSQL, Range, Fetcher } from './sqlProvider';
import { CHConfig } from 'types/config';
import { CHQuery, EditorType, CHSqlQuery } from 'types/sql';
import { styles } from 'styles';
import { fetchSuggestions, Schema } from './suggestions';
import { selectors } from 'selectors';
import { validate } from 'data/validate';
import { mapQueryTypeToGrafanaFormat } from 'data/utils';
import { QueryType } from 'types/queryBuilder';
import { QueryTypeSwitcher } from 'components/queryBuilder/QueryTypeSwitcher';
import { pluginVersion } from 'utils/version';

type SqlEditorProps = QueryEditorProps<Datasource, CHQuery, CHConfig>;

interface Expand {
  height: string;
  icon: 'plus' | 'minus';
  on: boolean;
}

export const SqlEditor = (props: SqlEditorProps) => {
  const defaultHeight = '150px';
  const { app, query, onChange, datasource } = props;
  const sqlQuery = query as CHSqlQuery;
  const [codeEditor, setCodeEditor] = useState<any>();
  const [expand, setExpand] = useState<Expand>({
    height: defaultHeight,
    icon: 'plus',
    on: sqlQuery.expand || false,
  });
  const queryType = sqlQuery.queryType || QueryType.Table;

  const saveChanges = (changes: Partial<CHSqlQuery>) => {
    onChange({
      ...sqlQuery,
      pluginVersion,
      editorType: EditorType.SQL,
      format: mapQueryTypeToGrafanaFormat(changes.queryType || queryType),
      ...changes
    });
  }

  const updateExpand = (expand: Expand) => {
    setExpand(expand);
    saveChanges({ expand: expand.on });
  }

  const onToggleExpand = () => {
    const on = !expand.on;
    const icon = on ? 'minus' : 'plus';

    if (!codeEditor) {
      return;
    }
    if (on) {
      codeEditor.expanded = true;
      const height = getEditorHeight(codeEditor);
      updateExpand({ height: `${height}px`, on, icon });
      return;
    }

    codeEditor.expanded = false;
    updateExpand({ height: defaultHeight, icon, on });
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

  const handleMount = (editor: any) => {
    const me = registerSQL('chSql', editor, getSuggestions);
    editor.expanded = (query as CHSqlQuery).expand;
    editor.onDidChangeModelDecorations((a: any) => {
      if (editor.expanded) {
        const height = getEditorHeight(editor);
        updateExpand({ height: `${height}px`, on: true, icon: 'minus' });
      }
    });
    editor.onKeyUp((e: any) => {
      if (datasource.settings.jsonData.validateSql) {
        const sql = editor.getValue();
        validateSql(sql, editor.getModel(), me);
      }
    });
    setCodeEditor(editor);
  };

  return (
    <>
      {/* Only show in explore view where panel can't be manually selected. Dashboard view lets you change the panel. */}
      { app === CoreApp.Explore &&
        <div className={'gf-form ' + styles.QueryEditor.queryType}>
          <QueryTypeSwitcher queryType={queryType} onChange={queryType => saveChanges({ queryType })} sqlEditor />
        </div>
      }
      <div className={styles.Common.wrapper}>
        <a
          onClick={() => onToggleExpand()}
          className={styles.Common.expand}
          data-testid={selectors.components.QueryEditor.CodeEditor.Expand}
        >
          <i className={`fa fa-${expand.icon}`}></i>
        </a>
        <CodeEditor
          aria-label="SQL Editor"
          height={expand.height}
          language="sql"
          value={query.rawSql}
          onSave={sql => saveChanges({ rawSql: sql })}
          showMiniMap={false}
          showLineNumbers={true}
          onBlur={sql => saveChanges({ rawSql: sql })}
          onEditorDidMount={(editor: any) => handleMount(editor)}
        />
      </div>
    </>
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
