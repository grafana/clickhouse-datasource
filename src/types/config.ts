import { DataSourceJsonData, KeyValue } from '@grafana/data';

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

  dialTimeout?: string;
  queryTimeout?: string;
  validateSql?: boolean;

  logs?: CHLogsConfig;
  traces?: CHTracesConfig;

  httpHeaders?: CHHttpHeader[];

  customSettings?: CHCustomSetting[];
  enableSecureSocksProxy?: boolean;
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
}

export enum Protocol {
  Native = 'native',
  Http = 'http',
}
