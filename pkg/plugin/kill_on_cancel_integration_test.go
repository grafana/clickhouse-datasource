//go:build integration

package plugin

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	clickhouse_sql "github.com/ClickHouse/clickhouse-go/v2"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	sdkconfig "github.com/grafana/grafana-plugin-sdk-go/config"
)

func TestCancelledQueryStopsOnServer(t *testing.T) {
	admin := setupConnection(t, clickhouse_sql.Native, nil)
	t.Cleanup(func() { _ = admin.Close() })

	tests := []struct {
		protocol string
		port     string
	}{
		{protocol: "native", port: getEnv("CLICKHOUSE_PORT", "9000")},
		{protocol: "http", port: getEnv("CLICKHOUSE_HTTP_PORT", "8123")},
	}
	for _, tc := range tests {
		t.Run(tc.protocol, func(t *testing.T) {
			db := connectWithProtocol(t, tc.protocol, tc.port, true)
			marker := fmt.Sprintf("cancel_%s_%d", tc.protocol, time.Now().UnixNano())
			t.Cleanup(func() {
				_, _ = admin.Exec(fmt.Sprintf("KILL QUERY WHERE query LIKE '%%%s%%' AND query NOT LIKE '%%KILL QUERY%%' SYNC", marker))
			})

			ctx, cancel := context.WithCancelCause(context.Background())
			t.Cleanup(func() { cancel(errors.New("test: finished")) })
			queryErr := make(chan error, 1)
			go func() {
				queryErr <- drainQuery(ctx, db, fmt.Sprintf("SELECT sum(sleepEachRow(0.5)) AS %s FROM numbers(120) SETTINGS max_block_size = 1", marker))
			}()

			if !waitForServerQuery(t, admin, marker, true, 10*time.Second) {
				t.Fatalf("%s query did not start on the server within 10s", tc.protocol)
			}
			cause := errors.New("test: client gave up")
			cancel(cause)
			if err := <-queryErr; !errors.Is(err, context.Canceled) && !errors.Is(err, cause) {
				t.Fatalf("query error = %v, want the cancellation", err)
			}
			if !waitForServerQuery(t, admin, marker, false, 5*time.Second) {
				t.Fatalf("%s query still running on the server 5s after its context was cancelled", tc.protocol)
			}
		})
	}
}

func TestConnectWrapsOnlyHTTPConnsWithKillQueryOnCancel(t *testing.T) {
	tests := []struct {
		name              string
		protocol          string
		port              string
		killQueryOnCancel bool
		wantWrapped       bool
	}{
		{name: "native, option off", protocol: "native", port: getEnv("CLICKHOUSE_PORT", "9000")},
		{name: "native, option on", protocol: "native", port: getEnv("CLICKHOUSE_PORT", "9000"), killQueryOnCancel: true},
		{name: "http, option off", protocol: "http", port: getEnv("CLICKHOUSE_HTTP_PORT", "8123")},
		{name: "http, option on", protocol: "http", port: getEnv("CLICKHOUSE_HTTP_PORT", "8123"), killQueryOnCancel: true, wantWrapped: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			conn, err := connectWithProtocol(t, tc.protocol, tc.port, tc.killQueryOnCancel).Conn(context.Background())
			if err != nil {
				t.Fatalf("Conn() error = %v", err)
			}
			t.Cleanup(func() { _ = conn.Close() })

			var wrapped bool
			if err := conn.Raw(func(driverConn any) error {
				_, wrapped = driverConn.(*killOnCancelConn)
				return nil
			}); err != nil {
				t.Fatalf("Raw() error = %v", err)
			}
			if wrapped != tc.wantWrapped {
				t.Errorf("driver conn wrapped for KILL QUERY on cancel = %t, want %t", wrapped, tc.wantWrapped)
			}
		})
	}
}

func connectWithProtocol(t *testing.T, protocol, port string, killQueryOnCancel bool) *sql.DB {
	t.Helper()
	ctx := sdkconfig.WithGrafanaConfig(context.Background(), sdkconfig.NewGrafanaCfg(map[string]string{
		"GF_SQL_MAX_OPEN_CONNS_DEFAULT":            "10",
		"GF_SQL_MAX_IDLE_CONNS_DEFAULT":            "10",
		"GF_SQL_MAX_CONN_LIFETIME_SECONDS_DEFAULT": "60",
	}))
	settings := backend.DataSourceInstanceSettings{
		JSONData: []byte(fmt.Sprintf(`{"host":%q,"port":%s,"username":%q,"protocol":%q,"killQueryOnCancel":%t}`,
			getEnv("CLICKHOUSE_HOST", "localhost"), port, getEnv("CLICKHOUSE_USERNAME", "default"), protocol, killQueryOnCancel)),
		DecryptedSecureJSONData: map[string]string{"password": getEnv("CLICKHOUSE_PASSWORD", "")},
	}
	db, err := (&Clickhouse{}).Connect(ctx, settings, json.RawMessage{})
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func waitForServerQuery(t *testing.T, admin *sql.DB, marker string, wantRunning bool, timeout time.Duration) bool {
	t.Helper()
	query := fmt.Sprintf("SELECT count() FROM system.processes WHERE query LIKE '%%%s%%' AND query NOT LIKE '%%system.processes%%'", marker)
	ctx, cancel := context.WithTimeoutCause(context.Background(), timeout, fmt.Errorf("poll system.processes: no answer within %s", timeout))
	defer cancel()
	for {
		var n uint64
		if err := admin.QueryRowContext(ctx, query).Scan(&n); err != nil {
			if ctx.Err() != nil {
				return false
			}
			t.Fatalf("poll system.processes: %v", err)
		}
		if (n > 0) == wantRunning {
			return true
		}
		select {
		case <-ctx.Done():
			return false
		case <-time.After(100 * time.Millisecond):
		}
	}
}

func drainQuery(ctx context.Context, db *sql.DB, query string) error {
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return err
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
	}
	return rows.Err()
}
