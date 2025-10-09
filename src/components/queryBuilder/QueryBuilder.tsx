import React, { useMemo } from 'react';
import { Datasource } from 'data/CHDatasource';
import { QueryType, QueryBuilderOptions, ColumnHint, StringFilter } from 'types/queryBuilder';
import { CoreApp } from '@grafana/data';
import { LogsQueryBuilder } from './views/LogsQueryBuilder';
import { TimeSeriesQueryBuilder } from './views/TimeSeriesQueryBuilder';
import { TableQueryBuilder } from './views/TableQueryBuilder';
import { SqlPreview } from './SqlPreview';
import { DatabaseTableSelect } from 'components/queryBuilder/DatabaseTableSelect';
import { QueryTypeSwitcher } from 'components/queryBuilder/QueryTypeSwitcher';
import { styles } from 'styles';
import { TraceQueryBuilder } from './views/TraceQueryBuilder';
import {
  BuilderOptionsReducerAction,
  setBuilderMinimized,
  setDatabase,
  setQueryType,
  setTable,
} from 'hooks/useBuilderOptionsState';
import TraceIdInput from './TraceIdInput';
import { Alert, Button, VerticalGroup } from '@grafana/ui';
import { Components as allSelectors } from 'selectors';
import allLabels from 'labels';

interface QueryBuilderProps {
  app: CoreApp | undefined;
  builderOptions: QueryBuilderOptions;
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>;
  datasource: Datasource;
  generatedSql: string;
}

export const QueryBuilder = (props: QueryBuilderProps) => {
  const { datasource, builderOptions, builderOptionsDispatch, generatedSql } = props;

  const onDatabaseChange = (database: string) => builderOptionsDispatch(setDatabase(database));
  const onTableChange = (table: string) => builderOptionsDispatch(setTable(table));
  const onQueryTypeChange = (queryType: QueryType) => builderOptionsDispatch(setQueryType(queryType));

  if (builderOptions.meta?.minimized) {
    return (
      <MinimizedQueryViewer
        builderOptions={builderOptions}
        builderOptionsDispatch={builderOptionsDispatch}
        datasource={datasource}
      />
    );
  }

  return (
    <div data-testid="query-editor-section-builder">
      <div className={'gf-form ' + styles.QueryEditor.queryType}>
        <DatabaseTableSelect
          datasource={datasource}
          database={builderOptions.database}
          onDatabaseChange={onDatabaseChange}
          table={builderOptions.table}
          onTableChange={onTableChange}
        />
      </div>
      <div className={'gf-form ' + styles.QueryEditor.queryType}>
        <QueryTypeSwitcher queryType={builderOptions.queryType} onChange={onQueryTypeChange} />
      </div>

      {builderOptions.queryType === QueryType.Table && (
        <TableQueryBuilder
          datasource={datasource}
          builderOptions={builderOptions}
          builderOptionsDispatch={builderOptionsDispatch}
        />
      )}
      {builderOptions.queryType === QueryType.Logs && (
        <LogsQueryBuilder
          datasource={datasource}
          builderOptions={builderOptions}
          builderOptionsDispatch={builderOptionsDispatch}
        />
      )}
      {builderOptions.queryType === QueryType.TimeSeries && (
        <TimeSeriesQueryBuilder
          datasource={datasource}
          builderOptions={builderOptions}
          builderOptionsDispatch={builderOptionsDispatch}
        />
      )}
      {builderOptions.queryType === QueryType.Traces && (
        <TraceQueryBuilder
          datasource={datasource}
          builderOptions={builderOptions}
          builderOptionsDispatch={builderOptionsDispatch}
        />
      )}

      <SqlPreview sql={generatedSql} />
    </div>
  );
};

interface MinimizedQueryBuilder {
  builderOptions: QueryBuilderOptions;
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>;
  datasource: Datasource;
}

const MinimizedQueryViewer = (props: MinimizedQueryBuilder) => {
  const { builderOptions, builderOptionsDispatch, datasource } = props;
  const defaultColumns = useMemo<Map<ColumnHint, string> | undefined>(() => {
    if (builderOptions.queryType === QueryType.Logs) {
      return datasource.getDefaultLogsColumns();
    } else if (builderOptions.queryType === QueryType.Traces) {
      return datasource.getDefaultTraceColumns();
    }

    return undefined;
  }, [builderOptions.queryType, datasource]);
  const showConfigWarning = defaultColumns?.size === 0 && builderOptions.columns?.length === 0;
  const configQueryType =
    builderOptions.queryType === QueryType.Logs
      ? 'logs'
      : builderOptions.queryType === QueryType.Traces
        ? 'trace'
        : builderOptions.queryType;

  let traceId;
  if (
    builderOptions.queryType === QueryType.Traces &&
    builderOptions.meta?.isTraceIdMode &&
    builderOptions.meta.traceId
  ) {
    traceId = builderOptions.meta.traceId!;
  } else if (
    builderOptions.queryType === QueryType.Logs &&
    builderOptions.filters?.find((f) => f.hint === ColumnHint.TraceId && 'value' in f)
  ) {
    const traceIdFilter = builderOptions.filters?.find(
      (f) => f.hint === ColumnHint.TraceId && 'value' in f
    ) as StringFilter;
    traceId = traceIdFilter.value;
  }

  return (
    <div data-testid="query-editor-minimized-viewer">
      {showConfigWarning && (
        <Alert title="" severity="warning">
          <VerticalGroup>
            <div>
              {`To enable data linking, enter your default ${configQueryType} configuration in your `}
              <a
                style={{ textDecoration: 'underline' }}
                href={`/connections/datasources/edit/${encodeURIComponent(datasource.uid)}#${builderOptions.queryType}-config`}
              >
                ClickHouse Data Source settings
              </a>
            </div>
          </VerticalGroup>
        </Alert>
      )}
      {!traceId && (
        <Alert title="" severity="warning">
          <VerticalGroup>
            <div>Trace ID is empty</div>
          </VerticalGroup>
        </Alert>
      )}

      {traceId && <TraceIdInput traceId={traceId} onChange={() => {}} disabled />}

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
};
