import React from 'react';
import { QueryEditorProps } from '@grafana/data';
import { CodeEditor } from '@grafana/ui';
import { Datasource } from '../data/CHDatasource';
import { registerSQL, Range, Fetcher } from './sqlProvider';
import { CHQuery, CHConfig, Format } from '../types';
import { styles } from '../styles';
import { fetchSuggestions as sugg, Schema } from './suggestions';
import { selectors } from 'selectors';
import sqlToAST from '../data/ast';
import { isString } from 'lodash';

type SQLEditorProps = QueryEditorProps<Datasource, CHQuery, CHConfig>;

export const SQLEditor = (props: SQLEditorProps) => {
  const { query, onRunQuery, onChange, datasource } = props;

  const getFormat = (sql: string): Format => {
    // convention to format as time series
    // first field as "time" alias and requires at least 2 fields (time and metric)
    const ast = sqlToAST(sql);
    const select = ast.get('SELECT');
    if (isString(select)) {
      const fields = select.split(',');
      if (fields.length > 1) {
        return fields[0].toLowerCase().endsWith('as time') ? Format.TIMESERIES : Format.TABLE;
      }
    }
    return Format.TABLE;
  };

  const onSqlChange = (sql: string) => {
    const format = getFormat(sql);
    onChange({ ...query, rawSql: sql, format });
    onRunQuery();
  };

  const schema: Schema = {
    databases: () => datasource.fetchDatabases(),
    tables: (db?: string) => datasource.fetchTables(db),
    fields: (table) => datasource.fetchFields(table),
    defaultDatabase: datasource.getDefaultDatabase(),
  };

  const fetchSuggestions: Fetcher = async (text: string, range: Range) => {
    const suggestions = await sugg(text, schema, range);
    return Promise.resolve({ suggestions });
  };

  const handleMount = (editor: any) => registerSQL('chSql', editor, fetchSuggestions);
  return (
    <div className={styles.Common.wrapper}>
      <a
        onClick={() => onSqlChange(query.rawSql || '')}
        className={styles.Common.run}
        data-testid={selectors.components.QueryEditor.CodeEditor.Run}
      >
        <i className="fa fa-play"></i>
      </a>
      <CodeEditor
        aria-label="SQL"
        height="150px"
        language="sql"
        value={query.rawSql || ''}
        onSave={onSqlChange}
        showMiniMap={false}
        showLineNumbers={true}
        onBlur={(text) => onChange({ ...query, rawSql: text })}
        onEditorDidMount={handleMount}
      />
    </div>
  );
};
