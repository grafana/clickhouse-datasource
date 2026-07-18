import { Datasource } from 'data/CHDatasource';
import { ColumnHint } from 'types/queryBuilder';
import otel from 'otel';
import { buildCompactQueryDefaults } from './compactQueryDefaults';

describe('buildCompactQueryDefaults', () => {
  // Mirrors Datasource.getDefaultLogsColumns for an OTel-enabled logs config.
  const createLogsDatasource = (otelVersion: string): Datasource => {
    const mockDs = {} as Datasource;
    mockDs.getDefaultLogsDatabase = jest.fn(() => 'otel');
    mockDs.getDefaultDatabase = jest.fn(() => 'default');
    mockDs.getDefaultLogsTable = jest.fn(() => 'otel_logs');
    mockDs.getDefaultTable = jest.fn(() => '');
    mockDs.getLogsOtelVersion = jest.fn(() => otelVersion);
    mockDs.getDefaultLogsColumns = jest.fn(
      () => otel.getVersion(otelVersion)?.logColumnMap || new Map<ColumnHint, string>()
    );
    mockDs.shouldSelectLogContextColumns = jest.fn(() => false);
    mockDs.getLogContextColumnNames = jest.fn(() => []);
    return mockDs;
  };

  // otel_logs table created by clickhouseexporter before v0.151.0.
  const preV151ColumnNames = [
    'Timestamp',
    'TimestampTime',
    'TraceId',
    'SpanId',
    'SeverityText',
    'Body',
    'ResourceAttributes',
    'ScopeAttributes',
    'LogAttributes',
  ];

  // otel_logs table created by clickhouseexporter v0.151.0+, which dropped TimestampTime.
  const v151ColumnNames = preV151ColumnNames.filter((name) => name !== 'TimestampTime');

  it('resolves the pre-v0.151.0 log schema when otel version is "latest" and the table has TimestampTime', () => {
    const options = buildCompactQueryDefaults(createLogsDatasource('latest'), 'logs', '', preV151ColumnNames);

    expect(options.columns).toContainEqual({ name: 'TimestampTime', hint: ColumnHint.FilterTime });
    expect(options.columns).toContainEqual({ name: 'Timestamp', hint: ColumnHint.Time });
  });

  it('resolves the latest log schema when otel version is "latest" and the table has no TimestampTime', () => {
    const options = buildCompactQueryDefaults(createLogsDatasource('latest'), 'logs', '', v151ColumnNames);

    expect(options.columns).toContainEqual({ name: 'Timestamp', hint: ColumnHint.Time });
    expect(options.columns?.some((column) => column.hint === ColumnHint.FilterTime)).toBe(false);
  });

  it('keeps the static latest log schema when otel version is "latest" and no columns are available', () => {
    const options = buildCompactQueryDefaults(createLogsDatasource('latest'), 'logs', '', []);

    expect(options.columns).toContainEqual({ name: 'Timestamp', hint: ColumnHint.Time });
    expect(options.columns?.some((column) => column.hint === ColumnHint.FilterTime)).toBe(false);
  });

  it('bypasses detection when an explicit otel version is pinned', () => {
    const pinnedLatest = createLogsDatasource('1.30.0');
    const pinnedOlder = createLogsDatasource('1.29.0');

    // Pinned 1.30.0 keeps its FilterTime-less map even though the table has TimestampTime.
    const pinnedLatestOptions = buildCompactQueryDefaults(pinnedLatest, 'logs', '', preV151ColumnNames);
    expect(pinnedLatestOptions.columns?.some((column) => column.hint === ColumnHint.FilterTime)).toBe(false);
    expect(pinnedLatest.getDefaultLogsColumns).toHaveBeenCalled();

    // Pinned 1.29.0 keeps its TimestampTime mapping even though the table lacks the column.
    const pinnedOlderOptions = buildCompactQueryDefaults(pinnedOlder, 'logs', '', v151ColumnNames);
    expect(pinnedOlderOptions.columns).toContainEqual({ name: 'TimestampTime', hint: ColumnHint.FilterTime });
  });

  it('keeps the configured meta values when detection resolves an older schema', () => {
    const options = buildCompactQueryDefaults(createLogsDatasource('latest'), 'logs', '', preV151ColumnNames);

    expect(options.meta?.otelEnabled).toBe(true);
    expect(options.meta?.otelVersion).toBe('latest');
  });
});
