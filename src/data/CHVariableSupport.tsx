import React, { useCallback, useMemo } from 'react';
import {
  CustomVariableSupport,
  DataQueryRequest,
  DataQueryResponse,
  MetricFindValue,
  QueryEditorProps,
  toDataFrame,
} from '@grafana/data';
import { InlineFormLabel, Select, TextArea } from '@grafana/ui';
import { Observable, from, of } from 'rxjs';
import { SchemaPicker, SchemaPickerLevel, SchemaPickerValue } from 'components/queryBuilder/SchemaPicker';
import { CHConfig } from 'types/config';
import { CHQuery } from 'types/sql';
import { Datasource } from './CHDatasource';

/**
 * Variable query types. Each one renders a different combination of pickers and
 * generates a default SQL query that the user can edit before saving.
 */
export type CHVariableQueryType =
  | 'sql'
  | 'databases'
  | 'tables'
  | 'columns'
  | 'columnValues'
  | 'otelServices'
  | 'otelLevels'
  | 'otelOperations';

/** Variable query model. Persisted as part of the dashboard JSON. */
export interface CHVariableQuery {
  refId: string;
  queryType: CHVariableQueryType;
  rawSql?: string;
  database?: string;
  table?: string;
  column?: string;
  /** Key inside a `Map(...)` column. Only meaningful when `columnIsMap` is true. */
  mapKey?: string;
  /** Captured at pick time so the runtime path doesn't need to refetch the column type. */
  columnIsMap?: boolean;
}

const VARIABLE_TYPE_OPTIONS: Array<{ label: string; value: CHVariableQueryType; description?: string }> = [
  { label: 'Custom SQL', value: 'sql', description: 'Write any SQL query, same as before' },
  { label: 'List databases', value: 'databases', description: 'All databases on the server' },
  { label: 'List tables', value: 'tables', description: 'Tables inside a database' },
  { label: 'List columns', value: 'columns', description: 'Columns inside a table' },
  { label: 'Column values', value: 'columnValues', description: 'Distinct values of a column or Map key' },
  { label: 'OTel services', value: 'otelServices', description: 'ServiceName values from otel_logs' },
  { label: 'OTel log levels', value: 'otelLevels', description: 'SeverityText values from otel_logs' },
  { label: 'OTel operations', value: 'otelOperations', description: 'SpanName values from otel_traces' },
];

/** Returns the SchemaPicker depth for a query type, or null when no picker is needed. */
export function pickerLevelFor(queryType: CHVariableQueryType): SchemaPickerLevel | null {
  switch (queryType) {
    case 'tables':
      return 'database';
    case 'columns':
      return 'table';
    case 'columnValues':
      return 'mapKey';
    default:
      return null;
  }
}

/**
 * Generate the default SQL for a variable query. Pure function so the editor
 * preview and the unit tests use the same source of truth. At run time the
 * variable resolver only reads `rawSql`, so any manual edits to the SQL field
 * always win.
 */
export function generateVariableSql(query: CHVariableQuery, defaultDatabase: string): string {
  const db = query.database || defaultDatabase || '';
  const otelDb = defaultDatabase || db || 'default';
  switch (query.queryType) {
    case 'databases':
      return 'SELECT name FROM system.databases ORDER BY name';
    case 'tables':
      return db
        ? `SELECT name FROM system.tables WHERE database = '${db}' ORDER BY name`
        : 'SELECT name FROM system.tables ORDER BY name';
    case 'columns':
      if (!db || !query.table) {
        return '';
      }
      return `SELECT name FROM system.columns WHERE database = '${db}' AND table = '${query.table}' ORDER BY name`;
    case 'columnValues': {
      if (!db || !query.table || !query.column) {
        return '';
      }
      const target =
        query.columnIsMap && query.mapKey ? `${query.column}['${query.mapKey}']` : query.column;
      return `SELECT DISTINCT ${target} AS value FROM ${db}.${query.table} WHERE ${target} IS NOT NULL ORDER BY value LIMIT 1000`;
    }
    case 'otelServices':
      return `SELECT DISTINCT ServiceName FROM ${otelDb}.otel_logs WHERE $__timeFilter(Timestamp) AND ServiceName != '' ORDER BY ServiceName`;
    case 'otelLevels':
      return `SELECT DISTINCT SeverityText FROM ${otelDb}.otel_logs WHERE $__timeFilter(Timestamp) AND SeverityText != '' ORDER BY SeverityText`;
    case 'otelOperations':
      return `SELECT DISTINCT SpanName FROM ${otelDb}.otel_traces WHERE $__timeFilter(Timestamp) AND SpanName != '' ORDER BY SpanName LIMIT 200`;
    case 'sql':
    default:
      return query.rawSql || '';
  }
}

type EditorProps = QueryEditorProps<Datasource, CHQuery, CHConfig, CHVariableQuery>;

export const VariableQueryEditor = (props: EditorProps) => {
  const { query, onChange, datasource } = props;
  const safeQuery: CHVariableQuery = useMemo(
    () => ({
      refId: query?.refId || 'var',
      queryType: query?.queryType || 'sql',
      rawSql: query?.rawSql,
      database: query?.database,
      table: query?.table,
      column: query?.column,
      mapKey: query?.mapKey,
      columnIsMap: query?.columnIsMap,
    }),
    [
      query?.refId,
      query?.queryType,
      query?.rawSql,
      query?.database,
      query?.table,
      query?.column,
      query?.mapKey,
      query?.columnIsMap,
    ]
  );

  const defaultDatabase = datasource.getDefaultDatabase() || '';
  const pickerLevel = pickerLevelFor(safeQuery.queryType);

  const onTypeChange = useCallback(
    (queryType: CHVariableQueryType) => {
      const next: CHVariableQuery = { ...safeQuery, queryType };
      next.rawSql = generateVariableSql(next, defaultDatabase);
      onChange(next);
    },
    [defaultDatabase, onChange, safeQuery]
  );

  const onPickerChange = useCallback(
    async (picked: SchemaPickerValue) => {
      let columnIsMap = false;
      if (safeQuery.queryType === 'columnValues' && picked.column && picked.database && picked.table) {
        try {
          const columns = await datasource.fetchColumns(picked.database, picked.table);
          const sel = columns.find((c) => c.name === picked.column);
          columnIsMap = sel ? sel.type.startsWith('Map(') : false;
        } catch {
          columnIsMap = false;
        }
      }
      const next: CHVariableQuery = {
        ...safeQuery,
        database: picked.database || '',
        table: picked.table || '',
        column: picked.column || '',
        mapKey: picked.mapKey || '',
        columnIsMap,
      };
      next.rawSql = generateVariableSql(next, defaultDatabase);
      onChange(next);
    },
    [datasource, defaultDatabase, onChange, safeQuery]
  );

  const onSqlChange = useCallback(
    (rawSql: string) => {
      onChange({ ...safeQuery, rawSql });
    },
    [onChange, safeQuery]
  );

  const pickerValue: SchemaPickerValue = useMemo(
    () => ({
      database: safeQuery.database || '',
      table: safeQuery.table || '',
      column: safeQuery.column || '',
      mapKey: safeQuery.mapKey || '',
    }),
    [safeQuery.database, safeQuery.table, safeQuery.column, safeQuery.mapKey]
  );

  return (
    <div>
      <div className="gf-form">
        <InlineFormLabel
          width={10}
          className="query-keyword"
          tooltip="Pick a guided variable type, or keep Custom SQL to write your own query."
        >
          Variable type
        </InlineFormLabel>
        <Select
          width={40}
          options={VARIABLE_TYPE_OPTIONS}
          value={safeQuery.queryType}
          onChange={(v) => onTypeChange((v.value as CHVariableQueryType) || 'sql')}
          aria-label="Variable type"
        />
      </div>

      {pickerLevel && (
        <SchemaPicker
          datasource={datasource}
          value={pickerValue}
          onChange={onPickerChange}
          level={pickerLevel}
        />
      )}

      <div className="gf-form">
        <InlineFormLabel
          width={10}
          className="query-keyword"
          tooltip="Generated SQL. You can edit it; the runtime variable resolver uses this exact query."
        >
          SQL Query
        </InlineFormLabel>
        <TextArea
          rows={3}
          value={safeQuery.rawSql || ''}
          onChange={(e) => onSqlChange(e.currentTarget.value)}
          placeholder="SELECT DISTINCT column FROM database.table"
          aria-label="SQL Query"
        />
      </div>
    </div>
  );
};

/**
 * CustomVariableSupport binding. Registers the guided editor and runs the
 * resolved `rawSql` through the existing `metricFindQuery` path so all the
 * macro expansion (template variables, time filter, ad-hoc filters) stays in
 * one place.
 */
export class CHVariableSupport extends CustomVariableSupport<Datasource, CHVariableQuery> {
  constructor(private readonly datasource: Datasource) {
    super();
  }

  editor = VariableQueryEditor;

  query(request: DataQueryRequest<CHVariableQuery>): Observable<DataQueryResponse> {
    const target = request.targets[0];
    if (!target?.rawSql) {
      return of({ data: [] });
    }
    // Pass rawSql as a string. metricFindQuery accepts (CHQuery | string) and
    // wraps a string into a minimal SQL-mode CHQuery internally; that keeps
    // pluginVersion / refId concerns where they already live.
    const promise = this.datasource
      .metricFindQuery(target.rawSql, { range: request.range })
      .then((values: MetricFindValue[]) => ({
        data: [toDataFrame({ fields: [{ name: 'text', values: values.map((v) => v.text) }] })],
      }));
    return from(promise);
  }
}
