package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
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

	ConnMaxLifetime int `json:"connMaxLifetime"`
	DialTimeout     int `json:"dialTimeout"`
	QueryTimeout    int `json:"queryTimeout"`
	MaxIdleConns    int `json:"maxIdleConns"`
	MaxOpenConns    int `json:"maxOpenConns"`

	HttpHeaders           map[string]string `json:"-"`
	ForwardGrafanaHeaders bool              `json:"forwardGrafanaHeaders,omitempty"`
	OAuthPassThru         bool              `json:"oauthPassThru,omitempty"`
	// OAuthPassThruAllowFallback controls what happens when Forward OAuth
	// Identity is enabled but a data query arrives without a forwarded user
	// token (for example, alert rule evaluation, which runs outside a user
	// session). When false (the default) such queries are rejected; when true
	// they fall back to the configured username/password (service account).
	// Health checks and schema introspection always fall back regardless of
	// this setting, since no user token is ever available for them.
	OAuthPassThruAllowFallback bool `json:"oauthPassThruAllowFallback,omitempty"`
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
	// memory. Values above maxRowCapacityHint are clamped.
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

type CustomSetting struct {
	Setting string `json:"setting"`
	Value   string `json:"value"`
}

const secureHeaderKeyPrefix = "secureHttpHeaders."

// maxRowCapacityHint bounds the rowCapacityHint datasource option. The hint
// sets the capacity of every column's backing slice before any row is
// scanned, so an arbitrarily large value would allocate that much memory per
// column up front. 1,000,000 matches Grafana's default dataproxy.row_limit,
// past which results are truncated anyway.
const maxRowCapacityHint = 1_000_000

func (settings *Settings) isValid() (err error) {
	if settings.Host == "" {
		return backend.DownstreamError(ErrorMessageInvalidHost)
	}
	if settings.Port == 0 {
		return backend.DownstreamError(ErrorMessageInvalidPort)
	}
	return nil
}

// LoadSettings will read and validate Settings from the DataSourceConfig
func LoadSettings(ctx context.Context, config backend.DataSourceInstanceSettings) (settings Settings, err error) {
	var jsonData map[string]interface{}
	if err := json.Unmarshal(config.JSONData, &jsonData); err != nil {
		return settings, fmt.Errorf("%s: %w", err.Error(), ErrorMessageInvalidJSON)
	}

	// Deprecated: Replaced with Host for v4. Deserializes "server" field for old v3 configs.
	if jsonData["server"] != nil {
		server, err := stringSetting(jsonData, "server")
		if err != nil {
			return settings, err
		}
		settings.Host = strings.TrimSpace(server)
	}
	if jsonData["host"] != nil {
		host, err := stringSetting(jsonData, "host")
		if err != nil {
			return settings, err
		}
		settings.Host = strings.TrimSpace(host)
	}

	if jsonData["port"] != nil {
		if port, ok := jsonData["port"].(string); ok {
			settings.Port, err = strconv.ParseInt(port, 0, 64)
			if err != nil {
				return settings, backend.DownstreamError(fmt.Errorf("could not parse port value: %w", err))
			}
		} else if port, ok := jsonData["port"].(float64); ok {
			settings.Port = int64(port)
		} else {
			return settings, backend.DownstreamError(fmt.Errorf("could not parse port value: unexpected type %T", jsonData["port"]))
		}
	}
	if settings.Protocol, err = stringSetting(jsonData, "protocol"); err != nil {
		return settings, err
	}
	if settings.Secure, err = boolSetting(jsonData, "secure"); err != nil {
		return settings, err
	}
	if settings.Path, err = stringSetting(jsonData, "path"); err != nil {
		return settings, err
	}

	if settings.InsecureSkipVerify, err = boolSetting(jsonData, "tlsSkipVerify"); err != nil {
		return settings, err
	}
	if settings.TlsClientAuth, err = boolSetting(jsonData, "tlsAuth"); err != nil {
		return settings, err
	}
	if settings.TlsAuthWithCACert, err = boolSetting(jsonData, "tlsAuthWithCACert"); err != nil {
		return settings, err
	}

	if settings.Username, err = stringSetting(jsonData, "username"); err != nil {
		return settings, err
	}
	if settings.DefaultDatabase, err = stringSetting(jsonData, "defaultDatabase"); err != nil {
		return settings, err
	}

	// Deprecated: Replaced with DialTimeout for v4. Deserializes "timeout" field for old v3 configs.
	legacyTimeout, err := intSetting(jsonData, "timeout", 10)
	if err != nil {
		return settings, err
	}
	if settings.DialTimeout, err = intSetting(jsonData, "dialTimeout", legacyTimeout); err != nil {
		return settings, err
	}
	if settings.QueryTimeout, err = intSetting(jsonData, "queryTimeout", 60); err != nil {
		return settings, err
	}
	// A dial timeout of zero or less would expire the connect context before
	// the first dial, failing every query with a confusing "cancelled before
	// starting" error, so fall back to the default instead.
	if settings.DialTimeout <= 0 {
		settings.DialTimeout = 10
	}
	// Zero means "no timeout" for queries, but a negative value would cancel
	// every query immediately.
	if settings.QueryTimeout < 0 {
		settings.QueryTimeout = 60
	}
	if settings.ConnMaxLifetime, err = intSetting(jsonData, "connMaxLifetime", 5); err != nil {
		return settings, err
	}
	if settings.MaxIdleConns, err = intSetting(jsonData, "maxIdleConns", 25); err != nil {
		return settings, err
	}
	if settings.MaxOpenConns, err = intSetting(jsonData, "maxOpenConns", 50); err != nil {
		return settings, err
	}
	if settings.CustomSettings, err = customSettingsSetting(jsonData); err != nil {
		return settings, err
	}
	if settings.ForwardGrafanaHeaders, err = boolSetting(jsonData, "forwardGrafanaHeaders"); err != nil {
		return settings, err
	}

	if settings.OAuthPassThru, err = boolSetting(jsonData, "oauthPassThru"); err != nil {
		return settings, err
	}

	if settings.OAuthPassThruAllowFallback, err = boolSetting(jsonData, "oauthPassThruAllowFallback"); err != nil {
		return settings, err
	}

	if jsonData["enableRowLimit"] != nil {
		if enableRowLimitString, ok := jsonData["enableRowLimit"].(string); ok {
			settings.EnableRowLimit, err = strconv.ParseBool(enableRowLimitString)
			if err != nil {
				backend.Logger.Warn("Failed to parse enableRowLimit value, defaulting to false", "error", err)
			}
		} else if enableRowLimit, ok := jsonData["enableRowLimit"].(bool); ok {
			settings.EnableRowLimit = enableRowLimit
		} else {
			backend.Logger.Warn("Failed to parse enableRowLimit value, defaulting to false", "type", fmt.Sprintf("%T", jsonData["enableRowLimit"]))
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
	if settings.RowCapacityHint > maxRowCapacityHint {
		settings.RowCapacityHint = maxRowCapacityHint
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
		proxyOpts.Timeouts.Timeout = time.Duration(settings.DialTimeout) * time.Second
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

	if httpHeadersRaw, ok := jsonData["httpHeaders"].([]interface{}); ok {

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

// stringSetting reads a string jsonData key and returns "" when the key is
// absent. Any other JSON type is a downstream error rather than a panic, so a
// hand-written provisioning file cannot crash the plugin.
func stringSetting(jsonData map[string]interface{}, key string) (string, error) {
	switch v := jsonData[key].(type) {
	case nil:
		return "", nil
	case string:
		return v, nil
	default:
		return "", backend.DownstreamError(fmt.Errorf("could not parse %s value: expected a string, got %T", key, v))
	}
}

// boolSetting reads a jsonData key given as a JSON boolean or a boolean
// string, and returns false when the key is absent.
func boolSetting(jsonData map[string]interface{}, key string) (bool, error) {
	switch v := jsonData[key].(type) {
	case nil:
		return false, nil
	case bool:
		return v, nil
	case string:
		parsed, err := strconv.ParseBool(v)
		if err != nil {
			return false, backend.DownstreamError(fmt.Errorf("could not parse %s value: %w", key, err))
		}
		return parsed, nil
	default:
		return false, backend.DownstreamError(fmt.Errorf("could not parse %s value: unexpected type %T", key, v))
	}
}

// customSettingsSetting reads the customSettings list. Provisioning YAML
// commonly writes numeric or boolean values unquoted (value: 4), so scalar
// values are accepted and rendered as the string ClickHouse expects.
func customSettingsSetting(jsonData map[string]interface{}) ([]CustomSetting, error) {
	if jsonData["customSettings"] == nil {
		return nil, nil
	}
	raw, ok := jsonData["customSettings"].([]interface{})
	if !ok {
		return nil, backend.DownstreamError(fmt.Errorf("could not parse customSettings value: expected a list, got %T", jsonData["customSettings"]))
	}
	customSettings := make([]CustomSetting, 0, len(raw))
	for i, item := range raw {
		itemMap, ok := item.(map[string]interface{})
		if !ok {
			return nil, backend.DownstreamError(fmt.Errorf("could not parse customSettings[%d]: expected an object, got %T", i, item))
		}
		name, ok := itemMap["setting"].(string)
		if !ok || strings.TrimSpace(name) == "" {
			return nil, backend.DownstreamError(fmt.Errorf("could not parse customSettings[%d]: setting must be a non-empty string", i))
		}
		var value string
		switch v := itemMap["value"].(type) {
		case string:
			value = v
		case float64:
			value = strconv.FormatFloat(v, 'f', -1, 64)
		case bool:
			value = strconv.FormatBool(v)
		default:
			return nil, backend.DownstreamError(fmt.Errorf("could not parse customSettings[%d] (%s): value must be a string, number or boolean, got %T", i, name, v))
		}
		customSettings = append(customSettings, CustomSetting{Setting: name, Value: value})
	}
	return customSettings, nil
}

// intSetting reads a whole-number jsonData key, given as a JSON number or a
// numeric string, and returns def when the key is absent or empty.
func intSetting(jsonData map[string]interface{}, key string, def int) (int, error) {
	switch v := jsonData[key].(type) {
	case nil:
		return def, nil
	case float64:
		if v != math.Trunc(v) {
			return 0, backend.DownstreamError(fmt.Errorf("could not parse %s value: %v is not a whole number", key, v))
		}
		if v > math.MaxInt32 || v < math.MinInt32 {
			return 0, backend.DownstreamError(fmt.Errorf("could not parse %s value: %v is out of range", key, v))
		}
		return int(v), nil
	case string:
		v = strings.TrimSpace(v)
		if v == "" {
			return def, nil
		}
		parsed, err := strconv.ParseInt(v, 10, 32)
		if err != nil {
			return 0, backend.DownstreamError(fmt.Errorf("could not parse %s value: %w", key, err))
		}
		return int(parsed), nil
	default:
		return 0, backend.DownstreamError(fmt.Errorf("could not parse %s value: unexpected type %T", key, v))
	}
}
