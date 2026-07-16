package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/proxy"
	sdkconfig "github.com/grafana/grafana-plugin-sdk-go/config"
)

// Settings - data loaded from grafana settings database
type Settings struct {
	// Hosts is the optional list of nodes to connect to. When non-empty it takes
	// precedence over Host/Port, which stay supported for existing data sources.
	// clickhouse-go load-balances and fails over across the entries. A node
	// without its own Port falls back to the shared Port.
	Hosts    []HostAddress `json:"hosts,omitempty"`
	Host     string        `json:"host,omitempty"`
	Port     int64         `json:"port,omitempty"`
	Protocol string        `json:"protocol"`
	Secure   bool          `json:"secure,omitempty"`
	Path     string        `json:"path,omitempty"`

	InsecureSkipVerify bool `json:"tlsSkipVerify,omitempty"`
	TlsClientAuth      bool `json:"tlsAuth,omitempty"`
	TlsAuthWithCACert  bool `json:"tlsAuthWithCACert,omitempty"`
	TlsClientCert      string
	TlsCACert          string
	TlsClientKey       string

	Username string `json:"username,omitempty"`
	Password string `json:"-,omitempty"` //nolint

	DefaultDatabase string `json:"defaultDatabase,omitempty"`

	ConnMaxLifetime string `json:"connMaxLifetime,omitempty"`
	DialTimeout     string `json:"dialTimeout,omitempty"`
	QueryTimeout    string `json:"queryTimeout,omitempty"`
	MaxIdleConns    string `json:"maxIdleConns,omitempty"`
	MaxOpenConns    string `json:"maxOpenConns,omitempty"`

	HttpHeaders           map[string]string `json:"-"`
	ForwardGrafanaHeaders bool              `json:"forwardGrafanaHeaders,omitempty"`
	CustomSettings        []CustomSetting   `json:"customSettings"`
	ProxyOptions          *proxy.Options

	RowLimit       int64 `json:"rowLimit,omitempty"`
	EnableRowLimit bool  `json:"enableRowLimit,omitempty"`

	// RowCapacityHint is an optional expected row count passed to sqlds as
	// DriverSettings.RowCapacityHint. sqlds pre-allocates each data.Frame's
	// fields to this value before scanning, avoiding per-column slice growth on large
	// results. It is applied to every query, so leave it at 0 (the default,
	// disabled) unless queries from this datasource reliably return a similar,
	// large number of rows. A value larger than the typical result wastes
	// memory.
	RowCapacityHint int64 `json:"rowCapacityHint,omitempty"`

	// EnableSchemaCache gates the in-process cache that memoizes
	// system.tables / system.columns / DISTINCT column-value lookups used
	// by the query builder. Defaults to true.
	EnableSchemaCache bool `json:"enableSchemaCache,omitempty"`
	// SchemaCacheTTLSeconds controls how long schema-introspection results
	// are considered fresh. Defaults to 60. Set lower if users commonly run
	// ALTER TABLE and expect the builder to reflect changes immediately.
	SchemaCacheTTLSeconds int `json:"schemaCacheTTLSeconds,omitempty"`
}

// HostAddress is a single node in Settings.Hosts.
type HostAddress struct {
	Host string `json:"host"`
	Port int64  `json:"port,omitempty"`
}

type CustomSetting struct {
	Setting string `json:"setting"`
	Value   string `json:"value"`
}

const secureHeaderKeyPrefix = "secureHttpHeaders."

func (settings *Settings) isValid() (err error) {
	if len(settings.Hosts) > 0 {
		for _, host := range settings.Hosts {
			if host.Host == "" {
				return backend.DownstreamError(ErrorMessageInvalidHost)
			}
			if host.Port == 0 && settings.Port == 0 {
				return backend.DownstreamError(ErrorMessageInvalidPort)
			}
		}
		return nil
	}
	if settings.Host == "" {
		return backend.DownstreamError(ErrorMessageInvalidHost)
	}
	if settings.Port == 0 {
		return backend.DownstreamError(ErrorMessageInvalidPort)
	}
	return nil
}

// parsePort reads a port that may arrive as a JSON number or a string.
func parsePort(value interface{}) (int64, error) {
	switch port := value.(type) {
	case string:
		parsed, err := strconv.ParseInt(port, 0, 64)
		if err != nil {
			return 0, fmt.Errorf("could not parse port value: %w", err)
		}
		return parsed, nil
	case float64:
		return int64(port), nil
	default:
		return 0, fmt.Errorf("could not parse port value: unexpected type %T", value)
	}
}

// parseHosts deserializes the "hosts" field. Entries without a host name are
// skipped so a trailing blank row in the UI does not become an empty address.
func parseHosts(value interface{}) ([]HostAddress, error) {
	entries, ok := value.([]interface{})
	if !ok {
		return nil, fmt.Errorf("could not parse hosts value: expected a list, got %T", value)
	}

	hosts := make([]HostAddress, 0, len(entries))
	for _, entry := range entries {
		fields, ok := entry.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("could not parse hosts value: expected a list of objects, got %T", entry)
		}

		var host HostAddress
		if fields["host"] != nil {
			name, ok := fields["host"].(string)
			if !ok {
				return nil, fmt.Errorf("could not parse hosts value: host must be a string, got %T", fields["host"])
			}
			host.Host = strings.TrimSpace(name)
		}
		if host.Host == "" {
			continue
		}

		if fields["port"] != nil {
			port, err := parsePort(fields["port"])
			if err != nil {
				return nil, err
			}
			host.Port = port
		}

		hosts = append(hosts, host)
	}

	return hosts, nil
}

// LoadSettings will read and validate Settings from the DataSourceConfig
func LoadSettings(ctx context.Context, config backend.DataSourceInstanceSettings) (settings Settings, err error) {
	var jsonData map[string]interface{}
	if err := json.Unmarshal(config.JSONData, &jsonData); err != nil {
		return settings, fmt.Errorf("%s: %w", err.Error(), ErrorMessageInvalidJSON)
	}

	// Deprecated: Replaced with Host for v4. Deserializes "server" field for old v3 configs.
	if jsonData["server"] != nil {
		settings.Host = strings.TrimSpace(jsonData["server"].(string))
	}
	if jsonData["host"] != nil {
		settings.Host = strings.TrimSpace(jsonData["host"].(string))
	}

	if jsonData["port"] != nil {
		settings.Port, err = parsePort(jsonData["port"])
		if err != nil {
			return settings, backend.DownstreamError(err)
		}
	}

	// Hosts supersedes Host/Port when set, in the same way Host supersedes the
	// deprecated "server" above. Existing single-host configs keep working
	// untouched, so no migration is needed.
	if jsonData["hosts"] != nil {
		settings.Hosts, err = parseHosts(jsonData["hosts"])
		if err != nil {
			return settings, backend.DownstreamError(err)
		}
	}
	if jsonData["protocol"] != nil {
		settings.Protocol = jsonData["protocol"].(string)
	}
	if jsonData["secure"] != nil {
		if secure, ok := jsonData["secure"].(string); ok {
			settings.Secure, err = strconv.ParseBool(secure)
			if err != nil {
				return settings, backend.DownstreamError(fmt.Errorf("could not parse secure value: %w", err))
			}
		} else {
			settings.Secure = jsonData["secure"].(bool)
		}
	}
	if jsonData["path"] != nil {
		settings.Path = jsonData["path"].(string)
	}

	if jsonData["tlsSkipVerify"] != nil {
		if tlsSkipVerify, ok := jsonData["tlsSkipVerify"].(string); ok {
			settings.InsecureSkipVerify, err = strconv.ParseBool(tlsSkipVerify)
			if err != nil {
				return settings, backend.DownstreamError(fmt.Errorf("could not parse tlsSkipVerify value: %w", err))
			}
		} else {
			settings.InsecureSkipVerify = jsonData["tlsSkipVerify"].(bool)
		}
	}
	if jsonData["tlsAuth"] != nil {
		if tlsAuth, ok := jsonData["tlsAuth"].(string); ok {
			settings.TlsClientAuth, err = strconv.ParseBool(tlsAuth)
			if err != nil {
				return settings, backend.DownstreamError(fmt.Errorf("could not parse tlsAuth value: %w", err))
			}
		} else {
			settings.TlsClientAuth = jsonData["tlsAuth"].(bool)
		}
	}
	if jsonData["tlsAuthWithCACert"] != nil {
		if tlsAuthWithCACert, ok := jsonData["tlsAuthWithCACert"].(string); ok {
			settings.TlsAuthWithCACert, err = strconv.ParseBool(tlsAuthWithCACert)
			if err != nil {
				return settings, backend.DownstreamError(fmt.Errorf("could not parse tlsAuthWithCACert value: %w", err))
			}
		} else {
			settings.TlsAuthWithCACert = jsonData["tlsAuthWithCACert"].(bool)
		}
	}

	if jsonData["username"] != nil {
		settings.Username = jsonData["username"].(string)
	}
	if jsonData["defaultDatabase"] != nil {
		settings.DefaultDatabase = jsonData["defaultDatabase"].(string)
	}

	// Deprecated: Replaced with DialTimeout for v4. Deserializes "timeout" field for old v3 configs.
	if jsonData["timeout"] != nil {
		if val, ok := jsonData["timeout"].(string); !ok {
			if val, ok := jsonData["timeout"].(float64); ok {
				settings.DialTimeout = fmt.Sprintf("%d", int64(val))
			}
		} else {
			settings.DialTimeout = val
		}
	}
	if jsonData["dialTimeout"] != nil {
		if val, ok := jsonData["dialTimeout"].(string); !ok {
			if val, ok := jsonData["dialTimeout"].(float64); ok {
				settings.DialTimeout = fmt.Sprintf("%d", int64(val))
			}
		} else {
			settings.DialTimeout = val
		}
	}

	if jsonData["queryTimeout"] != nil {
		if val, ok := jsonData["queryTimeout"].(string); ok {
			settings.QueryTimeout = val
		}
		if val, ok := jsonData["queryTimeout"].(float64); ok {
			settings.QueryTimeout = fmt.Sprintf("%d", int64(val))
		}
	}
	if jsonData["customSettings"] != nil {
		customSettingsRaw := jsonData["customSettings"].([]interface{})
		customSettings := make([]CustomSetting, len(customSettingsRaw))

		for i, raw := range customSettingsRaw {
			rawMap := raw.(map[string]interface{})
			customSettings[i] = CustomSetting{
				Setting: rawMap["setting"].(string),
				Value:   rawMap["value"].(string),
			}
		}

		settings.CustomSettings = customSettings
	}
	if jsonData["forwardGrafanaHeaders"] != nil {
		if forwardGrafanaHeaders, ok := jsonData["forwardGrafanaHeaders"].(string); ok {
			settings.ForwardGrafanaHeaders, err = strconv.ParseBool(forwardGrafanaHeaders)
			if err != nil {
				return settings, backend.DownstreamError(fmt.Errorf("could not parse forwardGrafanaHeaders value: %w", err))
			}
		} else {
			settings.ForwardGrafanaHeaders = jsonData["forwardGrafanaHeaders"].(bool)
		}
	}

	if jsonData["enableRowLimit"] != nil {
		if enableRowLimitString, ok := jsonData["enableRowLimit"].(string); ok {
			settings.EnableRowLimit, err = strconv.ParseBool(enableRowLimitString)
			if err != nil {
				backend.Logger.Warn("Failed to parse enableRowLimit value, defaulting to false", "error", err)
			}
		} else {
			settings.EnableRowLimit = jsonData["enableRowLimit"].(bool)
		}
	}

	// Default schema cache on; surface both as booleans and strings to stay
	// consistent with the existing settings-parsing style in this file.
	settings.EnableSchemaCache = true
	if raw, ok := jsonData["enableSchemaCache"]; ok && raw != nil {
		switch v := raw.(type) {
		case bool:
			settings.EnableSchemaCache = v
		case string:
			if parsed, parseErr := strconv.ParseBool(v); parseErr == nil {
				settings.EnableSchemaCache = parsed
			} else {
				backend.Logger.Warn("Failed to parse enableSchemaCache value, defaulting to true", "error", parseErr)
			}
		}
	}
	if raw, ok := jsonData["schemaCacheTTLSeconds"]; ok && raw != nil {
		switch v := raw.(type) {
		case float64:
			settings.SchemaCacheTTLSeconds = int(v)
		case string:
			if parsed, parseErr := strconv.Atoi(v); parseErr == nil {
				settings.SchemaCacheTTLSeconds = parsed
			} else {
				backend.Logger.Warn("Failed to parse schemaCacheTTLSeconds value, using default", "error", parseErr)
			}
		}
	}
	if settings.SchemaCacheTTLSeconds <= 0 {
		settings.SchemaCacheTTLSeconds = 60
	}

	if raw, ok := jsonData["rowCapacityHint"]; ok && raw != nil {
		switch v := raw.(type) {
		case float64:
			settings.RowCapacityHint = int64(v)
		case string:
			if parsed, parseErr := strconv.ParseInt(v, 10, 64); parseErr == nil {
				settings.RowCapacityHint = parsed
			} else {
				backend.Logger.Warn("Failed to parse rowCapacityHint value, defaulting to 0", "error", parseErr)
			}
		}
	}
	// A negative hint is meaningless; treat it as disabled.
	if settings.RowCapacityHint < 0 {
		settings.RowCapacityHint = 0
	}

	// Set default values
	if strings.TrimSpace(settings.DialTimeout) == "" {
		settings.DialTimeout = "10"
	}
	if strings.TrimSpace(settings.QueryTimeout) == "" {
		settings.QueryTimeout = "60"
	}
	if strings.TrimSpace(settings.ConnMaxLifetime) == "" {
		settings.ConnMaxLifetime = "5"
	}
	if strings.TrimSpace(settings.MaxIdleConns) == "" {
		settings.MaxIdleConns = "25"
	}
	if strings.TrimSpace(settings.MaxOpenConns) == "" {
		settings.MaxOpenConns = "50"
	}

	// Load secure settings
	password, ok := config.DecryptedSecureJSONData["password"]
	if ok {
		settings.Password = password
	}
	tlsCACert, ok := config.DecryptedSecureJSONData["tlsCACert"]
	if ok {
		settings.TlsCACert = tlsCACert
	}
	tlsClientCert, ok := config.DecryptedSecureJSONData["tlsClientCert"]
	if ok {
		settings.TlsClientCert = tlsClientCert
	}
	tlsClientKey, ok := config.DecryptedSecureJSONData["tlsClientKey"]
	if ok {
		settings.TlsClientKey = tlsClientKey
	}

	if settings.Protocol == clickhouse.HTTP.String() {
		settings.HttpHeaders = loadHttpHeaders(jsonData, config.DecryptedSecureJSONData)
	}

	proxyOpts, err := config.ProxyOptionsFromContext(ctx)

	if err == nil && proxyOpts != nil {
		// the sdk expects the timeout to not be a string
		timeout, err := strconv.ParseFloat(settings.DialTimeout, 64)
		if err == nil {
			proxyOpts.Timeouts.Timeout = time.Duration(timeout) * time.Second
		}

		settings.ProxyOptions = proxyOpts
	}

	// This condition can be removed once the minimum supported Grafana version is 11.0.0
	if settings.EnableRowLimit {
		cfg := sdkconfig.GrafanaConfigFromContext(ctx)
		sqlCfg, err := cfg.SQL()
		if err != nil {
			return settings, err
		}

		settings.RowLimit = sqlCfg.RowLimit
	}

	return settings, settings.isValid()
}

// loadHttpHeaders loads secure and plain text headers from the config
func loadHttpHeaders(jsonData map[string]interface{}, secureJsonData map[string]string) map[string]string {
	httpHeaders := make(map[string]string)

	if jsonData["httpHeaders"] != nil {
		httpHeadersRaw := jsonData["httpHeaders"].([]interface{})

		for _, rawHeader := range httpHeadersRaw {
			header, _ := rawHeader.(map[string]interface{})
			headerName, _ := header["name"].(string)
			headerName = strings.TrimSpace(headerName)
			headerValue, _ := header["value"].(string)
			if headerName != "" && headerValue != "" {
				httpHeaders[headerName] = headerValue
			}
		}
	}

	for k, v := range secureJsonData {
		if v != "" && strings.HasPrefix(k, secureHeaderKeyPrefix) {
			headerName := strings.TrimSpace(k[len(secureHeaderKeyPrefix):])
			httpHeaders[headerName] = v
		}
	}

	return httpHeaders
}
