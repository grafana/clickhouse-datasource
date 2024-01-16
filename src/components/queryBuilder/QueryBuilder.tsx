import React from 'react';
import { Datasource } from 'data/CHDatasource';
import { QueryType, QueryBuilderOptions } from 'types/queryBuilder';
import { CoreApp } from '@grafana/data';
import { LogsQueryBuilder } from './views/LogsQueryBuilder';
import { TimeSeriesQueryBuilder } from './views/TimeSeriesQueryBuilder';
import { TableQueryBuilder } from './views/TableQueryBuilder';
import { SqlPreview } from './SqlPreview';
import { DatabaseTableSelect } from 'components/queryBuilder/DatabaseTableSelect';
import { QueryTypeSwitcher } from 'components/queryBuilder/QueryTypeSwitcher';
import { styles } from 'styles';
import { TraceQueryBuilder } from './views/TraceQueryBuilder';
import { BuilderOptionsReducerAction, setBuilderMinimized, setDatabase, setQueryType, setTable } from 'hooks/useBuilderOptionsState';
import TraceIdInput from './TraceIdInput';
import { Button } from '@grafana/ui';
import { Components as allSelectors } from 'selectors';
import allLabels from 'labels';

interface QueryBuilderProps {
  app: CoreApp | undefined;
  builderOptions: QueryBuilderOptions;
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>,
  datasource: Datasource;
  generatedSql: string;
}

export const QueryBuilder = (props: QueryBuilderProps) => {
  const { datasource, builderOptions, builderOptionsDispatch, generatedSql } = props;

  const onDatabaseChange = (database: string) => builderOptionsDispatch(setDatabase(database));
  const onTableChange = (table: string) => builderOptionsDispatch(setTable(table));
  const onQueryTypeChange = (queryType: QueryType) => builderOptionsDispatch(setQueryType(queryType));

  if (builderOptions.meta?.minimized) {
    const isTraceIdLookup = builderOptions.queryType === QueryType.Traces && builderOptions.meta?.isTraceIdMode && builderOptions.meta.traceId;

    return (
      <div data-testid="query-editor-section-builder">
        {isTraceIdLookup && <TraceIdInput traceId={builderOptions.meta.traceId!} onChange={() => {}} disabled /> }

        <Button
          data-testid={allSelectors.QueryBuilder.expandBuilderButton}
          icon="plus"
          variant="secondary"
          size="md"
          onClick={() => builderOptionsDispatch(setBuilderMinimized(false))}
          className={styles.Common.smallBtn}
          tooltip={allLabels.components.expandBuilderButton.tooltip}
        >
          {allLabels.components.expandBuilderButton.label}
        </Button>
      </div>
    );
  }

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

      { builderOptions.queryType === QueryType.Table && <TableQueryBuilder datasource={datasource} builderOptions={builderOptions} builderOptionsDispatch={builderOptionsDispatch} /> }
      { builderOptions.queryType === QueryType.Logs && <LogsQueryBuilder datasource={datasource} builderOptions={builderOptions} builderOptionsDispatch={builderOptionsDispatch} /> }
      { builderOptions.queryType === QueryType.TimeSeries && <TimeSeriesQueryBuilder datasource={datasource} builderOptions={builderOptions} builderOptionsDispatch={builderOptionsDispatch} /> }
      { builderOptions.queryType === QueryType.Traces && <TraceQueryBuilder datasource={datasource} builderOptions={builderOptions} builderOptionsDispatch={builderOptionsDispatch} /> }

      <SqlPreview sql={generatedSql} />
    </div>
  );
}
