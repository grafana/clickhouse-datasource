import { DataQuery, DataSourceJsonData } from '@grafana/data';

export interface CHQuery extends DataQuery {
  rawSql: string;
  format: number;
}

export const defaultQuery: Partial<CHQuery> = {};

export interface CHConfig extends DataSourceJsonData {
  username: string;
  server: string;
  port: number;
  defaultDatabase?: string;
  tlsSkipVerify?: boolean;
  tlsAuth?: boolean;
  tlsAuthWithCACert?: boolean;
}

export interface CHSecureConfig {
  password: string;
  tlsCACert?: string;
  tlsClientCert?: string;
  tlsClientKey?: string;
}
