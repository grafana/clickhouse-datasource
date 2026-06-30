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
import { escapeIdentifier } from './sqlGenerator';
import { Datasource, escapeCHStringLiteral } from './CHDatasource';

/**
 * Variable query types. Each one renders a different combination of pickers and
 * generates a default SQL query that the user can edit before saving.
 */
export type CHVariableQueryType =
  | 'sql'
  | 'databases'
  | 'tables'
  | 'columns'
  | 'columnValues';

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
  switch (query.queryType) {
    case 'databases':
      return 'SELECT name FROM system.databases ORDER BY name';
    case 'tables':
      return db
        ? `SELECT name FROM system.tables WHERE database = '${escapeCHStringLiteral(db)}' ORDER BY name`
        : 'SELECT name FROM system.tables ORDER BY name';
    case 'columns':
      if (!db || !query.table) {
        return '';
      }
      return `SELECT name FROM system.columns WHERE database = '${escapeCHStringLiteral(db)}' AND table = '${escapeCHStringLiteral(query.table)}' ORDER BY name`;
    case 'columnValues': {
      if (!db || !query.table || !query.column) {
        return '';
      }
      const column = escapeIdentifier(query.column);
      const target =
        query.columnIsMap && query.mapKey ? `${column}['${escapeCHStringLiteral(query.mapKey)}']` : column;
      return `SELECT DISTINCT ${target} AS value FROM ${escapeIdentifier(db)}.${escapeIdentifier(query.table)} WHERE ${target} IS NOT NULL ORDER BY value LIMIT 1000`;
    }
    case 'sql':
    default:
      return query.rawSql || '';
  }
}

type EditorProps = QueryEditorProps<Datasource, CHQuery, CHConfig, CHVariableQuery>;

export const VariableQueryEditor = (props: EditorProps) => {
  const { query, onChange, datasource } = props;
  // A saved variable query can be a legacy plain string instead of a
  // CHVariableQuery object; treat that as the raw SQL.
  const legacyRawSql = typeof query === 'string' ? query : undefined;
  const safeQuery: CHVariableQuery = useMemo(
    () => ({
      refId: query?.refId || 'var',
      queryType: query?.queryType || 'sql',
      rawSql: legacyRawSql ?? query?.rawSql,
      database: query?.database,
      table: query?.table,
      column: query?.column,
      mapKey: query?.mapKey,
      columnIsMap: query?.columnIsMap,
    }),
    [
      legacyRawSql,
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
    (picked: SchemaPickerValue) => {
      const next: CHVariableQuery = {
        ...safeQuery,
        database: picked.database || '',
        table: picked.table || '',
        column: picked.column || '',
        mapKey: picked.mapKey || '',
        // SchemaPicker already knows the column type from the data it fetched
        // for the column dropdown, so reuse its flag instead of refetching the
        // column metadata here.
        columnIsMap: picked.isMapColumn ?? false,
      };
      next.rawSql = generateVariableSql(next, defaultDatabase);
      onChange(next);
    },
    [defaultDatabase, onChange, safeQuery]
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
    // A saved variable query can be a legacy plain string instead of a
    // CHVariableQuery object, so accept both shapes.
    const rawSql = typeof target === 'string' ? target : target?.rawSql;
    if (!rawSql) {
      return of({ data: [] });
    }
    // Pass rawSql as a string. metricFindQuery accepts (CHQuery | string) and
    // wraps a string into a minimal SQL-mode CHQuery internally; that keeps
    // pluginVersion / refId concerns where they already live.
    const promise = this.datasource
      .metricFindQuery(rawSql, { range: request.range })
      .then((values: MetricFindValue[]) => ({
        // Emit text and value separately so a `SELECT value, label` query
        // substitutes the value while displaying the label. Fall back to text
        // when the query returns a single column.
        data: [
          toDataFrame({
            fields: [
              { name: 'text', values: values.map((v) => v.text) },
              { name: 'value', values: values.map((v) => v.value ?? v.text) },
            ],
          }),
        ],
      }));
    return from(promise);
  }
}
