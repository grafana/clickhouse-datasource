import { DataSourceJsonData } from '@grafana/data';

export interface CHConfig extends DataSourceJsonData {
  username: string;
  server: string;
  protocol: Protocol;
  port: number;
  defaultDatabase?: string;
  tlsSkipVerify?: boolean;
  tlsAuth?: boolean;
  tlsAuthWithCACert?: boolean;
  secure?: boolean;
  validate?: boolean;
  timeout?: string;
  queryTimeout?: string;
  customSettings?: CHCustomSetting[];
  enableSecureSocksProxy?: boolean;
}

export interface CHCustomSetting {
  setting: string;
  value: string;
}

export interface CHSecureConfig {
  password: string;
  tlsCACert?: string;
  tlsClientCert?: string;
  tlsClientKey?: string;
}

export enum Protocol {
  Native = 'native',
  HTTP = 'http',
}