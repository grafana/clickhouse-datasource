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
  | 'ProjectionUnreadable'
  | 'TimeColumnNotProjected'
  | 'TimeColumnNotAnIdentifier'
  | 'StatementMacro'
  | 'WildcardOverUnknownTable';

export type LogsVolumeSqlPlan =
  | {
      ok: true;
      sql: string;
      timeName: string;
      levelName?: string;
    }
  | { ok: false; reason: LogsVolumeDeclineReason };

/** The volume request snaps the interval, so these would expand differently here. */
const INTERVAL_MACROS = ['$__interval_ms', '$__interval_s', '$__interval', '$__timeInterval', '$__timeGroup'];

/** Macros the backend expands into a whole SELECT list, so they cannot be wrapped. */
const STATEMENT_MACROS = ['$__columns', '$__rateColumns', '$__perSecondColumns', '$__increaseColumns', '$__lttb'];

const SOURCE_ALIAS = 'src';

function findProjected(items: SelectItem[], columnName: string): SelectItem | undefined {
  return items.find((item) => item.sourceIdentifier === columnName);
}

function isConfiguredLogsTable(
  from: FromTarget | undefined,
  logsTable?: { database?: string; table?: string }
): boolean {
  if (!from || !logsTable?.table || from.table !== logsTable.table) {
    return false;
  }

  return from.database === undefined || !logsTable.database || from.database === logsTable.database;
}

/** Wraps the user's statement as a derived table and aggregates over it. */
export function planSqlLogsVolume(
  rawSql: string,
  scopedVars: ScopedVars,
  logColumns: Map<ColumnHint, string>,
  logsTable?: { database?: string; table?: string }
): LogsVolumeSqlPlan {
  if (!rawSql || !rawSql.trim()) {
    return { ok: false, reason: 'EmptySql' };
  }

  // Not FilterTime: a Date filter column is all midnight, so it cannot bucket below a day.
  const timeColumn = logColumns.get(ColumnHint.Time);
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

  const hasWildcard = items.some((item) => item.wildcard);

  let timeName: string;
  if (hasWildcard) {
    if (!isConfiguredLogsTable(scan.select.from, logsTable)) {
      return { ok: false, reason: 'WildcardOverUnknownTable' };
    }
    timeName = timeColumn;
  } else {
    const first = items[0];
    if (!first) {
      return { ok: false, reason: 'ProjectionUnreadable' };
    }
    if (!first.sourceIdentifier) {
      return { ok: false, reason: first.outputName ? 'TimeColumnNotAnIdentifier' : 'ProjectionUnreadable' };
    }
    if (first.sourceIdentifier !== timeColumn) {
      return { ok: false, reason: 'TimeColumnNotProjected' };
    }
    timeName = first.outputName ?? first.sourceIdentifier;
  }

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

  // Qualified so an output name colliding with ours (`time`, `info`) is not shadowed.
  const qualifiedTime = `${SOURCE_ALIAS}.${escapeIdentifier(timeName)}`;
  const aggregates = levelName
    ? buildLogLevelAggregateExpressions(`${SOURCE_ALIAS}.${escapeIdentifier(levelName)}`).map(
        ({ alias, expression }) => `sum(${expression}) AS "${alias}"`
      )
    : [`count(*) AS "${DEFAULT_LOGS_ALIAS}"`];

  // toDateTime as $__timeInterval does: Date/Date32/UInt32/String are illegal arguments to
  // toStartOfInterval below day granularity.
  const bucketTime = `toDateTime(${qualifiedTime})`;
  const bucket = `toStartOfInterval(${bucketTime}, INTERVAL 1 ${getTimeFieldRoundingInterval(scopedVars)})`;

  const sql =
    `SELECT ${bucket} AS "${TIME_FIELD_ALIAS}", ${aggregates.join(', ')}\n` +
    `FROM (\n${head}) AS ${SOURCE_ALIAS}\n` +
    `WHERE ${bucketTime} >= $__fromTime AND ${bucketTime} <= $__toTime\n` +
    `GROUP BY "${TIME_FIELD_ALIAS}"\n` +
    `ORDER BY "${TIME_FIELD_ALIAS}" ASC`;

  return { ok: true, sql, timeName, levelName };
}
