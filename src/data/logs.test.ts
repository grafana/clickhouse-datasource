import { FieldType } from '@grafana/data';
import { getIntervalInfo, getTimeFieldRoundingClause, LOG_LEVEL_TO_IN_CLAUSE, splitLogsVolumeFrames } from './logs';

describe('logs', () => {

  describe('getIntervalInfo', () => {
    it('should return the default value when no interval info is provided', async () => {
      expect(getIntervalInfo({})).toEqual({ interval: '$__interval' });
    });
    it('should do buckets per day when the provided interval greater than an hour', async () => {
      expect(
        getIntervalInfo({
          __interval_ms: {
            text: '',
            value: 60 * 60 * 1000 + 1,
          },
        })
      ).toEqual({ interval: '1d', intervalMs: 24 * 60 * 60 * 1000 });
    });
    it('should do buckets per hour when the provided interval greater than a minute', async () => {
      expect(
        getIntervalInfo({
          __interval_ms: {
            text: '',
            value: 60 * 1000 + 1,
          },
        })
      ).toEqual({ interval: '1h', intervalMs: 60 * 60 * 1000 });
    });
    it('should do buckets per minute when the provided interval greater than a second', async () => {
      expect(
        getIntervalInfo({
          __interval_ms: {
            text: '',
            value: 1001,
          },
        })
      ).toEqual({ interval: '1m', intervalMs: 60 * 1000 });
    });
    it('should do buckets per second', async () => {
      expect(
        getIntervalInfo({
          __interval_ms: {
            text: '',
            value: 1,
          },
        })
      ).toEqual({ interval: '1s', intervalMs: 1000 });
    });
  });

  describe('getTimeFieldRoundingClause', () => {
    it('should fall back to DAY grouping when no interval info is provided', async () => {
      expect(getTimeFieldRoundingClause({}, 'created_at')).toEqual('toStartOfInterval("created_at", INTERVAL 1 DAY)');
    });
    it('should do buckets per day when the provided interval greater than an hour', async () => {
      expect(
        getTimeFieldRoundingClause(
          {
            __interval_ms: {
              text: '',
              value: 60 * 60 * 1000 + 1,
            },
          },
          'created_at'
        )
      ).toEqual('toStartOfInterval("created_at", INTERVAL 1 DAY)');
    });
    it('should do buckets per hour when the provided interval greater than a minute', async () => {
      expect(
        getTimeFieldRoundingClause(
          {
            __interval_ms: {
              text: '',
              value: 60 * 1000 + 1,
            },
          },
          'created_at'
        )
      ).toEqual('toStartOfInterval("created_at", INTERVAL 1 HOUR)');
    });
    it('should do buckets per minute when the provided interval greater than a second', async () => {
      expect(
        getTimeFieldRoundingClause(
          {
            __interval_ms: {
              text: '',
              value: 1001,
            },
          },
          'created_at'
        )
      ).toEqual('toStartOfInterval("created_at", INTERVAL 1 MINUTE)');
    });
    it('should do buckets per second', async () => {
      expect(
        getTimeFieldRoundingClause(
          {
            __interval_ms: {
              text: '',
              value: 1,
            },
          },
          'created_at'
        )
      ).toEqual('toStartOfInterval("created_at", INTERVAL 1 SECOND)');
    });
  });

  describe('splitLogsVolumeFrames', () => {
    const prefix = 'log-volume-';
    const times = [1000, 2000, 3000];
    const makeFrame = (refId: string, fields: Array<{ name: string; values: number[] }>) => ({
      refId,
      length: times.length,
      fields: fields.map(({ name, values }) => ({ name, type: FieldType.number, values, config: {} })),
    });

    it('passes through frames that do not match the prefix', () => {
      const frame = makeFrame('other-query', [{ name: 'time', values: times }, { name: 'logs', values: [1, 2, 3] }]);
      expect(splitLogsVolumeFrames([frame], prefix)).toEqual([frame]);
    });

    it('passes through a matching frame with no time field', () => {
      const frame = makeFrame(`${prefix}1`, [{ name: 'logs', values: [1, 2, 3] }]);
      expect(splitLogsVolumeFrames([frame], prefix)).toEqual([frame]);
    });

    it('passes through a matching frame with no level fields', () => {
      const frame = makeFrame(`${prefix}1`, [{ name: 'time', values: times }]);
      expect(splitLogsVolumeFrames([frame], prefix)).toEqual([frame]);
    });

    it('splits a single-level frame and labels it "logs"', () => {
      const frame = {
        refId: `${prefix}1`,
        length: times.length,
        fields: [
          { name: 'time', type: FieldType.number, values: times, config: {} },
          { name: 'logs', type: FieldType.number, values: [1, 2, 3], config: {} },
        ],
      };
      const result = splitLogsVolumeFrames([frame], prefix);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        refId: `${prefix}1`,
        length: times.length,
        fields: [
          { name: 'Time', type: FieldType.time, values: times, config: {} },
          { name: 'Value', type: FieldType.number, values: [1, 2, 3], labels: { level: 'logs' }, config: {} },
        ],
      });
    });

    it('splits a multi-level frame into one frame per level using field names as labels', () => {
      const frame = {
        refId: `${prefix}1`,
        length: times.length,
        fields: [
          { name: 'time', type: FieldType.number, values: times, config: {} },
          { name: 'error', type: FieldType.number, values: [1, 2, 3], config: {} },
          { name: 'info', type: FieldType.number, values: [4, 5, 6], config: {} },
        ],
      };
      const result = splitLogsVolumeFrames([frame], prefix);
      expect(result).toHaveLength(2);
      expect(result[0].fields[1].labels).toEqual({ level: 'error' });
      expect(result[1].fields[1].labels).toEqual({ level: 'info' });
    });

    it('preserves non-volume frames alongside split volume frames', () => {
      const nonVolume = makeFrame('other', [{ name: 'time', values: times }, { name: 'val', values: [7, 8, 9] }]);
      const volume = {
        refId: `${prefix}1`,
        length: times.length,
        fields: [
          { name: 'time', type: FieldType.number, values: times, config: {} },
          { name: 'logs', type: FieldType.number, values: [1, 2, 3], config: {} },
        ],
      };
      const result = splitLogsVolumeFrames([nonVolume, volume], prefix);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(nonVolume);
      expect(result[1].refId).toBe(`${prefix}1`);
    });
  });

  describe('LOG_LEVEL_TO_IN_CLAUSE', () => {
    it('should generate correct IN clauses', async () => {
      expect(LOG_LEVEL_TO_IN_CLAUSE).toEqual({
        critical:
          "'critical','fatal','crit','alert','emerg','CRITICAL','FATAL','CRIT','ALERT','EMERG','Critical','Fatal','Crit','Alert','Emerg'",
        debug: "'debug','dbug','DEBUG','DBUG','Debug','Dbug'",
        error: "'error','err','eror','ERROR','ERR','EROR','Error','Err','Eror'",
        info: "'info','information','informational','INFO','INFORMATION','INFORMATIONAL','Info','Information','Informational'",
        trace: "'trace','TRACE','Trace'",
        unknown: "'unknown','UNKNOWN','Unknown'",
        warn: "'warn','warning','WARN','WARNING','Warn','Warning'",
      });
    });
  });
});
