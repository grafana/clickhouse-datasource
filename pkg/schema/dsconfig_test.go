package schema_test

import (
	_ "embed"
	"testing"

	"github.com/grafana/clickhouse-datasource/pkg/schema/models"
	"github.com/grafana/dsconfig/schema"
)

//go:embed dsconfig.json
var configSchemaJSON []byte

//go:generate go test -run TestPlugin -generateArtifacts
func TestPlugin(t *testing.T) {
	schema.RunPluginTests(t, schema.PluginUnderTest{
		ID:                "grafana-clickhouse-datasource",
		ConfigSchemaJSON:  configSchemaJSON,
		SettingsJSONModel: models.ClickHouseSettingsJSON{},
		SecureKeys:        []string{"password", "tlsCACert", "tlsClientCert", "tlsClientKey"},
	})
}