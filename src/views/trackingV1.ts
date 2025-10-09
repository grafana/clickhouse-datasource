import { reportInteraction } from '@grafana/runtime';
import { TimeUnit } from 'types/queryBuilder';

// Server section
export const trackClickhouseConfigV1HostInput = () => {
  reportInteraction('clickhouse_config_v1_host_input');
};

export const trackClickhouseConfigV1PortInput = (props: { port: string }) => {
  reportInteraction('clickhouse_config_v1_port_input', props);
};

export const trackClickhouseConfigV1NativeHttpToggleClicked = (props: { nativeHttpToggle: string }) => {
  reportInteraction('clickhouse_config_v1_native_http_toggle_clicked', props);
};

export const trackClickhouseConfigV1SecureConnectionToggleClicked = (props: { secureConnection: boolean }) => {
  reportInteraction('clickhouse_config_v1_secure_connection_toggle_clicked', props);
};

// TLS/SSL Settings section
export const trackClickhouseConfigV1SkipTLSVerifyToggleClicked = (props: { skipTlsVerifyToggle: boolean }) => {
  reportInteraction('clickhouse_config_v1_skip_tls_verify_toggle_clicked', props);
};

export const trackClickhouseConfigV1TLSClientAuthToggleClicked = (props: { clientAuthToggle: boolean }) => {
  reportInteraction('clickhouse_config_v1_tls_client_auth_toggle_clicked', props);
};

export const trackClickhouseConfigV1WithCACertToggleClicked = (props: { caCertToggle: boolean }) => {
  reportInteraction('clickhouse_config_v1_with_ca_cert_toggle_clicked', props);
};

// Default DB and Table section
export const trackClickhouseConfigV1DefaultDbInput = () => {
  reportInteraction('clickhouse_config_v1_default_db_input');
};

export const trackClickhouseConfigV1DefaultTableInput = () => {
  reportInteraction('clickhouse_config_v1_default_table_input');
};

// Query settings section
export const trackClickhouseConfigV1QuerySettings = (props: {
  queryTimeout?: number;
  dialTimeout?: number;
  maxIdleConns?: number;
  maxOpenConns?: number;
  connMaxLifetime?: number;
  validateSql?: boolean;
}) => {
  reportInteraction('clickhouse_config_v1_query_settings', props);
};

// Logs config section
export const trackClickhouseConfigV1LogsConfig = (props: {
  defaultDatabase?: string;
  defaultTable?: string;
  otelEnabled?: boolean;
  version?: string;
  timeColumn?: string;
  levelColumn?: string;
  messageColumn?: string;
  selectContextColumns?: boolean;
  contextColumns?: string[];
}) => {
  reportInteraction('clickhouse_config_v1_logs_config', props);
};

// Traces config section
export const trackClickhouseConfigV1TracesConfig = (props: {
  defaultDatabase?: string;
  defaultTable?: string;
  otelEnabled?: boolean;
  version?: string;
  traceIdColumn?: string;
  spanIdColumn?: string;
  operationNameColumn?: string;
  parentSpanIdColumn?: string;
  serviceNameColumn?: string;
  durationColumn?: string;
  durationUnit?: TimeUnit;
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
}) => {
  reportInteraction('clickhouse_config_v1_traces_config', props);
};

// Column Alias Tables section
export const trackClickhouseConfigV1ColumnAliasTableAdded = () => {
  reportInteraction('clickhouse_config_v1_column_alias_table_added');
};

// Row limit section
export const trackClickhouseConfigV1EnableRowLimitToggle = (props: { rowLimitEnabled: boolean }) => {
  reportInteraction('clickhouse_config_v1_enable_row_limit_toggle', props);
};

// Custom Settings section
export const trackClickhouseConfigV1CustomSettingAdded = () => {
  reportInteraction('clickhouse_config_v1_custom_setting_added');
};
