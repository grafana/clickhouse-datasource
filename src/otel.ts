import { ColumnHint } from "types/queryBuilder";

export const versions = [
  {
    name: 'default',
    version: 'default',
    logColumnMap: new Map<ColumnHint, string>([
      [ColumnHint.Time, 'Timestamp'],
      [ColumnHint.LogMessage, 'Body'],
      [ColumnHint.LogLevel, 'SeverityText'],
    ]),
  },
];
