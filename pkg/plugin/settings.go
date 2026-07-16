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
	Host     string `json:"host,omitempty"`
	Port     int64  `json:"port,omitempty"`
	Protocol string `json:"protocol"`
	Secure   bool   `json:"secure,omitempty"`
	Path     string `json:"path,omitempty"`

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

	// EnforceReadOnly forces readonly=1 on every query executed via this datasource,
	// making it read-only (INSERT/DDL from Grafana will be blocked). It is
	// automatically set to true when any CustomSetting has Enforced=true. Server
	// tunables that operators want users to still adjust per query (e.g. max_threads)
	// should be marked <changeable_in_readonly/> server-side; the enforced tenant
	// settings must NOT be marked that way.
	EnforceReadOnly bool `json:"enforceReadOnly,omitempty"`

	// EnableSchemaCache gates the in-process cache that memoizes
	// system.tables / system.columns / DISTINCT column-value lookups used
	// by the query builder. Defaults to true.
	EnableSchemaCache bool `json:"enableSchemaCache,omitempty"`
	// SchemaCacheTTLSeconds controls how long schema-introspection results
	// are considered fresh. Defaults to 60. Set lower if users commonly run
	// ALTER TABLE and expect the builder to reflect changes immediately.
	SchemaCacheTTLSeconds int `json:"schemaCacheTTLSeconds,omitempty"`
}

type CustomSetting struct {
	Setting  string `json:"setting"`
	Value    string `json:"value"`
	Enforced bool   `json:"enforced,omitempty"`
}

const secureHeaderKeyPrefix = "secureHttpHeaders."

func (settings *Settings) isValid() (err error) {
	if settings.Host == "" {
		return backend.DownstreamError(ErrorMessageInvalidHost)
	}
	if settings.Port == 0 {
		return backend.DownstreamError(ErrorMessageInvalidPort)
	}
	return nil
}

// enforcedSettings returns a clickhouse.Settings map containing only the
// CustomSettings entries marked Enforced. Returns nil if none are enforced.
//
// Values for setting names beginning with "custom_" are wrapped in
// clickhouse.CustomSetting{Value}. That wrapper is required by clickhouse-go's
// Native protocol to send user-defined (custom_*) settings; without it the
// server rejects them with code 115 "Unknown setting". HTTP tolerates plain
// strings via URL params, but the wrapper is also accepted there, so we always
// wrap for consistency across protocols.
func (s Settings) enforcedSettings() clickhouse.Settings {
	var m clickhouse.Settings
	for _, cs := range s.CustomSettings {
		if cs.Enforced {
			if m == nil {
				m = make(clickhouse.Settings)
			}
			m[cs.Setting] = wrapCustomSettingValue(cs.Setting, cs.Value)
		}
	}
	return m
}

// wrapCustomSettingValue wraps values for custom_-prefixed settings in
// clickhouse.CustomSetting so clickhouse-go's Native protocol serializer
// tags them as user-defined rather than as built-in server settings.
func wrapCustomSettingValue(name, value string) interface{} {
	if strings.HasPrefix(name, "custom_") {
		return clickhouse.CustomSetting{Value: value}
	}
	return value
}

// shouldForceReadOnly reports whether readonly=1 must be injected on every
// query. Phase 1 auto-enables EnforceReadOnly when any CustomSetting is
// Enforced, so in practice this is just s.EnforceReadOnly; the len check
// is kept as defense-in-depth.
func (s Settings) shouldForceReadOnly() bool {
	return s.EnforceReadOnly || len(s.enforcedSettings()) > 0
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
		if port, ok := jsonData["port"].(string); ok {
			settings.Port, err = strconv.ParseInt(port, 0, 64)
			if err != nil {
				return settings, backend.DownstreamError(fmt.Errorf("could not parse port value: %w", err))
			}
		} else {
			settings.Port = int64(jsonData["port"].(float64))
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
			cs := CustomSetting{
				Setting: rawMap["setting"].(string),
				Value:   rawMap["value"].(string),
			}
			if rawMap["enforced"] != nil {
				switch v := rawMap["enforced"].(type) {
				case bool:
					cs.Enforced = v
				case string:
					if parsed, parseErr := strconv.ParseBool(v); parseErr == nil {
						cs.Enforced = parsed
					} else {
						backend.Logger.Warn("Failed to parse enforced value for custom setting, defaulting to false", "setting", cs.Setting, "error", parseErr)
					}
				}
			}
			customSettings[i] = cs
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

	if raw, ok := jsonData["enforceReadOnly"]; ok && raw != nil {
		switch v := raw.(type) {
		case bool:
			settings.EnforceReadOnly = v
		case string:
			if parsed, parseErr := strconv.ParseBool(v); parseErr == nil {
				settings.EnforceReadOnly = parsed
			} else {
				backend.Logger.Warn("Failed to parse enforceReadOnly value, defaulting to false", "error", parseErr)
			}
		}
	}

	// If any custom setting is marked enforced, force EnforceReadOnly on.
	if !settings.EnforceReadOnly {
		for _, cs := range settings.CustomSettings {
			if cs.Enforced {
				settings.EnforceReadOnly = true
				backend.Logger.Info("enforceReadOnly implicitly enabled because at least one custom setting is marked enforced")
				break
			}
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
