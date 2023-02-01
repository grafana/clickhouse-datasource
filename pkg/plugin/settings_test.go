package plugin

import (
	"errors"
	"fmt"
	"reflect"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
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
				name: "should parse and set all the json fields correctly",
				args: args{
					config: backend.DataSourceInstanceSettings{
						JSONData:                []byte(`{ "server": "foo", "port": 443, "username": "baz", "defaultDatabase":"example", "tlsSkipVerify": true, "tlsAuth" : true, "tlsAuthWithCACert": true, "timeout": "10"}`),
						DecryptedSecureJSONData: map[string]string{"password": "bar", "tlsCACert": "caCert", "tlsClientCert": "clientCert", "tlsClientKey": "clientKey"},
					},
				},
				wantSettings: Settings{
					Server:             "foo",
					Port:               443,
					Username:           "baz",
					DefaultDatabase:    "example",
					InsecureSkipVerify: true,
					TlsClientAuth:      true,
					TlsAuthWithCACert:  true,
					Password:           "bar",
					TlsCACert:          "caCert",
					TlsClientCert:      "clientCert",
					TlsClientKey:       "clientKey",
					Timeout:            "10",
					QueryTimeout:       "60",
				},
				wantErr: nil,
			},
		}
		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				gotSettings, err := LoadSettings(tt.args.config)
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
			{jsonData: `{ "server": "", "port": 443 }`, password: "", wantErr: ErrorMessageInvalidServerName, description: "should capture empty server name"},
			{jsonData: `{ "server": "foo" }`, password: "", wantErr: ErrorMessageInvalidPort, description: "should capture nil port"},
			{jsonData: `  "server": "foo", "port": 443, "username" : "foo" }`, password: "", wantErr: ErrorMessageInvalidJSON, description: "should capture invalid json"},
		}
		for i, tc := range tests {
			t.Run(fmt.Sprintf("[%v/%v] %s", i+1, len(tests), tc.description), func(t *testing.T) {
				_, err := LoadSettings(backend.DataSourceInstanceSettings{
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
