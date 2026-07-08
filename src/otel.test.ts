import otel, { defaultLogsTable, defaultTraceTable, getLatestVersion, getVersion, versions } from 'otel';
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

describe('otel default export', () => {
  it('exposes versions, getLatestVersion, getVersion, and traceTimestampTableSuffix', () => {
    expect(otel.versions).toBe(versions);
    expect(otel.getLatestVersion).toBe(getLatestVersion);
    expect(otel.getVersion).toBe(getVersion);
    expect(otel.traceTimestampTableSuffix).toBe('_trace_id_ts');
  });
});
