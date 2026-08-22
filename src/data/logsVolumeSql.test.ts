import { ScopedVars } from '@grafana/data';
import { ColumnHint } from 'types/queryBuilder';
import { LogsVolumeSqlPlan, planSqlLogsVolume } from './logsVolumeSql';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** Selects an HOUR bucket, see getTimeFieldRoundingClause. */
const HOURLY: ScopedVars = { __interval_ms: { text: '', value: MINUTE + 1 } };

const timeColumns = (): Map<ColumnHint, string> => new Map([[ColumnHint.Time, 'Timestamp']]);
const timeAndLevelColumns = (): Map<ColumnHint, string> =>
  new Map([
    [ColumnHint.Time, 'Timestamp'],
    [ColumnHint.LogLevel, 'SeverityText'],
  ]);

/**
 * The level value lists are spelled out rather than derived from LOG_LEVEL_TO_IN_CLAUSE, so a
 * change to the emitted SQL has to be made deliberately in both places.
 */
const CRITICAL =
  "'critical','fatal','crit','alert','emerg','CRITICAL','FATAL','CRIT','ALERT','EMERG','Critical','Fatal','Crit','Alert','Emerg'";
const ERROR = "'error','err','eror','ERROR','ERR','EROR','Error','Err','Eror'";
const WARN = "'warn','warning','WARN','WARNING','Warn','Warning'";
const INFO =
  "'info','information','informational','INFO','INFORMATION','INFORMATIONAL','Info','Information','Informational'";
const DEBUG = "'debug','dbug','DEBUG','DBUG','Debug','Dbug'";
const TRACE = "'trace','TRACE','Trace'";

/** The seven per-level series the outer SELECT projects for the given level column name. */
const levelSeries = (level: string): string =>
  [
    `sum(toString("${level}") IN (${CRITICAL})) AS "critical"`,
    `sum(toString("${level}") IN (${ERROR})) AS "error"`,
    `sum(toString("${level}") IN (${WARN})) AS "warn"`,
    `sum(toString("${level}") IN (${INFO})) AS "info"`,
    `sum(toString("${level}") IN (${DEBUG})) AS "debug"`,
    `sum(toString("${level}") IN (${TRACE})) AS "trace"`,
    `sum(toString("${level}") NOT IN (${CRITICAL},${ERROR},${WARN},${INFO},${DEBUG},${TRACE})) AS "unknown"`,
  ].join(', ');

/** Assembles the expected volume query, line by line, exactly as it is emitted. */
const expectedSql = (options: { bucket: string; series: string; head: string; timeName: string }): string =>
  [
    `SELECT toStartOfInterval("${options.timeName}", INTERVAL 1 ${options.bucket}) AS "time", ${options.series}`,
    'FROM (',
    options.head,
    ')',
    `WHERE "${options.timeName}" >= $__fromTime AND "${options.timeName}" <= $__toTime`,
    'GROUP BY "time"',
    'ORDER BY "time" ASC',
  ].join('\n');

const expectPlan = (plan: LogsVolumeSqlPlan) => {
  if (!plan.ok) {
    throw new Error(`expected a volume plan, got decline reason "${plan.reason}"`);
  }
  return plan;
};

const expectDeclined = (plan: LogsVolumeSqlPlan, reason: string) => {
  expect(plan).toEqual({ ok: false, reason });
};

describe('planSqlLogsVolume', () => {
  describe('a logs query from the query builder', () => {
    // What "Edit as SQL" produces for an OTel logs query, split so the expectation can assert
    // that everything up to the trailing ORDER BY / LIMIT is carried through byte for byte.
    const head =
      'SELECT Timestamp as "timestamp", Body as "body", SeverityText as "level" FROM "otel"."otel_logs" WHERE ( Timestamp >= $__fromTime AND Timestamp <= $__toTime )';
    const rawSql = `${head} ORDER BY timestamp DESC LIMIT 100`;

    const plan = () => planSqlLogsVolume(rawSql, HOURLY, timeAndLevelColumns());

    it('builds the aggregated volume query', () => {
      expect(plan()).toEqual({
        ok: true,
        sql: expectedSql({
          bucket: 'HOUR',
          series: levelSeries('level'),
          head,
          timeName: 'timestamp',
        }),
        timeName: 'timestamp',
        levelName: 'level',
      });
    });

    it('buckets on the projected alias, not the physical column', () => {
      const { sql, timeName } = expectPlan(plan());
      expect(timeName).toBe('timestamp');
      expect(sql).toContain('toStartOfInterval("timestamp", INTERVAL 1 HOUR) AS "time"');
      expect(sql).not.toContain('"Timestamp"');
    });

    it('wraps the user statement as a derived table without its ORDER BY and LIMIT', () => {
      const { sql } = expectPlan(plan());
      expect(sql).toContain(`FROM (\n${head}\n)\n`);
      expect(sql).not.toContain('ORDER BY timestamp DESC');
      expect(sql).not.toContain('LIMIT');
    });

    it('bounds, groups and orders the outer query itself', () => {
      const { sql } = expectPlan(plan());
      expect(sql).toContain('WHERE "timestamp" >= $__fromTime AND "timestamp" <= $__toTime');
      expect(sql).toContain('GROUP BY "time"');
      expect(sql.endsWith('ORDER BY "time" ASC')).toBe(true);
    });

    it('projects seven level series that partition the rows', () => {
      const { sql, levelName } = expectPlan(plan());
      expect(levelName).toBe('level');
      const selectLine = sql.split('\n')[0];
      expect(selectLine.match(/AS "(\w+)"/g)).toEqual([
        'AS "time"',
        'AS "critical"',
        'AS "error"',
        'AS "warn"',
        'AS "info"',
        'AS "debug"',
        'AS "trace"',
        'AS "unknown"',
      ]);
      // Six exact IN matches plus their complement, so the series sum to count().
      expect(selectLine.match(/sum\(/g)).toHaveLength(7);
      expect(selectLine.match(/NOT IN/g)).toHaveLength(1);
    });
  });

  describe('the level breakdown', () => {
    const head = 'SELECT Timestamp AS timestamp, Body AS body FROM "otel"."otel_logs"';
    const rawSql = `${head} ORDER BY timestamp DESC LIMIT 100`;

    const withoutLevel = expectedSql({
      bucket: 'HOUR',
      series: 'count(*) AS "logs"',
      head,
      timeName: 'timestamp',
    });

    it('falls back to a single total series when no level column is configured', () => {
      const plan = planSqlLogsVolume(rawSql, HOURLY, timeColumns());
      expect(plan).toEqual({ ok: true, sql: withoutLevel, timeName: 'timestamp' });
      expect(expectPlan(plan).levelName).toBeUndefined();
    });

    it('falls back to a single total series when the configured level column is not projected', () => {
      const plan = planSqlLogsVolume(rawSql, HOURLY, timeAndLevelColumns());
      expect(plan).toEqual({ ok: true, sql: withoutLevel, timeName: 'timestamp' });
      expect(expectPlan(plan).levelName).toBeUndefined();
    });

    it('uses the level column under its own name when it is projected without an alias', () => {
      const projected = 'SELECT Timestamp AS timestamp, SeverityText FROM "otel"."otel_logs"';
      const plan = planSqlLogsVolume(projected, HOURLY, timeAndLevelColumns());
      expect(plan).toEqual({
        ok: true,
        sql: expectedSql({
          bucket: 'HOUR',
          series: levelSeries('SeverityText'),
          head: projected,
          timeName: 'timestamp',
        }),
        timeName: 'timestamp',
        levelName: 'SeverityText',
      });
    });
  });

  describe('SELECT *', () => {
    it('buckets on the physical column names, since * projects every column under its own name', () => {
      const head = 'SELECT * FROM otel_logs WHERE x=1';
      const plan = planSqlLogsVolume(head, HOURLY, timeAndLevelColumns());
      expect(plan).toEqual({
        ok: true,
        sql: expectedSql({
          bucket: 'HOUR',
          series: levelSeries('SeverityText'),
          head,
          timeName: 'Timestamp',
        }),
        timeName: 'Timestamp',
        levelName: 'SeverityText',
      });
    });
  });

  describe('choosing the time column', () => {
    it('uses the filter timestamp when that is the only one configured', () => {
      const head = 'SELECT EventDate AS timestamp, Body FROM t';
      const plan = planSqlLogsVolume(head, HOURLY, new Map([[ColumnHint.FilterTime, 'EventDate']]));
      expect(plan).toEqual({
        ok: true,
        sql: expectedSql({ bucket: 'HOUR', series: 'count(*) AS "logs"', head, timeName: 'timestamp' }),
        timeName: 'timestamp',
      });
    });

    it('buckets a wildcard query on the filter timestamp when that is the only one configured', () => {
      const head = 'SELECT * FROM t';
      const plan = planSqlLogsVolume(head, HOURLY, new Map([[ColumnHint.FilterTime, 'EventDate']]));
      expect(expectPlan(plan).timeName).toBe('EventDate');
      expect(expectPlan(plan).sql).toBe(
        expectedSql({ bucket: 'HOUR', series: 'count(*) AS "logs"', head, timeName: 'EventDate' })
      );
    });

    it('prefers the row timestamp over the filter timestamp when both are configured', () => {
      const both = new Map([
        [ColumnHint.Time, 'Timestamp'],
        [ColumnHint.FilterTime, 'EventDate'],
      ]);
      const head = 'SELECT * FROM t';
      const plan = planSqlLogsVolume(head, HOURLY, both);
      expect(expectPlan(plan).timeName).toBe('Timestamp');
      expect(expectPlan(plan).sql).toBe(
        expectedSql({ bucket: 'HOUR', series: 'count(*) AS "logs"', head, timeName: 'Timestamp' })
      );
    });

    it('accepts either configured timestamp in the first projected position', () => {
      const both = new Map([
        [ColumnHint.Time, 'Timestamp'],
        [ColumnHint.FilterTime, 'EventDate'],
      ]);
      const head = 'SELECT EventDate AS timestamp, Body FROM t';
      const plan = planSqlLogsVolume(head, HOURLY, both);
      expect(plan).toEqual({
        ok: true,
        sql: expectedSql({ bucket: 'HOUR', series: 'count(*) AS "logs"', head, timeName: 'timestamp' }),
        timeName: 'timestamp',
      });
    });
  });

  describe('bucket granularity', () => {
    const head = 'SELECT Timestamp FROM t';

    it.each([
      { bucket: 'SECOND', intervalMs: SECOND },
      { bucket: 'MINUTE', intervalMs: SECOND + 1 },
      { bucket: 'HOUR', intervalMs: MINUTE + 1 },
      { bucket: 'DAY', intervalMs: HOUR + 1 },
    ])('buckets by $bucket for an interval of $intervalMs ms', ({ bucket, intervalMs }) => {
      const plan = planSqlLogsVolume(head, { __interval_ms: { text: '', value: intervalMs } }, timeColumns());
      expect(expectPlan(plan).sql).toBe(
        expectedSql({ bucket, series: 'count(*) AS "logs"', head, timeName: 'Timestamp' })
      );
    });

    it('falls back to a DAY bucket when no interval is provided', () => {
      const plan = planSqlLogsVolume(head, {}, timeColumns());
      expect(expectPlan(plan).sql).toBe(
        expectedSql({ bucket: 'DAY', series: 'count(*) AS "logs"', head, timeName: 'Timestamp' })
      );
    });
  });

  describe('wrapping the user statement', () => {
    it('closes the derived table on its own line, so a trailing comment cannot swallow it', () => {
      const rawSql = 'SELECT Timestamp FROM t WHERE 1=1 -- only the last hour, roughly';
      const plan = planSqlLogsVolume(rawSql, HOURLY, timeColumns());
      const { sql } = expectPlan(plan);
      expect(sql).toBe(
        expectedSql({ bucket: 'HOUR', series: 'count(*) AS "logs"', head: rawSql, timeName: 'Timestamp' })
      );
      expect(sql).toContain('-- only the last hour, roughly\n)');
      const lines = sql.split('\n');
      expect(lines[1]).toBe('FROM (');
      expect(lines[3]).toBe(')');
    });

    it('carries the WHERE clause, macros and template variables through byte for byte', () => {
      const head =
        "SELECT Timestamp AS timestamp, Body FROM t WHERE $__timeFilter(Timestamp) AND ServiceName = ${service:singlequote} AND LogAttributes['k'] = 'v'";
      const rawSql = `${head} ORDER BY timestamp DESC LIMIT 100`;
      const plan = planSqlLogsVolume(rawSql, HOURLY, timeColumns());
      expect(plan).toEqual({
        ok: true,
        sql: expectedSql({ bucket: 'HOUR', series: 'count(*) AS "logs"', head, timeName: 'timestamp' }),
        timeName: 'timestamp',
      });
      expect(expectPlan(plan).sql.split('\n')[2]).toBe(head);
    });
  });

  describe('declining', () => {
    it.each(['', '   '])('declines empty SQL (%j)', (rawSql) => {
      expectDeclined(planSqlLogsVolume(rawSql, HOURLY, timeColumns()), 'EmptySql');
    });

    it('declines when no timestamp column is configured', () => {
      expectDeclined(planSqlLogsVolume('SELECT Timestamp FROM t', HOURLY, new Map()), 'NoTimeColumnConfigured');
    });

    // The volume request snaps the interval to a coarser bucket, so an interval macro would
    // expand to a different value here than in the query the user sees.
    it.each([
      'SELECT Timestamp AS timestamp FROM t WHERE Duration > $__interval',
      'SELECT Timestamp AS timestamp FROM t WHERE DurationMs > $__interval_ms',
      'SELECT $__timeInterval(Timestamp) AS timestamp FROM t',
      'SELECT $__timeGroup(Timestamp, 1m) AS timestamp FROM t',
    ])('declines an interval macro in the head (%s)', (rawSql) => {
      expectDeclined(planSqlLogsVolume(rawSql, HOURLY, timeColumns()), 'IntervalMacro');
    });

    it.each([
      // The timestamp must be projected first: that is what keeps the histogram bucketed on
      // the same value the log list shows.
      'SELECT Body, Timestamp FROM t',
      'SELECT ServiceName, count() FROM t GROUP BY ServiceName',
    ])('declines when the timestamp is not the first projected column (%s)', (rawSql) => {
      expectDeclined(planSqlLogsVolume(rawSql, HOURLY, timeColumns()), 'TimeColumnNotProjected');
    });

    it.each([
      // Shifted: the outer time bound would be applied to values that are not the column.
      'SELECT Timestamp - INTERVAL 5 HOUR AS timestamp, Body FROM t',
      // Collapsed: already bucketed, so bucketing again would silently change granularity.
      'SELECT toStartOfHour(Timestamp) AS timestamp FROM t',
    ])('declines when the first item is an expression rather than the column (%s)', (rawSql) => {
      expectDeclined(planSqlLogsVolume(rawSql, HOURLY, timeColumns()), 'TimeColumnNotAnIdentifier');
    });

    it('declines a qualified first projection it cannot interpret', () => {
      expectDeclined(
        planSqlLogsVolume('SELECT l.Timestamp FROM t AS l', HOURLY, timeColumns()),
        'ProjectionUnparseable'
      );
    });

    it.each([
      // Reasons that pass through from the top-level SELECT scanner.
      { reason: 'Settings', rawSql: "SELECT Timestamp FROM t SETTINGS additional_result_filter = 'x > 1'" },
      { reason: 'LimitBy', rawSql: 'SELECT Timestamp FROM t ORDER BY Timestamp LIMIT 1 BY ServiceName' },
      { reason: 'WithFill', rawSql: 'SELECT Timestamp FROM t ORDER BY Timestamp WITH FILL STEP 1' },
      { reason: 'WithTotalsRollupCube', rawSql: 'SELECT Timestamp FROM t GROUP BY Timestamp WITH TOTALS' },
      { reason: 'SetOperation', rawSql: 'SELECT Timestamp FROM a UNION ALL SELECT Timestamp FROM b' },
      { reason: 'IntoOutfile', rawSql: "SELECT Timestamp FROM t INTO OUTFILE 'x.csv'" },
      { reason: 'MultiStatement', rawSql: 'SELECT Timestamp FROM t; SELECT Timestamp FROM u' },
      { reason: 'NoFrom', rawSql: 'SELECT now() AS timestamp' },
      { reason: 'LexError', rawSql: "SELECT Timestamp FROM t WHERE Body = 'unterminated" },
      { reason: 'Unbalanced', rawSql: 'SELECT Timestamp FROM t)' },
      { reason: 'NotSingleSelect', rawSql: '(SELECT Timestamp FROM t)' },
      { reason: 'NotSingleSelect', rawSql: 'INSERT INTO t SELECT Timestamp FROM u' },
    ])('declines with $reason ($rawSql)', ({ reason, rawSql }) => {
      expectDeclined(planSqlLogsVolume(rawSql, HOURLY, timeColumns()), reason);
    });
  });
});

describe('identifier escaping', () => {
  it('re-escapes a quote in the projected time name', () => {
    // The scanner hands names back unescaped, so they have to be re-quoted on the way out or
    // the emitted SQL is syntactically invalid and the volume query errors instead of drawing.
    const plan = expectPlan(planSqlLogsVolume('SELECT Timestamp AS "we""ird" FROM t', HOURLY, timeColumns()));

    expect(plan.timeName).toBe('we"ird');
    expect(plan.sql).toContain('toStartOfInterval("we""ird", INTERVAL 1 HOUR)');
    expect(plan.sql).toContain('WHERE "we""ird" >= $__fromTime AND "we""ird" <= $__toTime');
  });

  it('re-escapes a quote in the projected level name', () => {
    const plan = expectPlan(
      planSqlLogsVolume('SELECT Timestamp, SeverityText AS "lv""l" FROM t', HOURLY, timeAndLevelColumns())
    );

    expect(plan.levelName).toBe('lv"l');
    expect(plan.sql).toContain('toString("lv""l")');
  });
});
