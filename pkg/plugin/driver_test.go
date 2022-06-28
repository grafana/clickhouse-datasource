package plugin

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/stretchr/testify/assert"
	"github.com/testcontainers/testcontainers-go"
)

func TestConnect(t *testing.T) {
	t.Skip()
	clickhouse := Clickhouse{}
	t.Run("should not error when valid settings passed", func(t *testing.T) {
		settings := backend.DataSourceInstanceSettings{JSONData: []byte(`{ "server": "localhost", "port": 8123 }`), DecryptedSecureJSONData: map[string]string{}}
		_, err := clickhouse.Connect(settings, json.RawMessage{})
		assert.Equal(t, nil, err)
	})
}

func TestConnectSecure(t *testing.T) {
	t.Skip()
	clickhouse := Clickhouse{}
	t.Run("should not error when valid settings passed", func(t *testing.T) {
		params := `{ "server": "server", "port": 9440, "username": "foo", "secure": true }`
		secure := map[string]string{}
		settings := backend.DataSourceInstanceSettings{JSONData: []byte(params), DecryptedSecureJSONData: secure}
		_, err := clickhouse.Connect(settings, json.RawMessage{})
		assert.Equal(t, nil, err)
	})
}

func TestContainer(t *testing.T) {
	// create a ClickHouse container
	ctx := context.Background()

	// for now, we test against a hardcoded database-server version but we should make this a property
	req := testcontainers.ContainerRequest{
		Image:        "clickhouse/clickhouse-server:latest",
		ExposedPorts: []string{"9000/tcp"},
		//WaitingFor:   wait.ForLog("Ready for connections"),
	}
	clickhouseContainer, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})
	if err != nil {
		// can't test without container
		panic(err)
	}

	p, _ := clickhouseContainer.MappedPort(ctx, "9000")

	os.Setenv("CLICKHOUSE_DB_PORT", p.Port())
	defer clickhouseContainer.Terminate(ctx) //nolint
	//os.Exit(t.Run())
}
