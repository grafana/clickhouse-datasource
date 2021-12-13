package plugin

import (
	"encoding/json"
	"fmt"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

type ConnectionSettings struct {
	User       string `json:"user"`
	Password   string `json:"password"`
	Path       string `json:"path"`
	Cert       string `json:"cert"`
	PrivateKey string `json:"privateKey"`
	AuthType   string `json:"authType"`
}

func GetSettings(s backend.DataSourceInstanceSettings) (*ConnectionSettings, error) {
	settings := &ConnectionSettings{}
	if err := json.Unmarshal(s.JSONData, settings); err != nil {
		return nil, err
	}

	if val, ok := s.DecryptedSecureJSONData["password"]; ok {
		settings.Password = val
	}
	if val, ok := s.DecryptedSecureJSONData["cert"]; ok {
		settings.Cert = val
	}
	if val, ok := s.DecryptedSecureJSONData["privateKey"]; ok {
		settings.PrivateKey = val
	}

	return settings, nil
}

// Settings - data loaded from grafana settings database
type Settings struct {
	Server             string `json:"server,omitempty"`
	Port               int64  `json:"port,omitempty"`
	Username           string `json:"username,omitempty"`
	DefaultDatabase    string `json:"defaultDatabase,omitempty"`
	InsecureSkipVerify bool   `json:"tlsSkipVerify,omitempty"`
	TlsClientAuth      bool   `json:"tlsClientAuth,omitempty"`
	TlsAuthWithCACert  bool   `json:"tlsAuthWithCACert,omitempty"`
	Password           string `json:"-,omitempty"`
	TlsCACert          string
	TlsClientCert      string
	TlsClientKey       string
	Secure             bool `json:"secure,omitempty"`
}

func (settings *Settings) isValid() (err error) {
	if settings.Server == "" {
		return ErrorMessageInvalidServerName
	}
	if settings.Port == 0 {
		return ErrorMessageInvalidPort
	}
	return nil
}

// LoadSettings will read and validate Settings from the DataSourceConfig
func LoadSettings(config backend.DataSourceInstanceSettings) (settings Settings, err error) {
	if err := json.Unmarshal(config.JSONData, &settings); err != nil {
		return settings, fmt.Errorf("%s: %w", err.Error(), ErrorMessageInvalidJSON)
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
	return settings, settings.isValid()
}
