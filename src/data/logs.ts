import { BarAlignment, DataQuery, DataSourceJsonData, GraphDrawStyle, StackingMode } from '@grafana/schema';
import {
  DataFrame,
  DataQueryError,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  FieldColorModeId,
  FieldType,
  LoadingState,
  LogLevel,
  MutableDataFrame,
  ScopedVars,
  TimeRange,
  toDataFrame,
} from '@grafana/data';
import { from, isObservable, Observable } from 'rxjs';
import { config } from '@grafana/runtime';
import { colors } from '@grafana/ui';
import { partition } from 'lodash';

/**
 * Partially copy-pasted and adjusted to ClickHouse server-side aggregations
 * from `public/app/core/logsModel.ts` (release-9.4.3 branch)
 *
 * See https://github.com/grafana/grafana/blob/release-9.4.3/public/app/core/logsModel.ts
 */

type LogsVolumeQueryOptions<T extends DataQuery> = {
  targets: T[];
  range: TimeRange;
};

const MILLISECOND = 1;
const SECOND = 1000 * MILLISECOND;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const LogLevelColor = {
  [LogLevel.critical]: colors[7],
  [LogLevel.warning]: colors[1],
  [LogLevel.error]: colors[4],
  [LogLevel.info]: colors[0],
  [LogLevel.debug]: colors[5],
  [LogLevel.trace]: colors[2],
  [LogLevel.unknown]: getThemeColor('#8e8e8e', '#bdc4cd'),
};

function getThemeColor(dark: string, light: string): string {
  return config.bootData.user.lightTheme ? light : dark;
}

/**
 * Creates an observable, which makes requests to get logs volume and aggregates results.
 */
export function queryLogsVolume<TQuery extends DataQuery, TOptions extends DataSourceJsonData>(
  datasource: DataSourceApi<TQuery, TOptions>,
  logsVolumeRequest: DataQueryRequest<TQuery>,
  options: LogsVolumeQueryOptions<TQuery>
): Observable<DataQueryResponse> {
  return new Observable((observer) => {
    let rawLogsVolume: DataFrame[] = [];
    observer.next({
      state: LoadingState.Loading,
      error: undefined,
      data: [],
    });

    const queryResponse = datasource.query(logsVolumeRequest);
    const queryObservable = isObservable(queryResponse) ? queryResponse : from(queryResponse);

    const subscription = queryObservable.subscribe({
      complete: () => {
        const aggregatedLogsVolume = aggregateRawLogsVolume(rawLogsVolume);
        if (aggregatedLogsVolume[0]) {
          aggregatedLogsVolume[0].meta = {
            custom: {
              targets: options.targets,
              absoluteRange: { from: options.range.from.valueOf(), to: options.range.to.valueOf() },
            },
          };
        }
        observer.next({
          state: LoadingState.Done,
          error: undefined,
          data: aggregatedLogsVolume,
        });
        observer.complete();
      },
      next: (dataQueryResponse: DataQueryResponse) => {
        const { error } = dataQueryResponse;
        if (error !== undefined) {
          observer.next({
            state: LoadingState.Error,
            error,
            data: [],
          });
          observer.error(error);
        } else {
          rawLogsVolume = rawLogsVolume.concat(dataQueryResponse.data.map(toDataFrame));
        }
      },
      error: (error: DataQueryError) => {
        observer.next({
          state: LoadingState.Error,
          error: error,
          data: [],
        });
        observer.error(error);
      },
    });
    return () => {
      subscription?.unsubscribe();
    };
  });
}

/**
 * Take multiple data frames, sum up values and group by level.
 * Return a list of data frames, each representing single level.
 */
function aggregateRawLogsVolume(rawLogsVolume: DataFrame[]): DataFrame[] {
  if (rawLogsVolume.length !== 1) {
    return []; // we always expect a single DataFrame with all the aggregations from ClickHouse
  }

  const [ [ timeField ], levelFields ] = partition(rawLogsVolume[0].fields, (f) => f.name === TIME_FIELD_ALIAS);
  if (timeField === undefined) {
    return []; // should never happen if we have a DataFrame available
  }

  const oneLevelDetected = levelFields.length === 1 && levelFields[0].name === DEFAULT_LOGS_ALIAS;
  if (oneLevelDetected) {
    levelFields[0].name = 'logs';
  }

  const totalLength = timeField.values.length;
  return levelFields.map((field) => {
    const logLevel = LogLevel[field.name as keyof typeof LogLevel] || LogLevel.unknown;
    const df = new MutableDataFrame();
    df.addField({ name: 'Time', type: FieldType.time, values: timeField.values }, totalLength);
    df.addField({
      name: 'Value',
      type: FieldType.number,
      config: getLogVolumeFieldConfig(logLevel, oneLevelDetected),
      values: field.values,
    });
    return df;
  });
}

/**
 * Returns field configuration used to render logs volume bars
 */
function getLogVolumeFieldConfig(level: LogLevel, oneLevelDetected: boolean) {
  const name = oneLevelDetected && level === LogLevel.unknown ? 'logs' : level;
  const color = LogLevelColor[level];
  return {
    displayNameFromDS: name,
    color: {
      mode: FieldColorModeId.Fixed,
      fixedColor: color,
    },
    custom: {
      drawStyle: GraphDrawStyle.Bars,
      barAlignment: BarAlignment.Center,
      lineColor: color,
      pointColor: color,
      fillColor: color,
      lineWidth: 1,
      fillOpacity: 100,
      stacking: {
        mode: StackingMode.Normal,
        group: 'A',
      },
    },
  };
}

export function getIntervalInfo(scopedVars: ScopedVars, timespanMs: number): { interval: string; intervalMs?: number } {
  if (scopedVars.__interval) {
    let intervalMs: number = scopedVars.__interval_ms.value;
    let interval;
    // below 5 seconds we force the resolution to be per 1ms as interval in scopedVars is not less than 10ms
    if (timespanMs < SECOND * 5) {
      intervalMs = MILLISECOND;
      interval = '1ms';
    } else if (intervalMs > HOUR) {
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

export function getTimeFieldRoundingClause(
  scopedVars: ScopedVars,
  timespanMs: number,
  timeField = 'created_at'
): string {
  let interval = 'DAY';
  if (scopedVars.__interval) {
    let intervalMs: number = scopedVars.__interval_ms.value;
    // below 5 seconds we force the resolution to be per 1ms as interval in scopedVars is not less than 10ms
    if (timespanMs < SECOND * 5) {
      // TODO: workaround
      console.error('MILLIS precision is not supported');
    } else if (intervalMs > HOUR) {
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
    critical: [ 'critical', 'fatal', 'crit', 'alert', 'emerg' ],
    error: [ 'error', 'err', 'eror' ],
    warn: [ 'warn', 'warning' ],
    info: [ 'info', 'information', 'informational' ],
    debug: [ 'debug', 'dbug' ],
    trace: [ 'trace' ],
    unknown: [ 'unknown' ],
  };
  return (Object.keys(levels) as Array<keyof typeof levels>).reduce((allLevels, level) => {
    allLevels[level] = `IN (${[
      ...levels[level].map((l) => `'${l}'`),
      ...levels[level].map((l) => `'${l.toUpperCase()}'`),
      ...levels[level].map((l) => `'${l.charAt(0).toUpperCase() + l.slice(1)}'`),
    ].join(',')})`;
    return allLevels;
  }, {} as LogLevelToInClause);
})();
