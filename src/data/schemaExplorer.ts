import { Datasource } from 'data/CHDatasource';
import { ALL_COLUMNS, escapeIdentifier, getTableIdentifier } from 'data/sqlGenerator';
import {
  BuilderMode,
  Filter,
  FilterOperator,
  QueryBuilderOptions,
  QueryType,
  SelectedColumn,
  TableColumn,
} from 'types/queryBuilder';

const TIME_COLUMN_TYPE_PATTERN = /^(Nullable\(|LowCardinality\()*(DateTime64|DateTime|Date32|Date)(\(|\)|$)/;

const TIME_COLUMN_NAME_PREFERENCE = [
  'timestamp',
  'timestamptime',
  'event_time',
  'eventtime',
  'time',
  'datetime',
  'created_at',
];

export interface SchemaExplorerSqlOptions {
  database: string;
  table: string;
  columns: string[];
  timeColumn?: string;
  limit?: number;
}

export const getTimeColumnCandidates = (columns: readonly TableColumn[]): readonly TableColumn[] =>
  columns.filter((c) => TIME_COLUMN_TYPE_PATTERN.test(c.type));

export const resolveTimeColumn = (
  datasource: Datasource,
  database: string,
  table: string,
  columns: readonly TableColumn[]
): string | undefined => {
  const configured = datasource.getConfiguredTimeColumn(database, table);
  if (configured && (columns.length === 0 || columns.some((c) => c.name === configured))) {
    return configured;
  }

  const candidates = getTimeColumnCandidates(columns);
  for (const name of TIME_COLUMN_NAME_PREFERENCE) {
    const match = candidates.find((c) => c.name.toLowerCase() === name);
    if (match) {
      return match.name;
    }
  }

  return candidates[0]?.name;
};

export const generateSchemaExplorerSql = (options: SchemaExplorerSqlOptions): string => {
  const { database, table, columns, timeColumn, limit = 1000 } = options;

  const selectSql = columns.length > 0 ? columns.map(escapeIdentifier).join(', ') : '*';
  const parts = [`SELECT ${selectSql} FROM ${getTableIdentifier(database, table)}`];

  if (timeColumn) {
    parts.push(`WHERE $__timeFilter(${escapeIdentifier(timeColumn)})`);
  }
  if (limit > 0) {
    parts.push(`LIMIT ${limit}`);
  }

  return parts.join(' ');
};

export const buildBuilderOptionsFromSchema = (
  database: string,
  table: string,
  columns: readonly TableColumn[],
  selectedColumnNames: readonly string[],
  timeColumn?: string
): QueryBuilderOptions => {
  // Selecting nothing means every column, matching generateSchemaExplorerSql.
  const selectedColumns: SelectedColumn[] =
    selectedColumnNames.length > 0
      ? selectedColumnNames.map((name) => ({
          name,
          type: columns.find((c) => c.name === name)?.type ?? 'String',
        }))
      : [{ name: ALL_COLUMNS }];

  // The builder expresses the dashboard time range as a filter, matching the
  // $__timeFilter() that generateSchemaExplorerSql emits for the same selection.
  const filters: Filter[] = timeColumn
    ? [
        {
          filterType: 'custom',
          type: 'datetime',
          key: timeColumn,
          condition: 'AND',
          operator: FilterOperator.WithInGrafanaTimeRange,
        },
      ]
    : [];

  return {
    database,
    table,
    queryType: QueryType.Table,
    mode: BuilderMode.List,
    limit: 1000,
    meta: {},
    columns: selectedColumns,
    filters,
  };
};
