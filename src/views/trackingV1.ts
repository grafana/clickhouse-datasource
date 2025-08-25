import { reportInteraction } from "@grafana/runtime";
import { TimeUnit } from "types/queryBuilder";

// Server section
export const trackClickhouseConfigV1HostInput = () => {
    reportInteraction('clickhouse-config-v1-host-input');
};

export const trackClickhouseConfigV1PortInput = (props: { port: string }) => {
    reportInteraction('clickhouse-config-v1-port-input', props);
};

export const trackClickhouseConfigV1NativeHttpToggleClicked = (props: { nativeHttpToggle: string}) => {
    reportInteraction('clickhouse-config-v1-native-http-toggle-clicked', props);
};

export const trackClickhouseConfigV1SecureConnectionToggleClicked = (props: { secureConnection: boolean}) => {
    reportInteraction('clickhouse-config-v1-secure-connection-toggle-clicked', props);
};

// TLS/SSL Settings section
export const trackClickhouseConfigV1SkipTLSVerifyToggleClicked = (props: { skipTlsVerifyToggle: boolean}) => {
    reportInteraction('clickhouse-config-v1-skip-tls-verify-toggle-clicked', props);
};

export const trackClickhouseConfigV1TLSClientAuthToggleClicked = (props: { clientAuthToggle: boolean}) => {
    reportInteraction('clickhouse-config-v1-tls-client-auth-toggle-clicked', props);
};

export const trackClickhouseConfigV1WithCACertToggleClicked = (props: { caCertToggle: boolean }) => {
    reportInteraction('clickhouse-config-v1-with-ca-cert-toggle-clicked', props);
};

// Default DB and Table section
export const trackClickhouseConfigV1DefaultDbInput = () => {
    reportInteraction('clickhouse-config-v1-default-db-input');
};

export const trackClickhouseConfigV1DefaultTableInput = () => {
    reportInteraction('clickhouse-config-v1-default-table-input');
};

// Query settings section
export const trackClickhouseConfigV1QuerySettings = (props: { queryTimeout?: number, dialTimeout?: number, maxIdleConns?: number, maxOpenConns?: number, connMaxLifetime?: number, validateSql?: boolean }) => {
    reportInteraction('clickhouse-config-v1-query-settings', props);
};

// Logs config section
export const trackClickhouseConfigV1LogsConfig = (props: {defaultDatabase?: string, defaultTable?: string, otelEnabled?: boolean, version?: string, timeColumn?: string, levelColumn?: string, messageColumn?: string, selectContextColumns?: boolean, contextColumns?: string[] }) => {
    reportInteraction('clickhouse-config-v1-logs-config', props);
}

// Traces config section
export const trackClickhouseConfigV1TracesConfig = (props: { defaultDatabase?: string, defaultTable?: string, otelEnabled?: boolean, version?: string, traceIdColumn?: string, spanIdColumn?: string, operationNameColumn?: string, parentSpanIdColumn?: string, serviceNameColumn?: string, durationColumn?: string, durationUnit?: TimeUnit, startTimeColumn?: string, tagsColumn?: string, serviceTagsColumn?: string, kindColumn?: string, statusCodeColumn?: string, statusMessageColumn?: string, stateColumn?: string, instrumentationLibraryNameColumn?: string, instrumentationLibraryVersionColumn?: string, flattenNested?: boolean, traceEventsColumnPrefix?: string, traceLinksColumnPrefix?: string }) => {
    reportInteraction('clickhouse-config-v1-traces-config', props);
}

// Column Alias Tables section
export const trackClickhouseConfigV1ColumnAliasTableAdded = () => {
    reportInteraction('clickhouse-config-v1-column-alias-table-added');
};

// Row limit section
export const trackClickhouseConfigV1EnableRowLimitToggle = (props: {rowLimitEnabled: boolean}) => {
    reportInteraction('clickhouse-config-v1-enable-row-limit-toggle', props);
};

// Custom Settings section
export const trackClickhouseConfigV1CustomSettingAdded = () => {
    reportInteraction('clickhouse-config-v1-custom-setting-added');
};


