package plugin

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"testing"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/proxy"
	"github.com/stretchr/testify/assert"
)

func TestLoadSettings(t *testing.T) {
	t.Run("should parse settings correctly", func(t *testing.T) {
		type args struct {
			config backend.DataSourceInstanceSettings
		}
		tests := []struct {
			name         string
			args         args
			wantSettings Settings
			wantErr      error
		}{
			{
				name: "should parse and set all json fields correctly",
				args: args{
					config: backend.DataSourceInstanceSettings{
						UID: "ds-uid",
						JSONData: []byte(`{
							"host": "foo", "port": 443,
							"path": "custom-path", "protocol": "http",
							"username": "baz",
							"defaultDatabase":"example", "tlsSkipVerify": true, "tlsAuth" : true,
							"tlsAuthWithCACert": true, "dialTimeout": "10", "enableSecureSocksProxy": true,
							"httpHeaders": [{ "name": " test-plain-1 ", "value": "value-1", "secure": false }],
							"forwardGrafanaHeaders": true
						}`),
						DecryptedSecureJSONData: map[string]string{
							"password":  "bar",
							"tlsCACert": "caCert", "tlsClientCert": "clientCert", "tlsClientKey": "clientKey",
							"secureSocksProxyPassword":          "test",
							"secureHttpHeaders. test-secure-2 ": "value-2",
							"secureHttpHeaders.test-secure-3":   "value-3",
						},
					},
				},
				wantSettings: Settings{
					Host:               "foo",
					Port:               443,
					Path:               "custom-path",
					Protocol:           clickhouse.HTTP.String(),
					Username:           "baz",
					DefaultDatabase:    "example",
					InsecureSkipVerify: true,
					TlsClientAuth:      true,
					TlsAuthWithCACert:  true,
					Password:           "bar",
					TlsCACert:          "caCert",
					TlsClientCert:      "clientCert",
					TlsClientKey:       "clientKey",
					DialTimeout:        "10",
					QueryTimeout:       "60",
					HttpHeaders: map[string]string{
						"test-plain-1":  "value-1",
						"test-secure-2": "value-2",
						"test-secure-3": "value-3",
					},
					ForwardGrafanaHeaders: true,
					ProxyOptions: &proxy.Options{
						Enabled: true,
						Auth: &proxy.AuthOptions{
							Username: "ds-uid",
							Password: "test",
						},
						Timeouts: &proxy.TimeoutOptions{
							Timeout:   10 * time.Second,
							KeepAlive: proxy.DefaultTimeoutOptions.KeepAlive,
						},
					},
				},
				wantErr: nil,
			},
			{
				name: "should convert string values to the correct type",
				args: args{
					config: backend.DataSourceInstanceSettings{
						JSONData:                []byte(`{"host": "test", "port": "443", "path": "custom-path", "tlsSkipVerify": "true", "tlsAuth" : "true", "tlsAuthWithCACert": "true"}`),
						DecryptedSecureJSONData: map[string]string{},
					},
				},
				wantSettings: Settings{
					Host:               "test",
					Port:               443,
					Path:               "custom-path",
					InsecureSkipVerify: true,
					TlsClientAuth:      true,
					TlsAuthWithCACert:  true,
					DialTimeout:        "10",
					QueryTimeout:       "60",
					ProxyOptions:       nil,
				},
				wantErr: nil,
			},
			{
				name: "should parse v3 config fields into new fields",
				args: args{
					config: backend.DataSourceInstanceSettings{
						JSONData:                []byte(`{"server": "test", "port": 443, "timeout": "10"}`),
						DecryptedSecureJSONData: map[string]string{},
					},
				},
				wantSettings: Settings{
					Host:         "test",
					Port:         443,
					DialTimeout:  "10",
					QueryTimeout: "60",
				},
				wantErr: nil,
			},
		}
		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				gotSettings, err := LoadSettings(context.Background(), tt.args.config)
				assert.Equal(t, tt.wantErr, err)
				if !reflect.DeepEqual(gotSettings, tt.wantSettings) {
					t.Errorf("LoadSettings() = %v, want %v", gotSettings, tt.wantSettings)
				}
			})
		}
	})
	t.Run("should capture invalid settings", func(t *testing.T) {
		tests := []struct {
			jsonData    string
			password    string
			wantErr     error
			description string
		}{
			{jsonData: `{ "host": "", "port": 443 }`, password: "", wantErr: ErrorMessageInvalidHost, description: "should capture empty server name"},
			{jsonData: `{ "host": "foo" }`, password: "", wantErr: ErrorMessageInvalidPort, description: "should capture nil port"},
			{jsonData: `  "host": "foo", "port": 443, "username" : "foo" }`, password: "", wantErr: ErrorMessageInvalidJSON, description: "should capture invalid json"},
		}
		for i, tc := range tests {
			t.Run(fmt.Sprintf("[%v/%v] %s", i+1, len(tests), tc.description), func(t *testing.T) {
				_, err := LoadSettings(context.Background(), backend.DataSourceInstanceSettings{
					JSONData:                []byte(tc.jsonData),
					DecryptedSecureJSONData: map[string]string{"password": tc.password},
				})
				if !errors.Is(err, tc.wantErr) {
					t.Errorf("%s not captured. %s", tc.wantErr, err.Error())
				}
			})
		}
	})
}
