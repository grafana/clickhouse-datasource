import { ScopedVars } from '@grafana/data';
import { scanTopLevelSelect, SelectItem, SelectShapeProblem } from 'ch-parser/spans';
import { ColumnHint } from 'types/queryBuilder';
import {
  buildLogLevelAggregateExpressions,
  DEFAULT_LOGS_ALIAS,
  getTimeFieldRoundingClause,
  TIME_FIELD_ALIAS,
} from './logs';
import { escapeIdentifier } from './sqlGenerator';

/**
 * Why a SQL editor logs query could not be turned into an aggregated volume query.
 *
 * Every value means "fall back to the row based histogram". A wrong count is worse than a
 * limited one, so anything not positively recognized ends up here.
 */
export type LogsVolumeDeclineReason =
  | SelectShapeProblem
  | 'EmptySql'
  | 'NoTimeColumnConfigured'
  | 'IntervalMacro'
  | 'ProjectionUnparseable'
  | 'TimeColumnNotProjected'
  | 'TimeColumnNotAnIdentifier';

export type LogsVolumeSqlPlan =
  | {
      ok: true;
      sql: string;
      /** The projected column the histogram buckets on. */
      timeName: string;
      /** The projected level column, when a per-level breakdown was possible. */
      levelName?: string;
    }
  | { ok: false; reason: LogsVolumeDeclineReason };

/**
 * Interval macros resolve against the request's interval, and the supplementary logs volume
 * request deliberately snaps that interval to a coarser bucket
 * (see getIntervalInfo). A macro in the user's own query would therefore expand to a
 * different value inside the volume query than it does in the query the user sees, producing
 * a genuinely different predicate rather than a differently-shaped one.
 */
const INTERVAL_MACROS = ['$__interval_ms', '$__interval_s', '$__interval', '$__timeInterval', '$__timeGroup'];

function findProjected(items: SelectItem[], columnName: string): SelectItem | undefined {
  return items.find((item) => item.sourceIdentifier === columnName);
}

/**
 * Builds an aggregated logs volume query from a SQL editor logs query.
 *
 * The user's statement is used as a derived table rather than rewritten, so its FROM clause,
 * WHERE clause, joins, CTEs, macros and template variables are carried through byte for byte.
 * That means the count is whatever the user's own query would return, bucketed over time,
 * without the row limit their query applies for display.
 *
 * Only the trailing top-level ORDER BY / LIMIT / OFFSET / FORMAT is removed, and only columns
 * the statement demonstrably projects are referenced from the outer query.
 */
export function planSqlLogsVolume(
  rawSql: string,
  scopedVars: ScopedVars,
  logColumns: Map<ColumnHint, string>
): LogsVolumeSqlPlan {
  if (!rawSql || !rawSql.trim()) {
    return { ok: false, reason: 'EmptySql' };
  }

  // Bucket on the column the log list renders as the row timestamp, so the histogram and the
  // list agree; fall back to the coarser filter timestamp when that is all that is configured.
  const timeColumn = logColumns.get(ColumnHint.Time) || logColumns.get(ColumnHint.FilterTime);
  if (!timeColumn) {
    return { ok: false, reason: 'NoTimeColumnConfigured' };
  }

  const scan = scanTopLevelSelect(rawSql);
  if (!scan.ok) {
    return { ok: false, reason: scan.problem };
  }

  const { head, items } = scan.select;

  if (INTERVAL_MACROS.some((macro) => head.includes(macro))) {
    return { ok: false, reason: 'IntervalMacro' };
  }

  const timeColumns = [logColumns.get(ColumnHint.Time), logColumns.get(ColumnHint.FilterTime)].filter(
    (name): name is string => Boolean(name)
  );
  const hasWildcard = items.some((item) => item.wildcard);

  let timeName: string;
  if (hasWildcard) {
    // `*` projects every column under its own name.
    timeName = timeColumn;
  } else {
    // The first item is the bucket source: the logs query generator guarantees the timestamp
    // is projected first, and requiring position 1 is what keeps the histogram bucketed on
    // the same value the log list shows.
    const first = items[0];
    if (!first) {
      return { ok: false, reason: 'ProjectionUnparseable' };
    }
    if (!first.sourceIdentifier) {
      // An expression such as `Timestamp - INTERVAL 5 HOUR AS timestamp` still yields an
      // output name, but its values are not the column we would then bound by time.
      return { ok: false, reason: first.outputName ? 'TimeColumnNotAnIdentifier' : 'ProjectionUnparseable' };
    }
    if (!timeColumns.includes(first.sourceIdentifier)) {
      return { ok: false, reason: 'TimeColumnNotProjected' };
    }
    timeName = first.outputName ?? first.sourceIdentifier;
  }

  // The level breakdown is best effort: without a level column we still show a correct total.
  const levelColumn = logColumns.get(ColumnHint.LogLevel);
  let levelName: string | undefined;
  if (levelColumn) {
    if (hasWildcard) {
      levelName = levelColumn;
    } else {
      const levelItem = findProjected(items, levelColumn);
      levelName = levelItem?.outputName ?? levelItem?.sourceIdentifier;
    }
  }

  const aggregates = levelName
    ? buildLogLevelAggregateExpressions(`toString(${escapeIdentifier(levelName)})`).map(
        ({ alias, expression }) => `sum(${expression}) AS "${alias}"`
      )
    : [`count(*) AS "${DEFAULT_LOGS_ALIAS}"`];

  // Names come back from the scanner unquoted and unescaped, so they have to be re-escaped
  // before being interpolated. getTimeFieldRoundingClause adds the surrounding quotes itself,
  // so it takes the escaped inner text rather than a fully quoted identifier.
  const quotedTimeName = escapeIdentifier(timeName);
  const bucket = getTimeFieldRoundingClause(scopedVars, timeName.replace(/"/g, '""'));

  // The outer time bound is what makes the histogram follow the time picker rather than
  // whatever range the user's own query happens to filter on, and it narrows the read: it
  // reaches the underlying table's primary key through the derived table.
  const sql =
    `SELECT ${bucket} AS "${TIME_FIELD_ALIAS}", ${aggregates.join(', ')}\n` +
    `FROM (\n${head})\n` +
    `WHERE ${quotedTimeName} >= $__fromTime AND ${quotedTimeName} <= $__toTime\n` +
    `GROUP BY "${TIME_FIELD_ALIAS}"\n` +
    `ORDER BY "${TIME_FIELD_ALIAS}" ASC`;

  return { ok: true, sql, timeName, levelName };
}
