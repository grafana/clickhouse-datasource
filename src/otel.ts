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
    [ColumnHint.Time, 'Timestamp'],
    [ColumnHint.LogMessage, 'Body'],
    [ColumnHint.LogLevel, 'SeverityText'],
    [ColumnHint.LogLabels, 'LogAttributes'],
    [ColumnHint.TraceId, 'TraceId'],
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

export const versions: readonly OtelVersion[] = [
  // When selected, will always keep OTEL config up to date as new versions are added
  { ...otel129, name: `latest (${otel129.name})`, version: 'latest' },
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
