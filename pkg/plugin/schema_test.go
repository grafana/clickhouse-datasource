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
// reuse (one DB across calls) and Close behavior at end-of-life.
type trackingConnector struct {
	mu       sync.Mutex
	opened   []*sql.DB
	connErr  error                                   // injected error from Connect
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

// allClosed: zero open conns on every handed-out pool ⇒ DB.Close() ran.
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

// --- success paths still return correct data ---

func TestFetchTables_Success(t *testing.T) {
	conn := &trackingConnector{rowsFn: func(string) (driver.Rows, error) { return tablesRows() }}
	p := newProvider(t, conn)

	tables, err := p.fetchTables(context.Background())
	if err != nil {
		t.Fatalf("fetchTables: %v", err)
	}
	if want := []string{"default.users", "default.events"}; !equalStrings(tables, want) {
		t.Errorf("tables = %v, want %v", tables, want)
	}
}

func TestFetchColumnsForAllTables_Success(t *testing.T) {
	conn := &trackingConnector{rowsFn: func(string) (driver.Rows, error) { return columnsRows() }}
	p := newProvider(t, conn)

	cols, err := p.fetchColumnsForAllTables(context.Background(), []string{"default.users"}, nil)
	if err != nil {
		t.Fatalf("fetchColumnsForAllTables: %v", err)
	}
	if got := len(cols["default.users"]); got != 2 {
		t.Errorf("default.users columns = %d, want 2", got)
	}
}

func TestFetchColumnsForTable_Success(t *testing.T) {
	conn := &trackingConnector{rowsFn: func(string) (driver.Rows, error) { return describeRows() }}
	p := newProvider(t, conn)

	cols, err := p.fetchColumnsForTable(context.Background(), "default.users", nil)
	if err != nil {
		t.Fatalf("fetchColumnsForTable: %v", err)
	}
	if len(cols) != 2 {
		t.Errorf("columns = %d, want 2", len(cols))
	}
}

// --- query-error paths still surface the error and don't cache it ---

func TestFetchTables_QueryErrorIsReturned(t *testing.T) {
	conn := &trackingConnector{rowsFn: func(string) (driver.Rows, error) {
		return nil, errors.New("query failed")
	}}
	p := newProvider(t, conn)

	if _, err := p.fetchTables(context.Background()); err == nil {
		t.Fatal("fetchTables: expected error, got nil")
	}
}

func TestFetchColumnsForAllTables_QueryErrorIsReturned(t *testing.T) {
	conn := &trackingConnector{rowsFn: func(string) (driver.Rows, error) {
		return nil, errors.New("query failed")
	}}
	p := newProvider(t, conn)

	if _, err := p.fetchColumnsForAllTables(context.Background(), []string{"default.users"}, nil); err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestFetchColumnsForTable_QueryErrorIsReturned(t *testing.T) {
	conn := &trackingConnector{rowsFn: func(string) (driver.Rows, error) {
		return nil, errors.New("query failed")
	}}
	p := newProvider(t, conn)

	if _, err := p.fetchColumnsForTable(context.Background(), "default.users", nil); err == nil {
		t.Fatal("expected error, got nil")
	}
}

// --- held-DB lifecycle ---

func TestGetDB_ReusedAcrossCalls(t *testing.T) {
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

	if _, err := p.fetchTables(context.Background()); err != nil {
		t.Fatalf("fetchTables: %v", err)
	}
	if _, err := p.fetchColumnsForAllTables(context.Background(), []string{"default.users"}, nil); err != nil {
		t.Fatalf("fetchColumnsForAllTables: %v", err)
	}
	if _, err := p.fetchColumnsForTable(context.Background(), "default.users", nil); err != nil {
		t.Fatalf("fetchColumnsForTable: %v", err)
	}

	if got := conn.openedCount(); got != 1 {
		t.Errorf("opened DBs = %d, want 1 (held DB should be reused)", got)
	}
	if got := conn.connects.Load(); got != 1 {
		t.Errorf("Connect calls = %d, want 1", got)
	}
}

func TestGetDB_ConnectErrorNotCached(t *testing.T) {
	rows := func(string) (driver.Rows, error) { return tablesRows() }
	conn := &trackingConnector{rowsFn: rows, connErr: errors.New("transient")}
	p := newProvider(t, conn)

	// First call fails because Connect errors.
	if _, err := p.fetchTables(context.Background()); err == nil {
		t.Fatal("expected connect error, got nil")
	}

	// Recover from the transient error and retry; the provider must call
	// Connect again (no sticky cached error).
	conn.connErr = nil
	if _, err := p.fetchTables(context.Background()); err != nil {
		t.Fatalf("retry: %v", err)
	}
	if got := conn.connects.Load(); got != 2 {
		t.Errorf("Connect calls = %d, want 2 (one failed, one succeeded)", got)
	}
	if got := conn.openedCount(); got != 1 {
		t.Errorf("opened DBs = %d, want 1", got)
	}
}

func TestClose_ClosesHeldDBAndIsIdempotent(t *testing.T) {
	conn := &trackingConnector{rowsFn: func(string) (driver.Rows, error) { return tablesRows() }}
	p := newProvider(t, conn)

	if _, err := p.fetchTables(context.Background()); err != nil {
		t.Fatalf("fetchTables: %v", err)
	}
	if conn.allClosed() {
		t.Fatal("DB closed before Close was called; held-DB invariant broken")
	}

	if err := p.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	if !conn.allClosed() {
		t.Error("Close did not close the held DB")
	}

	// Idempotent: a second Close on a provider with no held DB is a no-op.
	if err := p.Close(); err != nil {
		t.Errorf("second Close: %v", err)
	}
}

func TestClose_WithoutAnyFetchIsNoOp(t *testing.T) {
	conn := &trackingConnector{rowsFn: func(string) (driver.Rows, error) { return tablesRows() }}
	p := newProvider(t, conn)

	if err := p.Close(); err != nil {
		t.Errorf("Close on never-used provider: %v", err)
	}
	if got := conn.openedCount(); got != 0 {
		t.Errorf("opened DBs = %d, want 0", got)
	}
}

// TestGetDB_ConcurrentFirstUse asserts that under simultaneous first-call
// pressure the provider builds exactly one DB. Run with -race.
func TestGetDB_ConcurrentFirstUse(t *testing.T) {
	conn := &trackingConnector{rowsFn: func(string) (driver.Rows, error) { return tablesRows() }}
	p := newProvider(t, conn)

	const goroutines = 32
	var ready, start sync.WaitGroup
	ready.Add(goroutines)
	start.Add(1)
	errs := make(chan error, goroutines)
	for range goroutines {
		go func() {
			ready.Done()
			start.Wait()
			_, err := p.fetchTables(context.Background())
			errs <- err
		}()
	}
	ready.Wait()
	start.Done()
	for range goroutines {
		if err := <-errs; err != nil {
			t.Errorf("fetchTables: %v", err)
		}
	}

	if got := conn.openedCount(); got != 1 {
		t.Errorf("opened DBs = %d under concurrent first-use, want 1", got)
	}
}

// Run with -race; catches any sync issue around the held-DB and Close paths.
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

	if got := conn.openedCount(); got != 1 {
		t.Errorf("after concurrent run, opened DBs = %d, want 1 (held DB reused)", got)
	}

	if err := p.Close(); err != nil {
		t.Errorf("Close: %v", err)
	}
	if !conn.allClosed() {
		t.Errorf("after Close, %d DBs still hold connections", leakedCount(conn))
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
