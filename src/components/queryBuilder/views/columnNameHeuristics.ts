import { ColumnHint, TableColumn } from 'types/queryBuilder';

/**
 * Case-insensitive name patterns used to auto-map table columns onto the
 * Query Builder's semantic role slots when OTel mode is off.
 *
 * Scope is intentionally tight: every pattern should unambiguously identify
 * a role for a conventionally-named schema (the names listed in the docs'
 * "Column roles" tables). Ambiguous matches like bare `id` or `time` alone
 * for trace IDs are avoided so we don't silently pick the wrong column.
 *
 * When a user has an unusual schema they can still map columns explicitly;
 * the goal here is to eliminate the most common friction, not to guess.
 *
 * The trace patterns mirror the OTel column map at `src/otel.ts` so OTel
 * column names (e.g. `TraceId`, `SpanName`, `ServiceName`) also match when
 * users haven't flipped the OTel toggle.
 */
export const columnNameHeuristics: Partial<Record<ColumnHint, RegExp>> = {
  // Logs
  [ColumnHint.Time]: /^(timestamp|@timestamp|time|event_?time|log_?time|created_?at)$/i,
  [ColumnHint.LogMessage]: /^(body|message|msg|log_?message)$/i,
  [ColumnHint.LogLevel]: /^(level|severity|severity_?text|log_?level)$/i,
  // Traces — mirrors the OTel map in src/otel.ts
  [ColumnHint.TraceId]: /^(trace_?id)$/i,
  [ColumnHint.TraceSpanId]: /^(span_?id)$/i,
  [ColumnHint.TraceParentSpanId]: /^(parent_?span_?id)$/i,
  [ColumnHint.TraceServiceName]: /^(service|service_?name)$/i,
  [ColumnHint.TraceOperationName]: /^(operation|operation_?name|span_?name)$/i,
  [ColumnHint.TraceDurationTime]: /^(duration|duration_?ns|duration_?ms|duration_?us|duration_?seconds)$/i,
};

/**
 * Returns the first column whose name matches the heuristic pattern for the
 * given hint. An optional `typeFilter` restricts the search to columns of a
 * compatible ClickHouse type (e.g. DateTime for Time, String for LogMessage),
 * which prevents matches like picking a `String` column named `timestamp`.
 *
 * Returns undefined when no heuristic is registered for the hint or no
 * column matches.
 */
export const findColumnByNameHeuristic = (
  allColumns: readonly TableColumn[],
  hint: ColumnHint,
  typeFilter?: (column: TableColumn) => boolean
): TableColumn | undefined => {
  const pattern = columnNameHeuristics[hint];
  if (!pattern) {
    return undefined;
  }
  return allColumns.find((column) => (typeFilter ? typeFilter(column) : true) && pattern.test(column.name));
};

/** Type predicate: ClickHouse DateTime / DateTime64 / Date columns. */
export const isDateTimeColumn = (column: TableColumn): boolean =>
  (column.type || '').toLowerCase().includes('date');

/** Type predicate: ClickHouse String / FixedString / LowCardinality(String) / Enum columns. */
export const isStringLikeColumn = (column: TableColumn): boolean => {
  const type = (column.type || '').toLowerCase();
  return type.includes('string') || type.includes('enum');
};

/** Type predicate: ClickHouse numeric duration columns (UInt*, Int*, Float*). */
export const isNumericColumn = (column: TableColumn): boolean => {
  const type = (column.type || '').toLowerCase();
  return type.startsWith('uint') || type.startsWith('int') || type.startsWith('float') || type.startsWith('decimal');
};
