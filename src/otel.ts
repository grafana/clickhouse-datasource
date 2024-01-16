import { ColumnHint, TimeUnit } from "types/queryBuilder";

export interface OtelVersion {
  name: string;
  version: string;
  specUrl?: string;
  logColumnMap: Map<ColumnHint, string>;
  logLevels: string[];
  traceColumnMap: Map<ColumnHint, string>;
  traceDurationUnit: TimeUnit.Nanoseconds;
}

export const versions: readonly OtelVersion[] = [
  {
    name: 'latest',
    version: '1.29.0',
    specUrl: 'https://opentelemetry.io/docs/specs/otel',
    logColumnMap: new Map<ColumnHint, string>([
      [ColumnHint.Time, 'Timestamp'],
      [ColumnHint.LogMessage, 'Body'],
      [ColumnHint.LogLevel, 'SeverityText'],
    ]),
    logLevels: [
      'TRACE',
      'DEBUG',
      'INFO',
      'WARN',
      'ERROR',
      'FATAL'
    ],
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
    ]),
    traceDurationUnit: TimeUnit.Nanoseconds,
  },
];
