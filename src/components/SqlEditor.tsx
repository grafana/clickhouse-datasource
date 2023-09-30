import React, { useEffect, useState } from 'react';
import { CoreApp, QueryEditorProps } from '@grafana/data';
import { CodeEditor } from '@grafana/ui';
import { Datasource } from 'data/CHDatasource';
import { registerSQL, Range, Fetcher } from './sqlProvider';
import { CHConfig } from 'types/config';
import { CHQuery, EditorType, CHSqlQuery } from 'types/sql';
import { styles } from 'styles';
import { fetchSuggestions as sugg, Schema } from './suggestions';
import { selectors } from 'selectors';
import { validate } from 'data/validate';
import { mapQueryTypeToGrafanaFormat } from 'data/utils';
import { QueryType } from 'types/queryBuilder';
import { QueryTypeSwitcher } from 'components/queryBuilder/QueryTypeSwitcher';

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
  const [queryType, setQueryType] = useState<QueryType>(QueryType.Table);
  const [sql, setSql] = useState<string>('');
  const [expand, setExpand] = useState<Expand>({
    height: defaultHeight,
    icon: 'plus',
    on: sqlQuery.expand || false,
  });

  useEffect(() => {
    sqlQuery.queryType && setQueryType(sqlQuery.queryType);
    setSql(sqlQuery.rawSql);

    // Run on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onChange({
      ...query,
      editorType: EditorType.SQL,
      queryType,
      rawSql: sql,
      format: mapQueryTypeToGrafanaFormat(queryType),
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryType, sql])

  const onToggleExpand = () => {
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
    editor.expanded = (query as CHSqlQuery).expand;
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
    <>
      { app === CoreApp.Explore &&
        <div className={'gf-form ' + styles.QueryEditor.queryType}>
          <QueryTypeSwitcher queryType={queryType} onChange={setQueryType} sqlEditor />
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
          aria-label="SQL"
          height={expand.height}
          language="sql"
          value={query.rawSql || ''}
          onSave={setSql}
          showMiniMap={false}
          showLineNumbers={true}
          onBlur={setSql}
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
