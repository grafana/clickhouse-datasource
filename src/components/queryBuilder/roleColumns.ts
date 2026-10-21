import {
  AggregateColumn,
  ColumnHint,
  Filter,
  OrderBy,
  QueryBuilderOptions,
  QueryType,
  SelectedColumn,
  TableColumn,
} from 'types/queryBuilder';
import {
  findColumnByNameHeuristic,
  isDateTimeColumn,
  isNumericColumn,
  isStringLikeColumn,
} from './views/columnNameHeuristics';

/**
 * Role columns a query type's builder fills from the table's column names, with the column type each
 * role accepts. Kept free of hook imports so the builder options reducer can use it.
 */
const roleTypes: Partial<Record<QueryType, Array<[ColumnHint, (c: TableColumn) => boolean]>>> = {
  [QueryType.Logs]: [
    [ColumnHint.Time, isDateTimeColumn],
    [ColumnHint.LogMessage, isStringLikeColumn],
    [ColumnHint.LogLevel, isStringLikeColumn],
  ],
  [QueryType.Traces]: [
    [ColumnHint.TraceId, isStringLikeColumn],
    [ColumnHint.TraceSpanId, isStringLikeColumn],
    [ColumnHint.TraceParentSpanId, isStringLikeColumn],
    [ColumnHint.TraceServiceName, isStringLikeColumn],
    [ColumnHint.TraceOperationName, isStringLikeColumn],
    [ColumnHint.Time, isDateTimeColumn],
    [ColumnHint.TraceDurationTime, isNumericColumn],
  ],
};

export const hasRole = (columns: readonly SelectedColumn[] | undefined, hint: ColumnHint) =>
  (columns || []).some((c) => c.hint === hint);

/** Adds `role` to `columns`; a plain column of the same name takes the role instead of being selected twice. */
export const addRoleColumn = (columns: readonly SelectedColumn[], role: SelectedColumn): SelectedColumn[] => [
  ...columns.filter((c) => !(c.hint === undefined && c.name === role.name)),
  role,
];

/** Whether a query of `queryType` lacks role columns that the column-name heuristics could fill. */
export const needsRoleGuess = (options: QueryBuilderOptions, queryType: QueryType): boolean =>
  (roleTypes[queryType] || []).some(([hint]) => !hasRole(options.columns, hint));

/** The missing role columns of a `queryType` query found by name among the table's columns. */
export const guessMissingRoles = (
  options: QueryBuilderOptions,
  queryType: QueryType,
  allColumns: readonly TableColumn[]
): SelectedColumn[] =>
  (roleTypes[queryType] || []).flatMap(([hint, typeFilter]) => {
    const match = !hasRole(options.columns, hint) && findColumnByNameHeuristic(allColumns, hint, typeFilter);
    return match ? [{ name: match.name, type: match.type, hint }] : [];
  });

/**
 * Whether `name` can stay on a table with these columns: one of its columns, a Map key
 * (`attributes['k']`) or JSON path or Nested field (`attributes.k`, `events.name`) of one, or an
 * expression. Only a plain column reference the table lacks is dropped; an expression, such as an
 * aggregate in ORDER BY or a typed `toStartOfHour(ts)`, names no column the table can be checked for.
 */
const isTableColumn = (name: string, tableColumns: ReadonlySet<string>): boolean => {
  if (!name || name === '*' || tableColumns.has(name)) {
    return true;
  }
  const base = name.split(/[[.]/)[0];
  return !/^\w+$/.test(base) || tableColumns.has(base);
};

/**
 * Fits a query to a table it was just moved to. Everything that references a column the table
 * doesn't have is dropped (selected columns, filters, ordering, aggregates and grouping), then the
 * empty roles are guessed from the table's column names, as a new query's builder would. A table
 * with the same schema keeps the query whole. Custom SQL columns, expressions, anything addressed
 * by role hint, and ordering by the alias of a kept aggregate or column are kept, since they don't
 * name a column of the table.
 */
export const fitQueryToTable = (
  options: QueryBuilderOptions,
  allColumns: readonly TableColumn[]
): Partial<QueryBuilderOptions> => {
  const names = new Set(allColumns.map((c) => c.name));
  const keep = (name: string | undefined) => isTableColumn(name || '', names);

  let columns: SelectedColumn[] = (options.columns || []).filter((c) => c.custom || keep(c.name));
  const filters: Filter[] = (options.filters || []).filter((f) => f.hint !== undefined || keep(f.key));
  const aggregates: AggregateColumn[] = (options.aggregates || []).filter((a) => keep(a.column));
  const groupBy: string[] = (options.groupBy || []).filter((g) => keep(g));
  const aliases = new Set([...aggregates, ...columns].flatMap((c) => (c.alias ? [c.alias] : [])));
  const orderBy: OrderBy[] = (options.orderBy || []).filter(
    (o) => o.hint !== undefined || aliases.has(o.name) || keep(o.name)
  );

  for (const role of guessMissingRoles({ ...options, columns }, options.queryType, allColumns)) {
    columns = addRoleColumn(columns, role);
  }
  // Like the Logs and Time series builders, fall back to the first date column for the time role.
  if (
    (options.queryType === QueryType.Logs || options.queryType === QueryType.TimeSeries) &&
    !hasRole(columns, ColumnHint.Time)
  ) {
    const dateColumns = allColumns.filter(isDateTimeColumn);
    const time = findColumnByNameHeuristic(dateColumns, ColumnHint.Time) || dateColumns[0];
    if (time) {
      columns = addRoleColumn(columns, { name: time.name, type: time.type, hint: ColumnHint.Time });
    }
  }

  return { columns, filters, orderBy, aggregates, groupBy };
};
