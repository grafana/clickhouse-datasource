import React from 'react';
import { Datasource } from '../../../data/CHDatasource';
import { QueryType, QueryBuilderOptions } from 'types/queryBuilder';
import { CoreApp } from '@grafana/data';
import useColumns from 'hooks/useColumns';
import { LogsQueryBuilder } from './views/LogsQueryBuilder';
import { TimeSeriesQueryBuilder } from './views/TimeSeriesQueryBuilder';
import { TableQueryBuilder } from './views/TableQueryBuilder';
import { SqlPreview } from './SqlPreview';
import { DatabaseTableSelect } from 'components/v4/DatabaseTableSelect';
import { QueryTypeSwitcher } from 'components/v4/QueryTypeSwitcher';
import { styles } from 'styles';
import { TraceQueryBuilder } from './views/TraceQueryBuilder';

interface QueryBuilderProps {
  app: CoreApp | undefined;
  builderOptions: QueryBuilderOptions;
  onBuilderOptionsChange: (builderOptions: QueryBuilderOptions) => void;
  datasource: Datasource;
  generatedSql: string;
}

export const QueryBuilder = (props: QueryBuilderProps) => {
  const { datasource, builderOptions, onBuilderOptionsChange, generatedSql } = props;
  const allColumns = useColumns(datasource, builderOptions.database, builderOptions.table);

  const onDatabaseChange = (database: string) => onBuilderOptionsChange({ ...builderOptions, database, table: '' });
  const onTableChange = (table: string) => onBuilderOptionsChange({ ...builderOptions, table });
  const onQueryTypeChange = (queryType: QueryType) => onBuilderOptionsChange({ ...builderOptions, queryType });

  return (
    <div data-testid="query-editor-section-builder">
      <div className={'gf-form ' + styles.QueryEditor.queryType}>
        <DatabaseTableSelect
          datasource={datasource}
          database={builderOptions.database} onDatabaseChange={onDatabaseChange}
          table={builderOptions.table} onTableChange={onTableChange}
        />
      </div>
      <div className={'gf-form ' + styles.QueryEditor.queryType}>
        <QueryTypeSwitcher queryType={builderOptions.queryType} onChange={onQueryTypeChange} />
      </div>

      { builderOptions.queryType === QueryType.Table && <TableQueryBuilder allColumns={allColumns} builderOptions={builderOptions} onBuilderOptionsChange={onBuilderOptionsChange} /> }
      { builderOptions.queryType === QueryType.Logs && <LogsQueryBuilder allColumns={allColumns} builderOptions={builderOptions} onBuilderOptionsChange={onBuilderOptionsChange} /> }
      { builderOptions.queryType === QueryType.TimeSeries && <TimeSeriesQueryBuilder allColumns={allColumns} builderOptions={builderOptions} onBuilderOptionsChange={onBuilderOptionsChange} /> }
      { builderOptions.queryType === QueryType.Traces && <TraceQueryBuilder allColumns={allColumns} builderOptions={builderOptions} onBuilderOptionsChange={onBuilderOptionsChange} /> }

      <SqlPreview sql={generatedSql} />
    </div>
  );
}
