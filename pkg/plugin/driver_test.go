package plugin

import (
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/stretchr/testify/assert"
)

func TestConnect(t *testing.T) {
	t.Skip()
	clickhouse := Clickhouse{}
	t.Run("should not error when valid settings passed", func(t *testing.T) {
		_, err := clickhouse.Connect(backend.DataSourceInstanceSettings{JSONData: []byte(`{ "server": "localhost", "port": 8123 }`), DecryptedSecureJSONData: map[string]string{}})
		assert.Equal(t, nil, err)
	})
}

func TestConnect2(t *testing.T) {
	// t.Skip()
	clickhouse := Clickhouse{}
	t.Run("should not error when valid settings passed", func(t *testing.T) {
		json := `{ "server": "gh-api.clickhouse.com", "port": 9440, "username": "play", "secure": true }`
		secure := map[string]string{}
		// secure["password"] = "play"
		_, err := clickhouse.Connect(backend.DataSourceInstanceSettings{JSONData: []byte(json), DecryptedSecureJSONData: secure})
		assert.Equal(t, nil, err)
	})
}
