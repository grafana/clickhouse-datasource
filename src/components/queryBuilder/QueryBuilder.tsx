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
import { CoreApp, TimeRange } from '@grafana/data';
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
import { Alert, Button, InlineFieldRow, Stack } from '@grafana/ui';
import { Components as allSelectors } from 'selectors';
import allLabels from 'labels';
import {
  buildCompactQueryDefaults,
  convertCarriedOverQuery,
  isCompactQueryTypeMismatch,
  isSameQueryOptions,
  shouldBuildCompactQueryDefaults,
  shouldConvertCarriedOverQuery,
  withDatasourceUid,
} from './compactQueryDefaults';
import { useDefaultLogColumnsByName, useDefaultTimeColumn } from './views/logsQueryBuilderHooks';
import { getColumnByHint } from 'data/sqlGenerator';
import { SignalType } from 'types/config';
import useColumns from 'hooks/useColumns';
import { CompactModeBar, getDefaultCompactMode } from './CompactModeBar';
import { CompactFilterBar } from './CompactFilterBar';
import { CompactAdvanced } from './CompactAdvanced';
import { MinIntervalEditor } from 'components/MinIntervalEditor';

interface QueryBuilderProps {
  timeRange?: TimeRange;
  app: CoreApp | undefined;
  builderOptions: QueryBuilderOptions;
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>;
  datasource: Datasource;
  generatedSql: string;
  minInterval?: string;
  onQueryChange?: (builderOptions: QueryBuilderOptions) => void;
  onEditAsSql?: (builderOptions: QueryBuilderOptions) => void;
  onMinIntervalChange?: (minInterval: string) => void;
  onRunQuery?: () => void;
}

export const QueryBuilder = (props: QueryBuilderProps) => {
  const {
    app,
    datasource,
    builderOptions,
    builderOptionsDispatch,
    generatedSql,
    minInterval,
    onQueryChange,
    onEditAsSql,
    onMinIntervalChange,
    onRunQuery,
  } = props;
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
    // Switching data sources in Explore keeps the query when both use this plugin, so a query
    // built for another data source lands here. Explore queries are not saved, so convert it
    // for this data source instead of showing it in the classic builder.
    const isCarriedOver = shouldConvertCarriedOverQuery(builderOptions, datasource, signalType, app);

    // An authored query whose type does not match the datasource signal falls through to
    // the classic builder, so switching a datasource to single-table mode never silently
    // replaces the saved options of pre-existing queries.
    const preserveAuthoredQuery =
      !isCarriedOver &&
      isCompactQueryTypeMismatch(builderOptions, signalType) &&
      !shouldBuildCompactQueryDefaults(builderOptions, signalType);

    if (!preserveAuthoredQuery) {
      return (
        <CompactQueryEditor
          timeRange={props.timeRange}
          datasource={datasource}
          builderOptions={builderOptions}
          builderOptionsDispatch={builderOptionsDispatch}
          generatedSql={generatedSql}
          signalType={signalType}
          isCarriedOver={isCarriedOver}
          minInterval={minInterval}
          onQueryChange={onQueryChange}
          onEditAsSql={onEditAsSql}
          onMinIntervalChange={onMinIntervalChange}
          onRunQuery={onRunQuery}
        />
      );
    }
  }

  return (
    <div data-testid="query-editor-section-builder">
      <InlineFieldRow className={styles.QueryEditor.queryType}>
        <DatabaseTableSelect
          datasource={datasource}
          database={builderOptions.database}
          onDatabaseChange={onDatabaseChange}
          table={builderOptions.table}
          onTableChange={onTableChange}
        />
      </InlineFieldRow>
      <InlineFieldRow className={styles.QueryEditor.queryType}>
        <QueryTypeSwitcher queryType={builderOptions.queryType} onChange={onQueryTypeChange} />
      </InlineFieldRow>
      {onMinIntervalChange && (
        <InlineFieldRow className={styles.QueryEditor.queryType}>
          <MinIntervalEditor minInterval={minInterval} onMinIntervalChange={onMinIntervalChange} />
        </InlineFieldRow>
      )}

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
  timeRange?: TimeRange;
  datasource: Datasource;
  builderOptions: QueryBuilderOptions;
  builderOptionsDispatch: React.Dispatch<BuilderOptionsReducerAction>;
  generatedSql: string;
  signalType: SignalType;
  /** The query was carried over from another data source and is converted for this one. */
  isCarriedOver: boolean;
  minInterval?: string;
  onQueryChange?: (builderOptions: QueryBuilderOptions) => void;
  onEditAsSql?: (builderOptions: QueryBuilderOptions) => void;
  onMinIntervalChange?: (minInterval: string) => void;
  onRunQuery?: () => void;
}

const CompactQueryEditor = (props: CompactQueryEditorProps) => {
  const {
    datasource,
    builderOptions,
    builderOptionsDispatch,
    generatedSql,
    signalType,
    isCarriedOver,
    minInterval,
    onQueryChange,
    onEditAsSql,
    onMinIntervalChange,
    onRunQuery,
  } = props;
  // A carried-over query's table belongs to the other data source, so it must not stand in for
  // an unset table in the defaults.
  const fallbackTable = isCarriedOver ? '' : builderOptions.table;
  // Defaults are built in two passes: database and table never depend on the
  // table's columns, so a build without column names locates the table for the
  // columns fetch, and the fetched column names then feed the OTel logs schema
  // detection inside buildCompactQueryDefaults. Treating a query that still
  // equals the base defaults as needing initialization lets that detection
  // correct the defaults once the columns arrive, without clobbering edits:
  // authored queries differ from the generated defaults and are never replaced.
  const baseDefaults = buildCompactQueryDefaults(datasource, signalType, fallbackTable);
  const needsInitialization =
    isCarriedOver ||
    shouldBuildCompactQueryDefaults(builderOptions, signalType) ||
    isSameQueryOptions(builderOptions, baseDefaults);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const lastInitializationKey = useRef<string>();
  const onQueryChangeRef = useRef(onQueryChange);
  const onRunQueryRef = useRef(onRunQuery);
  const locationOptions = needsInitialization ? baseDefaults : builderOptions;
  const allColumns = useColumns(datasource, locationOptions.database, locationOptions.table);
  const tableColumnNames = useMemo(() => allColumns.map((column) => column.name), [allColumns]);

  useEffect(() => {
    onQueryChangeRef.current = onQueryChange;
    onRunQueryRef.current = onRunQuery;
  }, [onQueryChange, onRunQuery]);

  // Converting a carried-over query checks its filters against this table's columns. They are
  // fetched here rather than read from useColumns, which swallows a failed fetch and never
  // settles. A failed fetch converts with no columns, so only fitting role filters are kept.
  const { database: targetDatabase, table: targetTable } = baseDefaults;
  useEffect(() => {
    if (!isCarriedOver) {
      return;
    }

    let cancelled = false;
    const convert = (columns: readonly TableColumn[]) => {
      if (cancelled) {
        return;
      }
      const defaults = buildCompactQueryDefaults(datasource, signalType, '', columns);
      // The converted query belongs to this data source now.
      const nextOptions = withDatasourceUid(convertCarriedOverQuery(builderOptions, defaults, columns), datasource.uid);
      builderOptionsDispatch(setAllOptions(nextOptions));
      onQueryChangeRef.current?.(nextOptions);
      // Grafana already ran the carried-over query against this data source when the user
      // switched, so the results below belong to the other data source's table. Run again.
      onRunQueryRef.current?.();
    };

    const columnsRequest = targetTable
      ? datasource.getColumnsCached(targetDatabase, targetTable)
      : Promise.resolve<TableColumn[]>([]);
    columnsRequest.then(convert, () => convert([]));
    return () => {
      cancelled = true;
    };
  }, [builderOptions, builderOptionsDispatch, datasource, isCarriedOver, signalType, targetDatabase, targetTable]);

  useEffect(() => {
    if (!needsInitialization || isCarriedOver) {
      return;
    }

    // The key flips once column names arrive (tableColumnNames.length > 0), so with
    // "Include all columns" on the editor initializes with base defaults and re-runs
    // with the full column set when the schema loads. Waiting for the schema here
    // instead would deadlock when the fetch fails or the table is empty, since
    // useColumns swallows errors and keeps returning [], and the gate would never lift.
    const initializationKey = `${datasource.uid}:${signalType}:${builderOptions.table}:${tableColumnNames.length > 0}`;
    if (lastInitializationKey.current === initializationKey) {
      return;
    }
    lastInitializationKey.current = initializationKey;

    const defaults = buildCompactQueryDefaults(datasource, signalType, fallbackTable, allColumns);
    if (!isSameQueryOptions(builderOptions, defaults)) {
      // Keep the recorded owner, so rebuilding the defaults does not drop it.
      const owner = builderOptions.meta?.datasourceUid;
      const nextOptions = owner ? withDatasourceUid(defaults, owner) : defaults;
      builderOptionsDispatch(setAllOptions(nextOptions));
      onQueryChangeRef.current?.(nextOptions);
    }
  }, [
    builderOptions,
    builderOptionsDispatch,
    datasource,
    fallbackTable,
    isCarriedOver,
    needsInitialization,
    signalType,
    tableColumnNames,
    allColumns,
  ]);

  const activeOptions = needsInitialization
    ? buildCompactQueryDefaults(datasource, signalType, fallbackTable, allColumns)
    : builderOptions;
  const filterColumns = useMemo(() => getCompactFilterColumns(allColumns, activeOptions), [allColumns, activeOptions]);

  // Compact defaults take columns from datasource config only, so a non-OTel
  // table without a configured Message column would leave the search box inert
  // (generateLogsQuery drops meta.logMessageLike unless a column carries the
  // LogMessage hint). Reuse the classic builder's conventional-name heuristic
  // to fill the empty Message and Level slots once table columns are fetched.
  // Configured columns already carry the hint, so they are never overridden.
  // A query whose defaults are still being built is the compact equivalent of
  // a new query: saved compact queries keep deliberately cleared slots.
  // A non-OTel table has no configured Time column, so the compact defaults leave the Time role
  // empty and the logs query has no time field to render. Fill it from the schema by convention,
  // the same hook the classic builder uses. No-op when OTel is on (the OTel map provides Time).
  useDefaultTimeColumn(
    datasource,
    signalType === 'logs' ? allColumns : [],
    activeOptions.table,
    getColumnByHint(activeOptions, ColumnHint.Time),
    activeOptions.meta?.otelEnabled || false,
    builderOptionsDispatch
  );
  useDefaultLogColumnsByName(
    signalType === 'logs' ? allColumns : [],
    activeOptions.table,
    needsInitialization,
    getColumnByHint(activeOptions, ColumnHint.LogMessage),
    getColumnByHint(activeOptions, ColumnHint.LogLevel),
    activeOptions.meta?.otelEnabled || false,
    builderOptionsDispatch
  );
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
        mode={getDefaultCompactMode(signalType)}
        searchText={activeOptions.meta?.logMessageLike || ''}
        onSearchChange={(logMessageLike) => mergeActiveOptions({ meta: { logMessageLike } }, true)}
      />
      <CompactFilterBar
        timeRange={props.timeRange}
        datasource={datasource}
        database={activeOptions.database}
        table={activeOptions.table}
        filters={activeOptions.filters || []}
        allColumns={filterColumns}
        selectedColumns={activeOptions.columns || []}
        onFiltersChange={(filters: Filter[]) => mergeActiveOptions({ filters }, true)}
        onToggleAdvanced={() => setAdvancedOpen(!advancedOpen)}
        advancedOpen={advancedOpen}
      />
      {advancedOpen && (
        <CompactAdvanced
          builderOptions={activeOptions}
          allColumns={allColumns}
          minInterval={minInterval}
          onOrderByChange={(orderBy: OrderBy[]) => mergeActiveOptions({ orderBy }, true)}
          onLimitChange={(limit: number) => mergeActiveOptions({ limit }, true)}
          onMinIntervalChange={onMinIntervalChange}
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
