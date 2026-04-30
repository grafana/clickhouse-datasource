package plugin

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"io"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// trackingConnector hands out *sql.DBs and records them so tests can assert
// each one was closed (OpenConnections == 0) after the call returned.
type trackingConnector struct {
	mu       sync.Mutex
	opened   []*sql.DB
	connErr  error                                 // injected error from Connect
	rowsFn   func(query string) (driver.Rows, error) // injected Query handler
	connects atomic.Int32
}

func (t *trackingConnector) Connect(_ context.Context, _ backend.DataSourceInstanceSettings, _ json.RawMessage) (*sql.DB, error) {
	t.connects.Add(1)
	if t.connErr != nil {
		return nil, t.connErr
	}
	db := sql.OpenDB(&fakeDriverConnector{rowsFn: t.rowsFn})
	t.mu.Lock()
	t.opened = append(t.opened, db)
	t.mu.Unlock()
	return db, nil
}

// allClosed: zero open conns on a fresh pool ⇒ DB.Close() ran.
func (t *trackingConnector) allClosed() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	for _, db := range t.opened {
		if db.Stats().OpenConnections != 0 {
			return false
		}
	}
	return true
}

func (t *trackingConnector) openedCount() int {
	t.mu.Lock()
	defer t.mu.Unlock()
	return len(t.opened)
}

// Minimal driver/connector implementing only what schema.go touches.

type fakeDriverConnector struct {
	rowsFn func(query string) (driver.Rows, error)
}

func (c *fakeDriverConnector) Connect(context.Context) (driver.Conn, error) {
	return &fakeConn{rowsFn: c.rowsFn}, nil
}
func (c *fakeDriverConnector) Driver() driver.Driver { return fakeDriver{} }

type fakeDriver struct{}

func (fakeDriver) Open(string) (driver.Conn, error) { return nil, errors.New("unused") }

type fakeConn struct {
	rowsFn func(query string) (driver.Rows, error)
}

func (c *fakeConn) Prepare(string) (driver.Stmt, error) { return nil, errors.New("not implemented") }
func (c *fakeConn) Close() error                        { return nil }
func (c *fakeConn) Begin() (driver.Tx, error)           { return nil, errors.New("not implemented") }

// QueryerContext lets database/sql skip Prepare.
func (c *fakeConn) QueryContext(_ context.Context, query string, _ []driver.NamedValue) (driver.Rows, error) {
	return c.rowsFn(query)
}

type fakeRows struct {
	cols []string
	data [][]driver.Value
	idx  int
}

func (r *fakeRows) Columns() []string { return r.cols }
func (r *fakeRows) Close() error      { return nil }
func (r *fakeRows) Next(dest []driver.Value) error {
	if r.idx >= len(r.data) {
		return io.EOF
	}
	row := r.data[r.idx]
	for i := range dest {
		dest[i] = row[i]
	}
	r.idx++
	return nil
}

func newProvider(t *testing.T, conn *trackingConnector) *SchemaProvider {
	t.Helper()
	return &SchemaProvider{
		clickhousePlugin: conn,
		settings:         backend.DataSourceInstanceSettings{},
	}
}

func tablesRows() (driver.Rows, error) {
	return &fakeRows{
		cols: []string{"database", "name"},
		data: [][]driver.Value{
			{"default", "users"},
			{"default", "events"},
			{"system", "tables"}, // skipped by schema.go
		},
	}, nil
}

func columnsRows() (driver.Rows, error) {
	return &fakeRows{
		cols: []string{"database", "table", "name", "type", "comment"},
		data: [][]driver.Value{
			{"default", "users", "id", "UInt64", ""},
			{"default", "users", "name", "String", "user display name"},
		},
	}, nil
}

func describeRows() (driver.Rows, error) {
	return &fakeRows{
		cols: []string{"name", "type", "default_type", "default_expression", "comment", "codec_expression", "ttl_expression"},
		data: [][]driver.Value{
			{"id", "UInt64", "", "", "", "", ""},
			{"name", "String", "", "", "", "", ""},
		},
	}, nil
}

func TestFetchTables_ClosesDB_OnSuccess(t *testing.T) {
	conn := &trackingConnector{rowsFn: func(string) (driver.Rows, error) { return tablesRows() }}
	p := newProvider(t, conn)

	tables, err := p.fetchTables(context.Background())
	if err != nil {
		t.Fatalf("fetchTables: %v", err)
	}
	if want := []string{"default.users", "default.events"}; !equalStrings(tables, want) {
		t.Errorf("tables = %v, want %v", tables, want)
	}
	if conn.openedCount() != 1 {
		t.Errorf("opened DBs = %d, want 1", conn.openedCount())
	}
	if !conn.allClosed() {
		t.Errorf("DB was not closed after fetchTables; OpenConnections != 0")
	}
}

func TestFetchTables_ClosesDB_OnQueryError(t *testing.T) {
	conn := &trackingConnector{rowsFn: func(string) (driver.Rows, error) {
		return nil, errors.New("query failed")
	}}
	p := newProvider(t, conn)

	if _, err := p.fetchTables(context.Background()); err == nil {
		t.Fatal("fetchTables: expected error, got nil")
	}
	if !conn.allClosed() {
		t.Errorf("DB was not closed after query error; leak in error path")
	}
}

func TestFetchTables_ConnectError_NoDBToClose(t *testing.T) {
	conn := &trackingConnector{connErr: errors.New("connect failed")}
	p := newProvider(t, conn)

	if _, err := p.fetchTables(context.Background()); err == nil {
		t.Fatal("fetchTables: expected connect error, got nil")
	}
	if got := conn.openedCount(); got != 0 {
		t.Errorf("opened DBs = %d, want 0 (no DB on connect failure)", got)
	}
}

func TestFetchColumnsForAllTables_ClosesDB_OnSuccess(t *testing.T) {
	conn := &trackingConnector{rowsFn: func(string) (driver.Rows, error) { return columnsRows() }}
	p := newProvider(t, conn)

	cols, err := p.fetchColumnsForAllTables(context.Background(), []string{"default.users"}, nil)
	if err != nil {
		t.Fatalf("fetchColumnsForAllTables: %v", err)
	}
	if got := len(cols["default.users"]); got != 2 {
		t.Errorf("default.users columns = %d, want 2", got)
	}
	if !conn.allClosed() {
		t.Error("DB was not closed after fetchColumnsForAllTables")
	}
}

func TestFetchColumnsForAllTables_ClosesDB_OnQueryError(t *testing.T) {
	conn := &trackingConnector{rowsFn: func(string) (driver.Rows, error) {
		return nil, errors.New("query failed")
	}}
	p := newProvider(t, conn)

	if _, err := p.fetchColumnsForAllTables(context.Background(), []string{"default.users"}, nil); err == nil {
		t.Fatal("expected error, got nil")
	}
	if !conn.allClosed() {
		t.Error("DB was not closed after query error")
	}
}

func TestFetchColumnsForTable_ClosesDB_OnSuccess(t *testing.T) {
	conn := &trackingConnector{rowsFn: func(string) (driver.Rows, error) { return describeRows() }}
	p := newProvider(t, conn)

	cols, err := p.fetchColumnsForTable(context.Background(), "default.users", nil)
	if err != nil {
		t.Fatalf("fetchColumnsForTable: %v", err)
	}
	if len(cols) != 2 {
		t.Errorf("columns = %d, want 2", len(cols))
	}
	if !conn.allClosed() {
		t.Error("DB was not closed after fetchColumnsForTable")
	}
}

func TestFetchColumnsForTable_ClosesDB_OnQueryError(t *testing.T) {
	conn := &trackingConnector{rowsFn: func(string) (driver.Rows, error) {
		return nil, errors.New("query failed")
	}}
	p := newProvider(t, conn)

	if _, err := p.fetchColumnsForTable(context.Background(), "default.users", nil); err == nil {
		t.Fatal("expected error, got nil")
	}
	if !conn.allClosed() {
		t.Error("DB was not closed after query error")
	}
}

// Run with -race; catches any sync issue around the new close defers.
func TestSchema_Concurrent_NoRace(t *testing.T) {
	conn := &trackingConnector{rowsFn: func(query string) (driver.Rows, error) {
		switch {
		case containsAny(query, "system.tables"):
			return tablesRows()
		case containsAny(query, "system.columns"):
			return columnsRows()
		case containsAny(query, "DESCRIBE"):
			return describeRows()
		}
		return &fakeRows{cols: []string{"x"}, data: [][]driver.Value{{int64(1)}}}, nil
	}}
	p := newProvider(t, conn)

	const goroutines = 16
	const iterations = 25
	var wg sync.WaitGroup
	wg.Add(goroutines)
	for range goroutines {
		go func() {
			defer wg.Done()
			for range iterations {
				if _, err := p.fetchTables(context.Background()); err != nil {
					t.Errorf("fetchTables: %v", err)
					return
				}
				if _, err := p.fetchColumnsForAllTables(context.Background(), []string{"default.users"}, nil); err != nil {
					t.Errorf("fetchColumnsForAllTables: %v", err)
					return
				}
				if _, err := p.fetchColumnsForTable(context.Background(), "default.users", nil); err != nil {
					t.Errorf("fetchColumnsForTable: %v", err)
					return
				}
			}
		}()
	}
	wg.Wait()

	if !conn.allClosed() {
		t.Errorf("after %d concurrent calls, %d DBs still hold connections",
			goroutines*iterations*3, leakedCount(conn))
	}
}

func leakedCount(c *trackingConnector) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	leaked := 0
	for _, db := range c.opened {
		if db.Stats().OpenConnections != 0 {
			leaked++
		}
	}
	return leaked
}

func containsAny(s string, sub string) bool {
	return len(s) >= len(sub) && indexOf(s, sub) >= 0
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
