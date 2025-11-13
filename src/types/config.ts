import { DataSourceJsonData, KeyValue } from '@grafana/data';
import otel, { defaultLogsTable, defaultTraceTable } from 'otel';
import { TimeUnit } from './queryBuilder';

export interface CHConfig extends DataSourceJsonData {
  /**
   * The version of the plugin this config was saved with
   */
  version: string;

  host: string;
  port: number;
  protocol: Protocol;
  secure?: boolean;
  path?: string;

  tlsSkipVerify?: boolean;
  tlsAuth?: boolean;
  tlsAuthWithCACert?: boolean;

  username: string;

  defaultDatabase?: string;
  defaultTable?: string;

  connMaxLifetime?: string;
  dialTimeout?: string;
  maxIdleConns?: string;
  maxOpenConns?: string;
  queryTimeout?: string;
  validateSql?: boolean;

  logs?: CHLogsConfig;
  traces?: CHTracesConfig;

  aliasTables?: AliasTableEntry[];

  httpHeaders?: CHHttpHeader[];
  forwardGrafanaHeaders?: boolean;

  customSettings?: CHCustomSetting[];
  enableSecureSocksProxy?: boolean;
  enableRowLimit?: boolean;

  pdcInjected?: boolean;
}

interface CHSecureConfigProperties {
  password?: string;

  tlsCACert?: string;
  tlsClientCert?: string;
  tlsClientKey?: string;
}
export type CHSecureConfig = CHSecureConfigProperties | KeyValue<string>;

export interface CHHttpHeader {
  name: string;
  value: string;
  secure: boolean;
}

export interface CHCustomSetting {
  setting: string;
  value: string;
}

export interface CHLogsConfig {
  defaultDatabase?: string;
  defaultTable?: string;

  otelEnabled?: boolean;
  otelVersion?: string;

  timeColumn?: string;
  levelColumn?: string;
  messageColumn?: string;

  selectContextColumns?: boolean;
  contextColumns?: string[];
}

export interface CHTracesConfig {
  defaultDatabase?: string;
  defaultTable?: string;

  otelEnabled?: boolean;
  otelVersion?: string;

  traceIdColumn?: string;
  spanIdColumn?: string;
  operationNameColumn?: string;
  parentSpanIdColumn?: string;
  serviceNameColumn?: string;
  durationColumn?: string;
  durationUnit?: string;
  startTimeColumn?: string;
  tagsColumn?: string;
  serviceTagsColumn?: string;
  kindColumn?: string;
  statusCodeColumn?: string;
  statusMessageColumn?: string;
  stateColumn?: string;
  instrumentationLibraryNameColumn?: string;
  instrumentationLibraryVersionColumn?: string;

  flattenNested?: boolean;
  traceEventsColumnPrefix?: string;
  traceLinksColumnPrefix?: string;
}

export interface AliasTableEntry {
  targetDatabase: string;
  targetTable: string;
  aliasDatabase: string;
  aliasTable: string;
}

export enum Protocol {
  Native = 'native',
  Http = 'http',
}

export const defaultCHAdditionalSettingsConfig: Partial<CHConfig> = {
  logs: {
    defaultTable: defaultLogsTable,
    otelVersion: otel.getLatestVersion().version,
    selectContextColumns: true,
    contextColumns: [],
  },
  traces: {
    defaultTable: defaultTraceTable,
    otelVersion: otel.getLatestVersion().version,
    durationUnit: TimeUnit.Nanoseconds,
  },
};
