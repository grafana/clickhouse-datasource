import otel, {
  defaultLogsTable,
  defaultTraceTable,
  detectLogsVersion,
  getLatestVersion,
  getVersion,
  versions,
} from 'otel';
import { ColumnHint } from 'types/queryBuilder';

describe('otel versions', () => {
  it('exposes 1.2.9, 1.3.0, and a "latest" alias', () => {
    const exposedVersions = versions.map((v) => v.version);
    expect(exposedVersions).toEqual(expect.arrayContaining(['latest', '1.30.0', '1.29.0']));
  });

  it('"latest" tracks the 1.3.0 schema', () => {
    const latest = getLatestVersion();
    expect(latest.version).toBe('latest');

    const v130 = getVersion('1.30.0');
    expect(v130).toBeDefined();
    expect(latest.logColumnMap.get(ColumnHint.Time)).toBe(v130!.logColumnMap.get(ColumnHint.Time));
    expect(latest.logColumnMap.has(ColumnHint.FilterTime)).toBe(v130!.logColumnMap.has(ColumnHint.FilterTime));
  });
});

describe('otel 1.30.0 log column map (collector-contrib v0.151.0+ schema)', () => {
  const v130 = getVersion('1.30.0')!;

  it('omits FilterTime so sqlGenerator falls back to Time (Timestamp)', () => {
    // TimestampTime was removed from otel_logs in opentelemetry-collector-contrib v0.151.0.
    // Plugin code must NOT emit `TimestampTime` against this schema.
    expect(v130.logColumnMap.has(ColumnHint.FilterTime)).toBe(false);
  });

  it('maps Time to Timestamp', () => {
    expect(v130.logColumnMap.get(ColumnHint.Time)).toBe('Timestamp');
  });

  it('preserves the rest of the log column mappings', () => {
    expect(v130.logColumnMap.get(ColumnHint.LogMessage)).toBe('Body');
    expect(v130.logColumnMap.get(ColumnHint.LogLevel)).toBe('SeverityText');
    expect(v130.logColumnMap.get(ColumnHint.TraceId)).toBe('TraceId');
    expect(v130.logColumnMap.get(ColumnHint.ResourceAttributes)).toBe('ResourceAttributes');
    expect(v130.logColumnMap.get(ColumnHint.ScopeAttributes)).toBe('ScopeAttributes');
    expect(v130.logColumnMap.get(ColumnHint.LogAttributes)).toBe('LogAttributes');
  });

  it('uses the default otel_logs table', () => {
    expect(v130.logsTable).toBe(defaultLogsTable);
  });
});

describe('otel 1.29.0 log column map (collector-contrib v0.150.x and earlier)', () => {
  const v129 = getVersion('1.29.0')!;

  it('retains the FilterTime → TimestampTime mapping for backwards compatibility', () => {
    expect(v129.logColumnMap.get(ColumnHint.FilterTime)).toBe('TimestampTime');
    expect(v129.logColumnMap.get(ColumnHint.Time)).toBe('Timestamp');
  });
});

describe('otel trace schema (unchanged in v0.151.0)', () => {
  it('trace column map is identical between 1.2.9 and 1.3.0', () => {
    const v129 = getVersion('1.29.0')!;
    const v130 = getVersion('1.30.0')!;
    expect(Array.from(v130.traceColumnMap.entries())).toEqual(Array.from(v129.traceColumnMap.entries()));
    expect(v130.traceTable).toBe(v129.traceTable);
    expect(v130.traceTable).toBe(defaultTraceTable);
  });
});

describe('detectLogsVersion', () => {
  it('picks the 1.29.0 schema when the table has a TimestampTime column', () => {
    const detected = detectLogsVersion(['Timestamp', 'TimestampTime', 'Body', 'SeverityText']);
    expect(detected.version).toBe('1.29.0');
    expect(detected.logColumnMap.get(ColumnHint.FilterTime)).toBe('TimestampTime');
  });

  it('picks the 1.30.0 schema when the table has no TimestampTime column', () => {
    const detected = detectLogsVersion(['Timestamp', 'Body', 'SeverityText']);
    expect(detected.version).toBe('1.30.0');
    expect(detected.logColumnMap.has(ColumnHint.FilterTime)).toBe(false);
  });

  it('falls back to the 1.30.0 schema for an empty column list', () => {
    expect(detectLogsVersion([]).version).toBe('1.30.0');
  });
});

describe('canary schema snapshot (tests/canary/expected-columns.json)', () => {
  // The scheduled canary workflow (.github/workflows/otel-schema-canary.yml)
  // diffs the schema a live collector creates against the snapshot. These
  // tests close the other half of the loop: they run on every PR and fail
  // when the plugin's latest column maps reference columns the snapshot
  // doesn't have, so the snapshot and src/otel.ts can't drift apart silently.
  const expectedColumns: Record<
    string,
    Array<{ name: string; type: string }>
  > = require('../tests/canary/expected-columns.json');

  it('latest log column map only references columns the collector creates', () => {
    const names = new Set(expectedColumns['otel_logs'].map((c) => c.name));
    const missing = Array.from(getLatestVersion().logColumnMap.values()).filter((c) => !names.has(c));
    expect(missing).toEqual([]);
  });

  it('latest trace column map only references columns the collector creates', () => {
    const names = new Set(expectedColumns['otel_traces'].map((c) => c.name));
    const missing = Array.from(getLatestVersion().traceColumnMap.values()).filter((c) => !names.has(c));
    expect(missing).toEqual([]);
  });

  it('trace events and links column prefixes match the collector columns', () => {
    const names = new Set(expectedColumns['otel_traces'].map((c) => c.name));
    const latest = getLatestVersion();
    expect(names.has(`${latest.traceEventsColumnPrefix}.Timestamp`)).toBe(true);
    expect(names.has(`${latest.traceLinksColumnPrefix}.TraceId`)).toBe(true);
  });

  it('trace timestamp lookup table has the columns the generated WITH clause hardcodes', () => {
    const names = new Set(expectedColumns['otel_traces_trace_id_ts'].map((c) => c.name));
    for (const column of ['TraceId', 'Start', 'End']) {
      expect(names.has(column)).toBe(true);
    }
  });
});

describe('otel default export', () => {
  it('exposes versions, getLatestVersion, getVersion, and traceTimestampTableSuffix', () => {
    expect(otel.versions).toBe(versions);
    expect(otel.getLatestVersion).toBe(getLatestVersion);
    expect(otel.getVersion).toBe(getVersion);
    expect(otel.traceTimestampTableSuffix).toBe('_trace_id_ts');
  });
});
