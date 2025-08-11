import { reportInteraction } from "@grafana/runtime";

// Server section
export const trackClickhouseConfigV1HostInput = () => {
    reportInteraction('clickhouse-config-v1-host-input');
};

export const trackClickhouseConfigV1PortInput = () => {
    reportInteraction('clickhouse-config-v1-port-input');
};

export const trackClickhouseConfigV1NativeHttpToggleClicked = () => {
    reportInteraction('clickhouse-config-v1-native-http-toggle-clicked');
};

export const trackClickhouseConfigV1SecureConnectionToggleClicked = () => {
    reportInteraction('clickhouse-config-v1-secure-connection-toggle-clicked');
};

// TLS/SSL Settings section
export const trackClickhouseConfigV1SkipTLSVerifyToggleClicked = () => {
    reportInteraction('clickhouse-config-v1-skip-tls-verify-toggle-clicked');
};

export const trackClickhouseConfigV1TLSClientAuthToggleClicked = () => {
    reportInteraction('clickhouse-config-v1-tls-client-auth-toggle-clicked');
};

export const trackClickhouseConfigV1WithCACertToggleClicked = () => {
    reportInteraction('clickhouse-config-v1-with-ca-cert-toggle-clicked');
};

// Default DB and Table section
export const trackClickhouseConfigV1DefaultDbInput = () => {
    reportInteraction('clickhouse-config-v1-default-db-input');
};

export const trackClickhouseConfigV1DefaultTableInput = () => {
    reportInteraction('clickhouse-config-v1-default-table-input');
};

// Query settings section
export const trackClickhouseConfigV1DialTimeoutInput = () => {
    reportInteraction('clickhouse-config-v1-dial-timeout-input');
};

export const trackClickhouseConfigV1QueryTimeoutInput = () => {
    reportInteraction('clickhouse-config-v1-query-timeout-input');
};

export const trackClickhouseConfigV1ConnMaxLifetimeInput = () => {
    reportInteraction('clickhouse-config-v1-conn-max-lifetime-input');
};

export const trackClickhouseConfigV1MaxIdleConnsInput = () => {
    reportInteraction('clickhouse-config-v1-max-idle-conns-input');
};

export const trackClickhouseConfigV1MaxOpenConnsInput = () => {
    reportInteraction('clickhouse-config-v1-max-open-conns-input');
};

export const trackClickhouseConfigV1ValidateSQLToggleClicked = () => {
    reportInteraction('clickhouse-config-v1-validate-sql-toggle-clicked');
};

// Logs config section
export const trackClickhouseConfigV1DefaultLogDbInput = () => {
    reportInteraction('clickhouse-config-v1-default-log-db-input');
};

export const trackClickhouseConfigV1DefaultLogTableInput = () => {
    reportInteraction('clickhouse-config-v1-default-log-table-input');
};

export const trackClickhouseConfigV1UseOtelLogsToggleClicked = () => {
    reportInteraction('clickhouse-config-v1-use-otel-logs-toggle-clicked');
};

export const trackClickhouseConfigV1LogsOtelVersion = (props: { version: string }) => {
    reportInteraction('clickhouse-config-v1-logs-otel-version', props);
};

export const trackClickhouseConfigV1LogTimeColumnInput = () => {
    reportInteraction('clickhouse-config-v1-log-time-column-input');
};

export const trackClickhouseConfigV1LogLevelColumnInput = () => {
    reportInteraction('clickhouse-config-v1-log-level-column-input');
};

export const trackClickhouseConfigV1LogMessageColumnInput = () => {
    reportInteraction('clickhouse-config-v1-log-message-column-input');
};

export const trackClickhouseConfigV1LogAutoSelectColumnsInput = () => {
    reportInteraction('clickhouse-config-v1-log-auto-select-columns-input');
};

export const trackClickhouseConfigV1LogContextColumnInput = () => {
    reportInteraction('clickhouse-config-v1-log-context-column-input');
};

// Traces config section
export const trackClickhouseConfigV1DefaultTraceDbInput = () => {
    reportInteraction('clickhouse-config-v1-default-trace-db-input');
};

export const trackClickhouseConfigV1DefaultTraceTableInput = () => {
    reportInteraction('clickhouse-config-v1-default-trace-table-input');
};

export const trackClickhouseConfigV1UseOtelTracesToggleClicked = () => {
    reportInteraction('clickhouse-config-v1-use-otel-traces-toggle-clicked');
};

export const trackClickhouseConfigV1TracesOtelVersion = (props: { version: string }) => {
    reportInteraction('clickhouse-config-v1-traces-otel-version', props);
};

export const trackClickhouseConfigV1TraceIdColumnInput = () => {
    reportInteraction('clickhouse-config-v1-trace-id-column-input');
};

export const trackClickhouseConfigV1SpanIdColumnInput = () => {
    reportInteraction('clickhouse-config-v1-span-id-column-input');
};

export const trackClickhouseConfigV1OperationNameColumnInput = () => {
    reportInteraction('clickhouse-config-v1-operation-name-column-input');
};

export const trackClickhouseConfigV1ParentSpanIdColumnInput = () => {
    reportInteraction('clickhouse-config-v1-parent-span-id-column-input');
};

export const trackClickhouseConfigV1ServiceNameColumnInput = () => {
    reportInteraction('clickhouse-config-v1-service-name-column-input');
};

export const trackClickhouseConfigV1DurationTimeColumnInput = () => {
    reportInteraction('clickhouse-config-v1-operation-name-column-input');
};

export const trackClickhouseConfigV1DurationUnitInput = () => {
    reportInteraction('clickhouse-config-v1-operation-name-column-input');
};

export const trackClickhouseConfigV1StartTimeColumnInput = () => {
    reportInteraction('clickhouse-config-v1-start-time-column-input');
};

export const trackClickhouseConfigV1TagsColumnInput = () => {
    reportInteraction('clickhouse-config-v1-tags-column-input');
};

export const trackClickhouseConfigV1ServiceTagsColumnInput = () => {
    reportInteraction('clickhouse-config-v1-service-tags-column-input');
};

export const trackClickhouseConfigV1KindColumnInput = () => {
    reportInteraction('clickhouse-config-v1-kind-column-input');
};

export const trackClickhouseConfigV1StatusCodeColumnInput = () => {
    reportInteraction('clickhouse-config-v1-status-code-column-input');
};

export const trackClickhouseConfigV1StatusMessageColumnInput = () => {
    reportInteraction('clickhouse-config-v1-status-message-column-input');
};

export const trackClickhouseConfigV1StateColumnInput = () => {
    reportInteraction('clickhouse-config-v1-state-column-input');
};

export const trackClickhouseConfigV1LibraryNameColumnInput = () => {
    reportInteraction('clickhouse-config-v1-library-name-column-input');
};

export const trackClickhouseConfigV1LibraryVersionColumnInput = () => {
    reportInteraction('clickhouse-config-v1-library-version-column-input');
};

export const trackClickhouseConfigV1UseFlattenNeededToggleClicked = () => {
    reportInteraction('clickhouse-config-v1-use-flatten-needed-toggle-clicked');
};

export const trackClickhouseConfigV1EventsPrefixColumnInput = () => {
    reportInteraction('clickhouse-config-v1-events-prefix-column-input');
};

export const trackClickhouseConfigV1LinksPrefixColumnInput = () => {
    reportInteraction('clickhouse-config-v1-links-prefix-column-input');
};

// Column Alias Tables section
export const trackClickhouseConfigV1ColumnAliasTableAdded = () => {
    reportInteraction('clickhouse-config-v1-column-alias-table-added');
};

// Row limit section
export const trackClickhouseConfigV1CustomSettingAdded = () => {
    reportInteraction('clickhouse-config-v1-custom-setting-added');
};

// Custom Settings section
export const trackClickhouseConfigV1EnableRowLimitToggleClicked = () => {
    reportInteraction('clickhouse-config-v1-enable-row-limit-toggle-clicked');
};
