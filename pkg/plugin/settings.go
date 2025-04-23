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
	Password string `json:"-,omitempty"`

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

	RowLimit int64 `json:"rowLimit,omitempty"`
}

type CustomSetting struct {
	Setting string `json:"setting"`
	Value   string `json:"value"`
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

// LoadSettings will read and validate Settings from the DataSourceConfig
func LoadSettings(ctx context.Context, config backend.DataSourceInstanceSettings) (settings Settings, err error) {
	var jsonData map[string]interface{}
	if err := json.Unmarshal(config.JSONData, &jsonData); err != nil {
		return settings, fmt.Errorf("%s: %w", err.Error(), ErrorMessageInvalidJSON)
	}

	// Deprecated: Replaced with Host for v4. Deserializes "server" field for old v3 configs.
	if jsonData["server"] != nil {
		settings.Host = jsonData["server"].(string)
	}
	if jsonData["host"] != nil {
		settings.Host = jsonData["host"].(string)
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
		settings.DialTimeout = jsonData["timeout"].(string)
	}
	if jsonData["dialTimeout"] != nil {
		settings.DialTimeout = jsonData["dialTimeout"].(string)
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

	cfg := backend.GrafanaConfigFromContext(ctx)
	sqlCfg, err := cfg.SQL()
	if err != nil {
		return settings, err
	}

	settings.RowLimit = sqlCfg.RowLimit

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
