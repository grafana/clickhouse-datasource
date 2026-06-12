import { DataSourceJsonData, KeyValue } from '@grafana/data';
import otel, { defaultLogsTable, defaultTraceTable } from 'otel';
import { TimeUnit } from './queryBuilder';

export type SignalType = 'logs' | 'traces';

/**
 * Configuration mode controls the datasource UI layout:
 * - 'classic': Full access to all databases/tables.
 * - 'single-table': Focused on one table. The user picks a signal type
 *   and configures the schema inline.
 */
export type ConfigMode = 'classic' | 'single-table';

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

  hideTableNameInAdhocFilters?: boolean;

  pdcInjected?: boolean;

  /**
   * Configuration mode: 'classic' (all databases) or 'single-table' (focused).
   * Defaults to 'classic' when unset.
   */
  configMode?: ConfigMode;

  /**
   * Signal type for single-table mode. Declares what the configured table contains.
   */
  signalType?: SignalType;
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

  filterTimeColumn?: string;
  timeColumn?: string;
  levelColumn?: string;
  messageColumn?: string;

  selectContextColumns?: boolean;
  contextColumns?: string[];
  showLogLinks?: boolean;
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
  showTraceLinks?: boolean;

  /**
   * Suffix appended to the traces table name to locate a companion trace-timestamp
   * index table (e.g. `<table>_trace_id_ts`). When such a table exists, trace ID
   * queries run a two-step lookup that narrows the main query's time range,
   * avoiding a full scan. Defaults to `_trace_id_ts` (the OTel convention).
   */
  traceTimestampTableSuffix?: string;
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
