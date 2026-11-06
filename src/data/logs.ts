import { DataFrame, FieldType, ScopedVars } from '@grafana/data';
import { partition } from 'lodash';

const MILLISECOND = 1;
const SECOND = 1000 * MILLISECOND;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function getIntervalInfo(scopedVars: ScopedVars): { interval: string; intervalMs?: number } {
  if (scopedVars.__interval_ms) {
    let intervalMs: number = scopedVars.__interval_ms.value;
    let interval;
    if (intervalMs > HOUR) {
      intervalMs = DAY;
      interval = '1d';
    } else if (intervalMs > MINUTE) {
      intervalMs = HOUR;
      interval = '1h';
    } else if (intervalMs > SECOND) {
      intervalMs = MINUTE;
      interval = '1m';
    } else {
      intervalMs = SECOND;
      interval = '1s';
    }

    return { interval, intervalMs };
  } else {
    return { interval: '$__interval' };
  }
}

/** The INTERVAL unit to bucket by, for callers that build their own rounding clause. */
export function getTimeFieldRoundingInterval(scopedVars: ScopedVars): string {
  // NB: slight discrepancy with getIntervalInfo here
  // it returns { interval: '$__interval' } when the interval from the ScopedVars is undefined,
  // but we fall back to DAY here
  if (!scopedVars.__interval_ms) {
    return 'DAY';
  }

  const intervalMs: number = scopedVars.__interval_ms.value;
  if (intervalMs > HOUR) {
    return 'DAY';
  } else if (intervalMs > MINUTE) {
    return 'HOUR';
  } else if (intervalMs > SECOND) {
    return 'MINUTE';
  }
  return 'SECOND';
}

export function getTimeFieldRoundingClause(scopedVars: ScopedVars, timeField: string): string {
  return `toStartOfInterval(toDateTime("${timeField}"), INTERVAL 1 ${getTimeFieldRoundingInterval(scopedVars)})`;
}

export const TIME_FIELD_ALIAS = 'time';
export const DEFAULT_LOGS_ALIAS = 'logs';

/**
 * Mapping of canonical log levels to corresponding IN clauses
 * with all possible lower, upper and capital case values for this level
 *
 * For example: trace -> IN ('trace', 'TRACE', 'Trace')
 *
 * Spellings follow Grafana's LogLevel enum so a row lands in the same band as in the log list.
 *
 * @see {LogLevel} for reference values
 */
type NamedLogLevel = 'critical' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
/** The named levels plus `unknown`, their complement. */
export type LogLevelAlias = NamedLogLevel | 'unknown';
type LogLevelToInClause = Record<NamedLogLevel, string>;
export const LOG_LEVEL_TO_IN_CLAUSE: LogLevelToInClause = (() => {
  const levels: Record<NamedLogLevel, string[]> = {
    critical: ['critical', 'fatal', 'crit', 'alert', 'emerg', 'emergency'],
    error: ['error', 'err', 'eror'],
    warn: ['warn', 'warning'],
    info: ['info', 'information', 'informational', 'notice'],
    debug: ['debug', 'dbug'],
    trace: ['trace'],
  };
  return (Object.keys(levels) as NamedLogLevel[]).reduce((allLevels, level) => {
    allLevels[level] = `${[
      ...levels[level].map((l) => `'${l}'`),
      ...levels[level].map((l) => `'${l.toUpperCase()}'`),
      ...levels[level].map((l) => `'${l.charAt(0).toUpperCase() + l.slice(1)}'`),
    ].join(',')}`;
    return allLevels;
  }, {} as LogLevelToInClause);
})();

const KNOWN_LOG_LEVEL_IN_CLAUSE: string = Object.values(LOG_LEVEL_TO_IN_CLAUSE).join(',');

/**
 * One boolean expression per canonical level, for `sum(...)`, given the already-quoted level
 * column (`"SeverityText"`, or `src."level"`).
 *
 * Matching is exact, or `debug-trace` would land in two series; ifNull keeps a Nullable
 * column's NULLs from falling out of all of them.
 */
export function buildLogLevelAggregateExpressions(
  quotedLevelColumn: string
): Array<{ alias: LogLevelAlias; expression: string }> {
  const levelExpression = `ifNull(toString(${quotedLevelColumn}), '')`;
  const named = (Object.keys(LOG_LEVEL_TO_IN_CLAUSE) as NamedLogLevel[]).map((alias) => ({
    alias,
    expression: `${levelExpression} IN (${LOG_LEVEL_TO_IN_CLAUSE[alias]})`,
  }));
  // Emitted here, not driven off the record, so editing the level lists cannot drop it.
  return [
    ...named,
    { alias: 'unknown' as const, expression: `${levelExpression} NOT IN (${KNOWN_LOG_LEVEL_IN_CLAUSE})` },
  ];
}

export function splitLogsVolumeFrames(data: DataFrame[], logVolumePrefix: string): DataFrame[] {
  const result: DataFrame[] = [];

  for (const frame of data) {
    if (!frame.refId?.startsWith(logVolumePrefix)) {
      result.push(frame);
      continue;
    }

    const [timeFields, levelFields] = partition(frame.fields, (f) => f.name === TIME_FIELD_ALIAS);
    const timeField = timeFields[0];
    if (!timeField || levelFields.length === 0) {
      result.push(frame);
      continue;
    }

    const oneLevelDetected = levelFields.length === 1 && levelFields[0].name === DEFAULT_LOGS_ALIAS;
    for (const levelField of levelFields) {
      const levelName = oneLevelDetected ? 'logs' : levelField.name;
      result.push({
        refId: frame.refId,
        length: timeField.values.length,
        fields: [
          { name: 'Time', type: FieldType.time, values: timeField.values, config: {} },
          {
            name: 'Value',
            type: FieldType.number,
            values: levelField.values,
            labels: { level: levelName },
            config: {},
          },
        ],
      });
    }
  }
  return result;
}
