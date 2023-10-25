import { ColumnHint, TimeUnit } from "types/queryBuilder";

export interface OtelVersion {
  name: string;
  version: string;
  logColumnMap: Map<ColumnHint, string>;
  traceColumnMap: Map<ColumnHint, string>;
  traceDurationUnit: TimeUnit.Nanoseconds;
}

export const versions: readonly OtelVersion[] = [
  {
    name: 'latest',
    version: '1.26.0',
    logColumnMap: new Map<ColumnHint, string>([
      [ColumnHint.Time, 'Timestamp'],
      [ColumnHint.LogMessage, 'Body'],
      [ColumnHint.LogLevel, 'SeverityText'],
    ]),
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
