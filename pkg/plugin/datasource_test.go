package plugin

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"sync"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
	"github.com/grafana/sqlds/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// unusedConnector backs the *sql.DB a recordingDriver returns for the default
// connection. sql.OpenDB never dials, and the tests never query it.
type unusedConnector struct{}

func (unusedConnector) Connect(context.Context) (driver.Conn, error) {
	return nil, errors.New("not used")
}
func (unusedConnector) Driver() driver.Driver { return nil }

// recordingDriver is a sqlds.Driver that records the connection args sqlds
// passes when it opens a per-header connection.
type recordingDriver struct {
	mu       sync.Mutex
	messages []json.RawMessage
}

func (d *recordingDriver) Connect(_ context.Context, _ backend.DataSourceInstanceSettings, message json.RawMessage) (*sql.DB, error) {
	if message == nil {
		return sql.OpenDB(unusedConnector{}), nil
	}
	d.mu.Lock()
	d.messages = append(d.messages, message)
	d.mu.Unlock()
	return nil, errors.New("recorded")
}

func (d *recordingDriver) Settings(context.Context, backend.DataSourceInstanceSettings) sqlds.DriverSettings {
	return sqlds.DriverSettings{ForwardHeaders: true}
}
func (d *recordingDriver) Macros() sqlds.Macros            { return sqlds.Macros{} }
func (d *recordingDriver) Converters() []sqlutil.Converter { return nil }

func TestDatasourceQueryDataForwardsGrafanaUser(t *testing.T) {
	ctx := backend.WithUser(t.Context(), &backend.User{Login: "alice"})
	settings := backend.DataSourceInstanceSettings{
		UID:      "ds",
		JSONData: []byte(`{"host": "localhost", "port": 9000, "forwardGrafanaHeaders": true}`),
	}

	drv := &recordingDriver{}
	inner := sqlds.NewDatasource(drv)
	inner.EnableMultipleConnections = true
	instance, err := inner.NewDatasource(ctx, settings)
	require.NoError(t, err)
	ds := &Datasource{SQLDatasource: instance.(*sqlds.SQLDatasource)}

	_, err = ds.QueryData(ctx, &backend.QueryDataRequest{
		PluginContext: backend.PluginContext{DataSourceInstanceSettings: &settings},
		Headers:       map[string]string{"http_X-Dashboard-Uid": "dash"},
		Queries:       []backend.DataQuery{{RefID: "A", JSON: []byte(`{"rawSql": "SELECT 1"}`)}},
	})
	require.NoError(t, err)

	require.Len(t, drv.messages, 1)
	headers, err := extractForwardedHeadersFromMessage(drv.messages[0])
	require.NoError(t, err)
	assert.Equal(t, "alice", headers["X-Grafana-User"], "the injected header must reach the ClickHouse connection")
}
