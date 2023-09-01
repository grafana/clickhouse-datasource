import React from 'react';
import { QueryEditorProps } from '@grafana/data';
import { Datasource } from '../../data/CHDatasource';
import { Preview } from 'components/queryBuilder/Preview';
import { EditorTypeSwitcher } from 'components/v4/EditorTypeSwitcher';
import { QueryTypeSwitcher } from 'components/v4/QueryTypeSwitcher';
import { styles } from 'styles';
import { Button } from '@grafana/ui';
import { EditorType, QueryType, CHBuilderQuery, defaultCHBuilderQuery } from 'types/sql';
import { CHConfig } from 'types/config';
import { CHQuery } from 'types/sql';
import { SqlBuilderOptions } from 'types/queryBuilder';
import { SqlEditor } from 'components/v4/SqlEditor';
import { QueryBuilder } from 'components/v4/queryBuilder/QueryBuilder';
import { getSQLFromQueryOptions } from 'components/queryBuilder/utils';
import { DatabaseTableSelect } from 'components/v4/DatabaseTableSelect';

export type CHQueryEditorProps = QueryEditorProps<Datasource, CHQuery, CHConfig>;

/**
 * Top level query editor component
 */
export const CHQueryEditor = (props: CHQueryEditorProps) => {
  const { query, onChange, onRunQuery } = props;

  React.useEffect(() => {
    if (!query.queryType) {
      onChange({ ...query, queryType: QueryType.Table });
    }
    if (!query.database) {
      onChange({ ...query, database: props.datasource.getDefaultDatabase() || 'default' });
    }
  }, [query, onChange]);

  const runQuery = () => {
    if (query.editorType === EditorType.SQL) {
      // const format = getFormat(query.rawSql, query.selectedFormat);
      // if (format !== query.format) {
        // onChange({ ...query, format });
        onChange({ ...query });
      // }
    }
    onRunQuery();
  };

  const onDatabaseChange = (db: string) => onChange({ ...query, database: db });
  const onTableChange = (t: string) => onChange({ ...query, table: t });

  // const onFormatChange = (selectedFormat: Format) => {
  //   switch (query.queryType) {
  //     case QueryType.SQL:
  //       onChange({ ...query, format: getFormat(query.rawSql, selectedFormat), selectedFormat });
  //     case QueryType.Builder:
  //     default:
  //       if (selectedFormat === Format.AUTO) {
  //         let builderOptions = (query as CHBuilderQuery).builderOptions;
  //         const format = builderOptions && builderOptions.mode === BuilderMode.Trend ? Format.TIMESERIES : Format.TABLE;
  //         onChange({ ...query, format, selectedFormat });
  //       } else {
  //         onChange({ ...query, format: selectedFormat, selectedFormat });
  //       }
  //   }
  // };

  return (
    <>
      <div className={'gf-form ' + styles.QueryEditor.queryType}>
          <EditorTypeSwitcher {...props} />
        <Button onClick={() => runQuery()}>Run Query</Button>
      </div>
      <div className={'gf-form ' + styles.QueryEditor.queryType}>
        <DatabaseTableSelect
          datasource={props.datasource}
          database={props.query.database} onDatabaseChange={onDatabaseChange}
          table={props.query.table} onTableChange={onTableChange}
        />
      </div>
      <div className={'gf-form ' + styles.QueryEditor.queryType}>
        <QueryTypeSwitcher queryType={query.queryType} onChange={t => onChange({ ...query, queryType: t })} />
      </div>
      <CHEditorByType {...props} />
    </>
  );
};

const CHEditorByType = (props: CHQueryEditorProps) => {
  const { query, onChange, app } = props;
  const onBuilderOptionsChange = (builderOptions: SqlBuilderOptions) => {
    const sql = getSQLFromQueryOptions(query.database, query.table, builderOptions);
    onChange({ ...query, editorType: EditorType.Builder, rawSql: sql, builderOptions });
  };

  switch (query.editorType) {
    case EditorType.SQL:
      return (
        <div data-testid="query-editor-section-sql">
          <SqlEditor {...props} />
        </div>
      );
    case EditorType.Builder:
    default:
      let newQuery: CHBuilderQuery = { ...query };
      if (query.rawSql && !query.builderOptions) {
        return (
          <div data-testid="query-editor-section-sql">
            <SqlEditor {...props} />
          </div>
        );
      }
      if (!query.rawSql || !query.builderOptions) {
        newQuery = {
          ...newQuery,
          rawSql: defaultCHBuilderQuery.rawSql,
          builderOptions: {
            ...defaultCHBuilderQuery.builderOptions,
          },
        };
      }
      return (
        <div data-testid="query-editor-section-builder">
          <QueryBuilder
            datasource={props.datasource}
            builderOptions={newQuery.builderOptions}
            onBuilderOptionsChange={onBuilderOptionsChange}
            queryType={newQuery.queryType}
            database={props.query.database}
            table={props.query.table}
            app={app}
          />
          <Preview sql={newQuery.rawSql} />
        </div>
      );
  }
};
