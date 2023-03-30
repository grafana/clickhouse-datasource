import { BarAlignment, DataQuery, DataSourceJsonData, GraphDrawStyle, StackingMode } from '@grafana/schema'
import {
  DataFrame,
  DataQueryError,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi, FieldCache,
  FieldColorModeId, FieldConfig, FieldType,
  LoadingState,
  LogLevel, MutableDataFrame,
  ScopedVars,
  TimeRange,
  toDataFrame,
} from '@grafana/data'
import { Observable, isObservable, from } from 'rxjs'
import { config } from '@grafana/runtime'
import { colors } from '@grafana/ui'

/**
 * Copy-paste from `public/app/core/logsModel.ts` (release-9.4.3 branch)
 * See https://github.com/grafana/grafana/blob/release-9.4.3/public/app/core/logsModel.ts
 */

type LogsVolumeQueryOptions<T extends DataQuery> = {
  extractLevel: (dataFrame: DataFrame) => LogLevel;
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
  // const timespan = options.range.to.valueOf() - options.range.from.valueOf();
  // const intervalInfo = getIntervalInfo(logsVolumeRequest.scopedVars, timespan);
  //
  // logsVolumeRequest.interval = intervalInfo.interval;
  // logsVolumeRequest.scopedVars.__interval = { value: intervalInfo.interval, text: intervalInfo.interval };
  //
  // if (intervalInfo.intervalMs !== undefined) {
  //   logsVolumeRequest.intervalMs = intervalInfo.intervalMs;
  //   logsVolumeRequest.scopedVars.__interval_ms = { value: intervalInfo.intervalMs, text: intervalInfo.intervalMs };
  // }
  //
  // logsVolumeRequest.hideFromInspector = true;

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
        const aggregatedLogsVolume = aggregateRawLogsVolume(rawLogsVolume, options.extractLevel);
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
function aggregateRawLogsVolume(
  rawLogsVolume: DataFrame[],
  extractLevel: (dataFrame: DataFrame) => LogLevel
): DataFrame[] {
  const logsVolumeByLevelMap: Partial<Record<LogLevel, DataFrame[]>> = {};

  rawLogsVolume.forEach((dataFrame) => {
    const level = extractLevel(dataFrame);
    if (!logsVolumeByLevelMap[level]) {
      logsVolumeByLevelMap[level] = [];
    }
    logsVolumeByLevelMap[level]!.push(dataFrame);
  });

  return Object.keys(logsVolumeByLevelMap).map((level: string) => {
    return aggregateFields(
      logsVolumeByLevelMap[level as LogLevel]!,
      getLogVolumeFieldConfig(level as LogLevel, Object.keys(logsVolumeByLevelMap).length === 1)
    );
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

/**
 * Aggregate multiple data frames into a single data frame by adding values.
 * Multiple data frames for the same level are passed here to get a single
 * data frame for a given level. Aggregation by level happens in aggregateRawLogsVolume()
 */
function aggregateFields(dataFrames: DataFrame[], config: FieldConfig): DataFrame {
  const aggregatedDataFrame = new MutableDataFrame();
  // if (!dataFrames.length) {
  //   return aggregatedDataFrame;
  // }
  if (!dataFrames.length || (dataFrames.length === 1 && !dataFrames[0].length)) {
    return aggregatedDataFrame
  }

  const totalLength = dataFrames[0].length;
  console.log('dataFrames', dataFrames)
  console.log('dataFrames[0]', dataFrames[0])
  console.log('totalLength', totalLength)
  const timeField = new FieldCache(dataFrames[0]).getFirstFieldOfType(FieldType.time);

  if (!timeField) {
    return aggregatedDataFrame;
  }

  aggregatedDataFrame.addField({ name: 'Time', type: FieldType.time }, totalLength);
  aggregatedDataFrame.addField({ name: 'Value', type: FieldType.number, config }, totalLength);

  dataFrames.forEach((dataFrame) => {
    dataFrame.fields.forEach((field) => {
      if (field.type === FieldType.number) {
        for (let pointIndex = 0; pointIndex < totalLength; pointIndex++) {
          const currentValue = aggregatedDataFrame.get(pointIndex).Value;
          const valueToAdd = field.values.get(pointIndex);
          const totalValue =
            currentValue === null && valueToAdd === null ? null : (currentValue || 0) + (valueToAdd || 0);
          aggregatedDataFrame.set(pointIndex, { Value: totalValue, Time: timeField.values.get(pointIndex) });
        }
      }
    });
  });

  return aggregatedDataFrame;
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

export function getTimeFieldRoundingClause(scopedVars: ScopedVars, timespanMs: number, timeField = 'created_at'): string {
  let interval = 'DAY';
  if (scopedVars.__interval) {
    let intervalMs: number = scopedVars.__interval_ms.value;
    // TODO: some unix timestamp shenanigans for DateTime64
    // below 5 seconds we force the resolution to be per 1ms as interval in scopedVars is not less than 10ms
    if (timespanMs < SECOND * 5) {
      console.error('MILLIS precision is not supported')
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
  return `toStartOfInterval("${timeField}", INTERVAL 1 ${interval})`
}
