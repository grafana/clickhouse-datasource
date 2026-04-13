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

export function getTimeFieldRoundingClause(scopedVars: ScopedVars, timeField: string): string {
  // NB: slight discrepancy with getIntervalInfo here
  // it returns { interval: '$__interval' } when the interval from the ScopedVars is undefined,
  // but we fall back to DAY here
  let interval = 'DAY';
  if (scopedVars.__interval_ms) {
    let intervalMs: number = scopedVars.__interval_ms.value;
    if (intervalMs > HOUR) {
      interval = 'DAY';
    } else if (intervalMs > MINUTE) {
      interval = 'HOUR';
    } else if (intervalMs > SECOND) {
      interval = 'MINUTE';
    } else {
      interval = 'SECOND';
    }
  }
  return `toStartOfInterval("${timeField}", INTERVAL 1 ${interval})`;
}

export const TIME_FIELD_ALIAS = 'time';
export const DEFAULT_LOGS_ALIAS = 'logs';

/**
 * Mapping of canonical log levels to corresponding IN clauses
 * with all possible lower, upper and capital case values for this level
 *
 * For example: trace -> IN ('trace', 'TRACE', 'Trace')
 *
 * @see {LogLevel} for reference values
 */
type LogLevelToInClause = Record<'critical' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'unknown', string>;
export const LOG_LEVEL_TO_IN_CLAUSE: LogLevelToInClause = (() => {
  const levels = {
    critical: ['critical', 'fatal', 'crit', 'alert', 'emerg'],
    error: ['error', 'err', 'eror'],
    warn: ['warn', 'warning'],
    info: ['info', 'information', 'informational'],
    debug: ['debug', 'dbug'],
    trace: ['trace'],
    unknown: ['unknown'],
  };
  return (Object.keys(levels) as Array<keyof typeof levels>).reduce((allLevels, level) => {
    allLevels[level] = `${[
      ...levels[level].map((l) => `'${l}'`),
      ...levels[level].map((l) => `'${l.toUpperCase()}'`),
      ...levels[level].map((l) => `'${l.charAt(0).toUpperCase() + l.slice(1)}'`),
    ].join(',')}`;
    return allLevels;
  }, {} as LogLevelToInClause);
})();

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
          { name: 'Value', type: FieldType.number, values: levelField.values, labels: { level: levelName }, config: {} },
        ],
      });
    }
  }
  return result;
}

export const allLogLevels = [
  'critical',
  'fatal',
  'crit',
  'alert',
  'emerg',
  'error',
  'err',
  'eror',
  'warn',
  'warning',
  'info',
  'information',
  'informational',
  'debug',
  'dbug',
  'trace',
  'unknown',
];
