import { ColumnHint, TimeUnit } from 'types/queryBuilder';

export const defaultLogsTable = 'otel_logs';
export const defaultTraceTable = 'otel_traces';

export const traceTimestampTableSuffix = '_trace_id_ts';

export interface OtelVersion {
  name: string;
  version: string;
  specUrl?: string;
  logsTable: string;
  logColumnMap: Map<ColumnHint, string>;
  logLevels: string[];
  traceTable: string;
  traceColumnMap: Map<ColumnHint, string>;
  traceDurationUnit: TimeUnit.Nanoseconds;
  flattenNested: boolean;
  traceEventsColumnPrefix: string;
  traceLinksColumnPrefix: string;
}

const otel129: OtelVersion = {
  name: '1.2.9',
  version: '1.29.0',
  specUrl: 'https://opentelemetry.io/docs/specs/otel',
  logsTable: defaultLogsTable,
  logColumnMap: new Map<ColumnHint, string>([
    [ColumnHint.FilterTime, 'TimestampTime'],
    [ColumnHint.Time, 'Timestamp'],
    [ColumnHint.LogMessage, 'Body'],
    [ColumnHint.LogLevel, 'SeverityText'],
    [ColumnHint.TraceId, 'TraceId'],
    [ColumnHint.ResourceAttributes, 'ResourceAttributes'],
    [ColumnHint.ScopeAttributes, 'ScopeAttributes'],
    [ColumnHint.LogAttributes, 'LogAttributes'],
  ]),
  logLevels: ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
  traceTable: defaultTraceTable,
  traceColumnMap: new Map<ColumnHint, string>([
    [ColumnHint.Time, 'Timestamp'],
    [ColumnHint.TraceId, 'TraceId'],
    [ColumnHint.TraceSpanId, 'SpanId'],
    [ColumnHint.TraceParentSpanId, 'ParentSpanId'],
    [ColumnHint.TraceServiceName, 'ServiceName'],
    [ColumnHint.TraceOperationName, 'SpanName'],
    [ColumnHint.TraceDurationTime, 'Duration'],
    [ColumnHint.TraceTags, 'SpanAttributes'],
    [ColumnHint.TraceServiceTags, 'ResourceAttributes'],
    [ColumnHint.TraceStatusCode, 'StatusCode'],
    [ColumnHint.TraceKind, 'SpanKind'],
    [ColumnHint.TraceStatusMessage, 'StatusMessage'],
    [ColumnHint.TraceState, 'TraceState'],
  ]),
  flattenNested: false,
  traceDurationUnit: TimeUnit.Nanoseconds,
  traceEventsColumnPrefix: 'Events',
  traceLinksColumnPrefix: 'Links',
};

// otel130 tracks the otel_logs schema produced by opentelemetry-collector-contrib's
// clickhouseexporter starting in v0.151.0, which dropped the TimestampTime column
// (the table now orders/partitions directly on Timestamp). FilterTime is intentionally
// omitted from logColumnMap — sqlGenerator's getFilters() falls back to ColumnHint.Time
// when FilterTime is unmapped, and getOrderBy() drops orderBy entries whose hint
// doesn't resolve. See:
//   https://github.com/open-telemetry/opentelemetry-collector-contrib/pull/47720
//   https://github.com/open-telemetry/opentelemetry-collector-contrib/issues/48770
// otel_traces and otel_traces_trace_id_ts schemas were not changed.
const otel130: OtelVersion = {
  ...otel129,
  name: '1.3.0',
  version: '1.30.0',
  logColumnMap: new Map<ColumnHint, string>([
    [ColumnHint.Time, 'Timestamp'],
    [ColumnHint.LogMessage, 'Body'],
    [ColumnHint.LogLevel, 'SeverityText'],
    [ColumnHint.TraceId, 'TraceId'],
    [ColumnHint.ResourceAttributes, 'ResourceAttributes'],
    [ColumnHint.ScopeAttributes, 'ScopeAttributes'],
    [ColumnHint.LogAttributes, 'LogAttributes'],
  ]),
};

export const versions: readonly OtelVersion[] = [
  // When selected, will always keep OTEL config up to date as new versions are added
  { ...otel130, name: `latest (${otel130.name})`, version: 'latest' },
  otel130,
  otel129,
];

export const getLatestVersion = (): OtelVersion => versions[0];
export const getVersion = (version: string | undefined): OtelVersion | undefined => {
  if (!version) {
    return;
  }

  return versions.find((v) => v.version === version);
};

export default {
  traceTimestampTableSuffix,
  versions,
  getLatestVersion,
  getVersion,
};
