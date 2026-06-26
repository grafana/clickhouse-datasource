import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Datasource } from 'data/CHDatasource';
import {
  Filter,
  OrderBy,
  QueryType,
  QueryBuilderOptions,
  ColumnHint,
  StringFilter,
  TableColumn,
} from 'types/queryBuilder';
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
  setAllOptions,
  setBuilderMinimized,
  setDatabase,
  setQueryType,
  setTable,
} from 'hooks/useBuilderOptionsState';
import TraceIdInput from './TraceIdInput';
import { Alert, Button, Stack } from '@grafana/ui';
import { Components as allSelectors } from 'selectors';
import allLabels from 'labels';
import { buildCompactQueryDefaults, isDefaultOrMismatchedCompactQuery } from './compactQueryDefaults';
import { SignalType } from 'types/config';
import useColumns from 'hooks/useColumns';
import { CompactModeBar } from './CompactModeBar';
import { CompactFilterBar } from './CompactFilterBar';
import { CompactAdvanced } from './CompactAdvanced';

interface QueryBuilderProps {
  app: CoreApp | undefined;
  builderOptions: QueryBuilderOptions;
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>;
  datasource: Datasource;
  generatedSql: string;
  onQueryChange?: (builderOptions: QueryBuilderOptions) => void;
  onEditAsSql?: (builderOptions: QueryBuilderOptions) => void;
  onRunQuery?: () => void;
}

export const QueryBuilder = (props: QueryBuilderProps) => {
  const { datasource, builderOptions, builderOptionsDispatch, generatedSql, onQueryChange, onEditAsSql, onRunQuery } =
    props;
  const signalType = datasource.getSignalType();
  const singleTableMode = datasource.isSingleTableMode();

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

  if (singleTableMode && signalType) {
    return (
      <CompactQueryEditor
        datasource={datasource}
        builderOptions={builderOptions}
        builderOptionsDispatch={builderOptionsDispatch}
        generatedSql={generatedSql}
        signalType={signalType}
        onQueryChange={onQueryChange}
        onEditAsSql={onEditAsSql}
        onRunQuery={onRunQuery}
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

export const getCompactFilterColumns = (
  allColumns: readonly TableColumn[],
  builderOptions: QueryBuilderOptions
): readonly TableColumn[] => {
  const timeColumnNames = new Set(
    (builderOptions.columns || [])
      .filter((column) => column.hint === ColumnHint.Time || column.hint === ColumnHint.FilterTime)
      .map((column) => column.name)
  );

  return allColumns.filter((column) => !timeColumnNames.has(column.name));
};

interface CompactQueryEditorProps {
  datasource: Datasource;
  builderOptions: QueryBuilderOptions;
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>;
  generatedSql: string;
  signalType: SignalType;
  onQueryChange?: (builderOptions: QueryBuilderOptions) => void;
  onEditAsSql?: (builderOptions: QueryBuilderOptions) => void;
  onRunQuery?: () => void;
}

const CompactQueryEditor = (props: CompactQueryEditorProps) => {
  const {
    datasource,
    builderOptions,
    builderOptionsDispatch,
    generatedSql,
    signalType,
    onQueryChange,
    onEditAsSql,
    onRunQuery,
  } = props;
  const needsInitialization = isDefaultOrMismatchedCompactQuery(builderOptions, signalType);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const lastInitializationKey = useRef<string>();
  const onQueryChangeRef = useRef(onQueryChange);

  useEffect(() => {
    onQueryChangeRef.current = onQueryChange;
  }, [onQueryChange]);

  useEffect(() => {
    if (!needsInitialization) {
      return;
    }

    const initializationKey = `${datasource.uid}:${signalType}:${builderOptions.table}`;
    if (lastInitializationKey.current === initializationKey) {
      return;
    }
    lastInitializationKey.current = initializationKey;

    const nextOptions = buildCompactQueryDefaults(datasource, signalType, builderOptions.table);
    builderOptionsDispatch(setAllOptions(nextOptions));
    onQueryChangeRef.current?.(nextOptions);
  }, [builderOptions.table, builderOptionsDispatch, datasource, needsInitialization, signalType]);

  const activeOptions = needsInitialization
    ? buildCompactQueryDefaults(datasource, signalType, builderOptions.table)
    : builderOptions;
  const allColumns = useColumns(datasource, activeOptions.database, activeOptions.table);
  const filterColumns = useMemo(() => getCompactFilterColumns(allColumns, activeOptions), [allColumns, activeOptions]);

  const onActiveOptionsChange = (nextOptions: QueryBuilderOptions, shouldRunQuery = false) => {
    builderOptionsDispatch(setAllOptions(nextOptions));
    onQueryChange?.(nextOptions);
    if (shouldRunQuery) {
      onRunQuery?.();
    }
  };

  const mergeActiveOptions = (nextOptions: Partial<QueryBuilderOptions>, shouldRunQuery = false) => {
    onActiveOptionsChange(
      {
        ...activeOptions,
        ...nextOptions,
        meta: {
          ...activeOptions.meta,
          ...nextOptions.meta,
        },
      },
      shouldRunQuery
    );
  };

  return (
    <div data-testid="query-editor-section-builder">
      <CompactModeBar
        datasource={datasource}
        signalType={signalType}
        mode={signalType === 'logs' ? 'otel-logs' : 'otel-traces'}
        onModeChange={() => {}}
        searchText={activeOptions.meta?.logMessageLike || ''}
        onSearchChange={(logMessageLike) => mergeActiveOptions({ meta: { logMessageLike } }, true)}
        onSearchSubmit={() => {}}
      />
      <CompactFilterBar
        datasource={datasource}
        database={activeOptions.database}
        table={activeOptions.table}
        filters={activeOptions.filters || []}
        allColumns={filterColumns}
        onFiltersChange={(filters: Filter[]) => mergeActiveOptions({ filters }, true)}
        onToggleAdvanced={() => setAdvancedOpen(!advancedOpen)}
        advancedOpen={advancedOpen}
      />
      {advancedOpen && (
        <CompactAdvanced
          builderOptions={activeOptions}
          allColumns={allColumns}
          onOrderByChange={(orderBy: OrderBy[]) => mergeActiveOptions({ orderBy }, true)}
          onLimitChange={(limit: number) => mergeActiveOptions({ limit }, true)}
        />
      )}

      <SqlPreview sql={generatedSql} compact onEditAsSql={() => onEditAsSql?.(activeOptions)} />
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
          <Stack direction="column">
            <div>
              {`To enable data linking, enter your default ${configQueryType} configuration in your `}
              <a
                style={{ textDecoration: 'underline' }}
                href={`/connections/datasources/edit/${encodeURIComponent(datasource.uid)}#${builderOptions.queryType}-config`}
              >
                ClickHouse Data Source settings
              </a>
            </div>
          </Stack>
        </Alert>
      )}
      {!traceId && (
        <Alert title="" severity="warning">
          <Stack direction="column">
            <div>Trace ID is empty</div>
          </Stack>
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
