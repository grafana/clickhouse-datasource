package plugin

import (
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func TestNewSQLDatasourceConnectionCache(t *testing.T) {
	tests := []struct {
		name      string
		jsonData  string
		wantCache bool
	}{
		{name: "no header forwarding", jsonData: `{"host":"h","port":9000}`},
		{name: "forwarded Grafana headers", jsonData: `{"host":"h","port":8123,"protocol":"http","forwardGrafanaHeaders":true}`, wantCache: true},
		{name: "OAuth pass-through", jsonData: `{"host":"h","port":9440,"oauthPassThru":true}`, wantCache: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ds := newSQLDatasource(t.Context(), backend.DataSourceInstanceSettings{
				JSONData:                []byte(tc.jsonData),
				DecryptedSecureJSONData: map[string]string{},
			})

			if ds.EnableMultipleConnections != tc.wantCache {
				t.Errorf("EnableMultipleConnections = %v, want %v", ds.EnableMultipleConnections, tc.wantCache)
			}
			if got := ds.ConnectionCacheFactory != nil; got != tc.wantCache {
				t.Fatalf("ConnectionCacheFactory set = %v, want %v", got, tc.wantCache)
			}
			if tc.wantCache {
				ds.ConnectionCacheFactory().Dispose()
			}
		})
	}
}
