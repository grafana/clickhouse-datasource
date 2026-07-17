// Package models holds the JSON settings model for the ClickHouse datasource
// that backs the dsconfig single source of truth. Its json tags are the
// authoritative mirror of the jsonData fields declared in dsconfig.json and are
// compared against the schema by the conformance suite (see
// pkg/schema/dsconfig_test.go). Add, remove, or rename a jsonData field in the
// schema and the matching change must be made here, and vice versa.
package models

// ClickHouseSettingsJSON is the Go struct that backs the datasource jsonData.
// Every json tag corresponds to a jsonData field in dsconfig.json. Secure values
// (password, TLS certs/key) live in secureJsonData and are intentionally absent.
type ClickHouseSettingsJSON struct {
	Version string `json:"version,omitempty"`

	Host     string `json:"host,omitempty"`
	Port     int64  `json:"port,omitempty"`
	Protocol string `json:"protocol,omitempty"`
	Secure   bool   `json:"secure,omitempty"`
	Path     string `json:"path,omitempty"`

	TLSSkipVerify     bool `json:"tlsSkipVerify,omitempty"`
	TLSAuth           bool `json:"tlsAuth,omitempty"`
	TLSAuthWithCACert bool `json:"tlsAuthWithCACert,omitempty"`

	Username string `json:"username,omitempty"`

	DefaultDatabase string `json:"defaultDatabase,omitempty"`
	DefaultTable    string `json:"defaultTable,omitempty"`

	ConnMaxLifetime string `json:"connMaxLifetime,omitempty"`
	DialTimeout     string `json:"dialTimeout,omitempty"`
	MaxIdleConns    string `json:"maxIdleConns,omitempty"`
	MaxOpenConns    string `json:"maxOpenConns,omitempty"`
	QueryTimeout    string `json:"queryTimeout,omitempty"`
	ValidateSQL     bool   `json:"validateSql,omitempty"`

	Logs   LogsConfig   `json:"logs"`
	Traces TracesConfig `json:"traces"`

	AliasTables []AliasTableEntry `json:"aliasTables,omitempty"`

	HTTPHeaders           []HTTPHeader `json:"httpHeaders,omitempty"`
	ForwardGrafanaHeaders bool         `json:"forwardGrafanaHeaders,omitempty"`

	CustomSettings         []CustomSetting `json:"customSettings,omitempty"`
	EnableSecureSocksProxy bool            `json:"enableSecureSocksProxy,omitempty"`
	EnableRowLimit         bool            `json:"enableRowLimit,omitempty"`

	HideTableNameInAdhocFilters bool `json:"hideTableNameInAdhocFilters,omitempty"`
}

// LogsConfig backs the jsonData.logs nested object.
type LogsConfig struct {
	DefaultDatabase string `json:"defaultDatabase,omitempty"`
	DefaultTable    string `json:"defaultTable,omitempty"`

	OtelEnabled bool   `json:"otelEnabled,omitempty"`
	OtelVersion string `json:"otelVersion,omitempty"`

	FilterTimeColumn string `json:"filterTimeColumn,omitempty"`
	TimeColumn       string `json:"timeColumn,omitempty"`
	LevelColumn      string `json:"levelColumn,omitempty"`
	MessageColumn    string `json:"messageColumn,omitempty"`

	SelectContextColumns bool     `json:"selectContextColumns,omitempty"`
	ContextColumns       []string `json:"contextColumns,omitempty"`
	ShowLogLinks         bool     `json:"showLogLinks,omitempty"`
}

// TracesConfig backs the jsonData.traces nested object.
type TracesConfig struct {
	DefaultDatabase string `json:"defaultDatabase,omitempty"`
	DefaultTable    string `json:"defaultTable,omitempty"`

	OtelEnabled bool   `json:"otelEnabled,omitempty"`
	OtelVersion string `json:"otelVersion,omitempty"`

	TraceIDColumn                       string `json:"traceIdColumn,omitempty"`
	SpanIDColumn                        string `json:"spanIdColumn,omitempty"`
	OperationNameColumn                 string `json:"operationNameColumn,omitempty"`
	ParentSpanIDColumn                  string `json:"parentSpanIdColumn,omitempty"`
	ServiceNameColumn                   string `json:"serviceNameColumn,omitempty"`
	DurationColumn                      string `json:"durationColumn,omitempty"`
	DurationUnit                        string `json:"durationUnit,omitempty"`
	StartTimeColumn                     string `json:"startTimeColumn,omitempty"`
	TagsColumn                          string `json:"tagsColumn,omitempty"`
	ServiceTagsColumn                   string `json:"serviceTagsColumn,omitempty"`
	KindColumn                          string `json:"kindColumn,omitempty"`
	StatusCodeColumn                    string `json:"statusCodeColumn,omitempty"`
	StatusMessageColumn                 string `json:"statusMessageColumn,omitempty"`
	StateColumn                         string `json:"stateColumn,omitempty"`
	InstrumentationLibraryNameColumn    string `json:"instrumentationLibraryNameColumn,omitempty"`
	InstrumentationLibraryVersionColumn string `json:"instrumentationLibraryVersionColumn,omitempty"`

	FlattenNested           bool   `json:"flattenNested,omitempty"`
	TraceEventsColumnPrefix string `json:"traceEventsColumnPrefix,omitempty"`
	TraceLinksColumnPrefix  string `json:"traceLinksColumnPrefix,omitempty"`
	ShowTraceLinks          bool   `json:"showTraceLinks,omitempty"`
}

// HTTPHeader backs an entry in the jsonData.httpHeaders array.
type HTTPHeader struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Secure bool   `json:"secure"`
}

// CustomSetting backs an entry in the jsonData.customSettings array.
type CustomSetting struct {
	Setting string `json:"setting"`
	Value   string `json:"value"`
}

// AliasTableEntry backs an entry in the jsonData.aliasTables array.
type AliasTableEntry struct {
	TargetDatabase string `json:"targetDatabase"`
	TargetTable    string `json:"targetTable"`
	AliasDatabase  string `json:"aliasDatabase"`
	AliasTable     string `json:"aliasTable"`
}
