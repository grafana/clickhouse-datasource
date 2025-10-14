import { reportInteraction } from '@grafana/runtime';
import { TimeUnit } from 'types/queryBuilder';

// Feedback form
export const trackInfluxDBConfigV2FeedbackButtonClicked = () => {
  reportInteraction('clickhouse_config_v2_feedback_button_clicked');
};

// Server and encryption section
export const trackClickhouseConfigV2HostInput = () => {
  reportInteraction('clickhouse_config_v2_host_input');
};

export const trackClickhouseConfigV2PortInput = (props: { port: string }) => {
  reportInteraction('clickhouse_config_v2_port_input', props);
};

export const trackClickhouseConfigV2NativeHttpToggleClicked = (props: { nativeHttpToggle: string }) => {
  reportInteraction('clickhouse_config_v2_native_http_toggle_clicked', props);
};

export const trackClickhouseConfigV2SecureConnectionChecked = (props: { secureConnection: boolean }) => {
  reportInteraction('clickhouse_config_v2_secure_connection_checked', props);
};

// Database credentials section
export const trackClickhouseConfigV2DatabaseCredentialsUserInput = () => {
  reportInteraction('clickhouse_config_v2_database_credentials_user_input');
};

export const trackClickhouseConfigV2DatabaseCredentialsPasswordInput = () => {
  reportInteraction('clickhouse_config_v2_database_credentials_password_input');
};

// TLS/SSL Settings section
export const trackClickhouseConfigV2SkipTLSVerifyToggleClicked = (props: { skipTlsVerifyToggle: boolean }) => {
  reportInteraction('clickhouse_config_v2_skip_tls_verify_toggle_clicked', props);
};

export const trackClickhouseConfigV2TLSClientAuthToggleClicked = (props: { clientAuthToggle: boolean }) => {
  reportInteraction('clickhouse_config_v2_tls_client_auth_toggle_clicked', props);
};

export const trackClickhouseConfigV2WithCACertToggleClicked = (props: { caCertToggle: boolean }) => {
  reportInteraction('clickhouse_config_v2_with_ca_cert_toggle_clicked', props);
};

// Additional settings
// Default DB and Table section
export const trackClickhouseConfigV2DefaultDbInput = () => {
  reportInteraction('clickhouse_config_v2_default_db_input');
};

export const trackClickhouseConfigV2DefaultTableInput = () => {
  reportInteraction('clickhouse_config_v2_default_table_input');
};

// Query settings section
export const trackClickhouseConfigV2QuerySettings = (props: {
  queryTimeout?: number;
  dialTimeout?: number;
  maxIdleConns?: number;
  maxOpenConns?: number;
  connMaxLifetime?: number;
  validateSql?: boolean;
}) => {
  reportInteraction('clickhouse_config_v2_query_settings', props);
};

// Logs config section
export const trackClickhouseConfigV2LogsConfig = (props: {
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
  reportInteraction('clickhouse_config_v2_logs_config', props);
};

// Traces config section
export const trackClickhouseConfigV2TracesConfig = (props: {
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
  reportInteraction('clickhouse_config_v2_traces_config', props);
};

// Column Alias Tables section
export const trackClickhouseConfigV2ColumnAliasTableAdded = () => {
  reportInteraction('clickhouse_config_v2_column_alias_table_added');
};

// Row limit section
export const trackClickhouseConfigV2EnableRowLimitToggle = (props: { rowLimitEnabled: boolean }) => {
  reportInteraction('clickhouse_config_v2_enable_row_limit_toggle', props);
};

// Custom Settings section
export const trackClickhouseConfigV2CustomSettingClicked = () => {
  reportInteraction('clickhouse_config_v2_custom_setting_clicked');
};
