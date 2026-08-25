import { ScopedVars } from '@grafana/data';
import { FromTarget, scanTopLevelSelect, SelectItem, SelectShapeProblem } from 'ch-parser/spans';
import { ColumnHint } from 'types/queryBuilder';
import {
  buildLogLevelAggregateExpressions,
  DEFAULT_LOGS_ALIAS,
  getTimeFieldRoundingInterval,
  TIME_FIELD_ALIAS,
} from './logs';
import { escapeIdentifier } from './sqlGenerator';

/** Why a query could not be aggregated. Every value means "fall back to the row histogram". */
export type LogsVolumeDeclineReason =
  | SelectShapeProblem
  | 'EmptySql'
  | 'NoTimeColumnConfigured'
  | 'IntervalMacro'
  | 'ProjectionUnparseable'
  | 'TimeColumnNotProjected'
  | 'TimeColumnNotAnIdentifier'
  | 'StatementMacro'
  | 'WildcardOverUnknownTable';

export type LogsVolumeSqlPlan =
  | {
      ok: true;
      sql: string;
      /** The projected column the histogram buckets on. */
      timeName: string;
      levelName?: string;
    }
  | { ok: false; reason: LogsVolumeDeclineReason };

/**
 * The volume request snaps the interval to a coarser bucket (see getIntervalInfo), so these
 * would expand differently here than in the user's own query — a different predicate, not just
 * a different bucket size.
 */
const INTERVAL_MACROS = ['$__interval_ms', '$__interval_s', '$__interval', '$__timeInterval', '$__timeGroup'];

/** Macros the backend expands into a whole SELECT list, so they cannot survive being wrapped. */
const STATEMENT_MACROS = ['$__columns', '$__rateColumns', '$__perSecondColumns', '$__increaseColumns', '$__lttb'];

/** Alias for the derived table, so inner columns can be qualified and never shadowed. */
const SOURCE_ALIAS = 'src';

function findProjected(items: SelectItem[], columnName: string): SelectItem | undefined {
  return items.find((item) => item.sourceIdentifier === columnName);
}

/**
 * Whether the scanned FROM is the data source's configured logs table. Table and database names
 * are case sensitive in ClickHouse, so this compares exactly, and an unqualified reference is
 * accepted only when the configured table is itself unqualified or its database matches.
 */
function isConfiguredLogsTable(
  from: FromTarget | undefined,
  logsTable?: { database?: string; table?: string }
): boolean {
  if (!from || !logsTable?.table || from.table !== logsTable.table) {
    return false;
  }

  return from.database === undefined || !logsTable.database || from.database === logsTable.database;
}

/**
 * Builds an aggregated logs volume query by using the user's statement as a derived table, so
 * their FROM, WHERE, joins, CTEs and macros carry through verbatim. Only the trailing row cap
 * and ordering are dropped, and only columns the statement projects are referenced.
 */
export function planSqlLogsVolume(
  rawSql: string,
  scopedVars: ScopedVars,
  logColumns: Map<ColumnHint, string>,
  logsTable?: { database?: string; table?: string }
): LogsVolumeSqlPlan {
  if (!rawSql || !rawSql.trim()) {
    return { ok: false, reason: 'EmptySql' };
  }

  // Bucket on the column the log list shows as the row timestamp so the two agree.
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
  if (STATEMENT_MACROS.some((macro) => head.includes(macro))) {
    return { ok: false, reason: 'StatementMacro' };
  }

  const timeColumns = [logColumns.get(ColumnHint.Time), logColumns.get(ColumnHint.FilterTime)].filter(
    (name): name is string => Boolean(name)
  );
  const hasWildcard = items.some((item) => item.wildcard);

  let timeName: string;
  if (hasWildcard) {
    // A wildcard is the one case where we reference the configured column names instead of names
    // the projection demonstrably provides, so it is only safe when the FROM is provably that
    // same table. Otherwise the columns may not exist and the query would error at ClickHouse
    // after we have already committed to aggregating.
    if (!isConfiguredLogsTable(scan.select.from, logsTable)) {
      return { ok: false, reason: 'WildcardOverUnknownTable' };
    }
    timeName = timeColumn;
  } else {
    // Position 1 only: the logs query generator always projects the timestamp first, and
    // requiring it keeps the buckets tied to the value the log list renders.
    const first = items[0];
    if (!first) {
      return { ok: false, reason: 'ProjectionUnparseable' };
    }
    if (!first.sourceIdentifier) {
      // `Timestamp - INTERVAL 5 HOUR AS timestamp` has an output name but shifted values.
      return { ok: false, reason: first.outputName ? 'TimeColumnNotAnIdentifier' : 'ProjectionUnparseable' };
    }
    if (!timeColumns.includes(first.sourceIdentifier)) {
      return { ok: false, reason: 'TimeColumnNotProjected' };
    }
    timeName = first.outputName ?? first.sourceIdentifier;
  }

  // Best effort: without a level column the total is still correct.
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

  // Every inner column is qualified with the derived table's alias, so an output name that
  // collides with one of ours (a level column aliased `time`, or `info`) cannot be shadowed by
  // the outer SELECT's aliases.
  const qualifiedTime = `${SOURCE_ALIAS}.${escapeIdentifier(timeName)}`;
  const aggregates = levelName
    ? buildLogLevelAggregateExpressions(`${SOURCE_ALIAS}.${escapeIdentifier(levelName)}`).map(
        ({ alias, expression }) => `sum(${expression}) AS "${alias}"`
      )
    : [`count(*) AS "${DEFAULT_LOGS_ALIAS}"`];

  const bucket = `toStartOfInterval(${qualifiedTime}, INTERVAL 1 ${getTimeFieldRoundingInterval(scopedVars)})`;

  // The outer bound makes the histogram follow the time picker rather than whatever range the
  // user filtered on, and still reaches the primary key through the derived table.
  const sql =
    `SELECT ${bucket} AS "${TIME_FIELD_ALIAS}", ${aggregates.join(', ')}\n` +
    `FROM (\n${head}) AS ${SOURCE_ALIAS}\n` +
    `WHERE ${qualifiedTime} >= $__fromTime AND ${qualifiedTime} <= $__toTime\n` +
    `GROUP BY "${TIME_FIELD_ALIAS}"\n` +
    `ORDER BY "${TIME_FIELD_ALIAS}" ASC`;

  return { ok: true, sql, timeName, levelName };
}
