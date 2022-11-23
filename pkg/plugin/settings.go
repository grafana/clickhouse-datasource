package plugin

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

type sInt64 int64

func (st *sInt64) UnmarshalJSON(b []byte) error {
	var item interface{}
	if err := json.Unmarshal(b, &item); err != nil {
		return err
	}
	switch v := item.(type) {
	case int:
		*st = sInt64(v)
	case float64:
		*st = sInt64(int(v))
	case string:
		i, err := strconv.Atoi(v)
		if err != nil {
			return err

		}
		*st = sInt64(i)

	}
	return nil
}

// Settings - data loaded from grafana settings database
type Settings struct {
	Server             string `json:"server,omitempty"`
	Port               sInt64 `json:"port,omitempty"`
	Username           string `json:"username,omitempty"`
	DefaultDatabase    string `json:"defaultDatabase,omitempty"`
	InsecureSkipVerify bool   `json:"tlsSkipVerify,omitempty"`
	TlsClientAuth      bool   `json:"tlsAuth,omitempty"`
	TlsAuthWithCACert  bool   `json:"tlsAuthWithCACert,omitempty"`
	Password           string `json:"-,omitempty"`
	TlsCACert          string
	TlsClientCert      string
	TlsClientKey       string
	Secure             bool   `json:"secure,omitempty"`
	Timeout            string `json:"timeout,omitempty"`
	QueryTimeout       string `json:"queryTimeout,omitempty"`
	Protocol           string `json:"protocol"`
}

func (settings *Settings) isValid() (err error) {
	if settings.Server == "" {
		return ErrorMessageInvalidServerName
	}
	if settings.Port == 0 {
		return ErrorMessageInvalidPort
	}
	if settings.Protocol != "http" && settings.Protocol != "native" {
		return ErrorMessageInvalidProtocol
	}
	return nil
}

// LoadSettings will read and validate Settings from the DataSourceConfig
func LoadSettings(config backend.DataSourceInstanceSettings) (settings Settings, err error) {
	if err := json.Unmarshal(config.JSONData, &settings); err != nil {
		return settings, fmt.Errorf("%s: %w", err.Error(), ErrorMessageInvalidJSON)
	}
	if strings.TrimSpace(settings.Timeout) == "" {
		settings.Timeout = "10"
	}
	if strings.TrimSpace(settings.QueryTimeout) == "" {
		settings.QueryTimeout = "60"
	}
	val, ok := config.DecryptedSecureJSONData["password"]
	if !ok {
		return settings, settings.isValid()
	}
	settings.Password = val
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
	if settings.Protocol == "" {
		settings.Protocol = "native"
	}
	return settings, settings.isValid()
}
