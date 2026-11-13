package plugin

import (
	"context"
	"database/sql/driver"
	"errors"
	"reflect"
	"regexp"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

var uuidV4 = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type fakeStdConn struct {
	stdConn
	queryErr       error
	waitForCtxDone bool
	killErr        error
	execs          []fakeExec
}

type fakeExec struct {
	query  string
	args   []driver.NamedValue
	ctxErr error
}

func (f *fakeStdConn) QueryContext(ctx context.Context, _ string, _ []driver.NamedValue) (driver.Rows, error) {
	if f.waitForCtxDone {
		<-ctx.Done()
		return nil, ctx.Err()
	}
	return nil, f.queryErr
}

func (f *fakeStdConn) ExecContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	f.execs = append(f.execs, fakeExec{query: query, args: args, ctxErr: ctx.Err()})
	return driver.RowsAffected(0), f.killErr
}

type fakeConnector struct {
	driver.Connector
	conn driver.Conn
}

func (f fakeConnector) Connect(context.Context) (driver.Conn, error) {
	return f.conn, nil
}

type warnCounter struct {
	log.Logger
	warns atomic.Int32
}

func (w *warnCounter) Warn(string, ...any) {
	w.warns.Add(1)
}

func countWarnings(t *testing.T) *warnCounter {
	t.Helper()
	counter := &warnCounter{Logger: backend.Logger}
	previous := backend.Logger
	backend.Logger = counter
	t.Cleanup(func() { backend.Logger = previous })
	return counter
}

func queryer(t *testing.T, connector driver.Connector) driver.QueryerContext {
	t.Helper()
	conn, err := connector.Connect(context.Background())
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	q, ok := conn.(driver.QueryerContext)
	if !ok {
		t.Fatalf("Connect() returned %T, want a driver.QueryerContext", conn)
	}
	return q
}

func TestKillOnCancelConnQueryContext(t *testing.T) {
	errUnknownTable := errors.New("code: 60, table does not exist")
	tests := []struct {
		name           string
		queryErr       error
		waitForCtxDone bool
		ctx            func(t *testing.T) context.Context
		wantErr        error
		wantKill       bool
	}{
		{
			name:     "query succeeds",
			ctx:      func(*testing.T) context.Context { return context.Background() },
			wantKill: false,
		},
		{
			name:     "query fails while context is live",
			queryErr: errUnknownTable,
			ctx:      func(*testing.T) context.Context { return context.Background() },
			wantErr:  errUnknownTable,
			wantKill: false,
		},
		{
			name:           "context cancelled during query",
			waitForCtxDone: true,
			ctx: func(t *testing.T) context.Context {
				ctx, cancel := context.WithCancelCause(context.Background())
				time.AfterFunc(10*time.Millisecond, func() { cancel(errors.New("test: user navigated away")) })
				t.Cleanup(func() { cancel(errors.New("test: done")) })
				return ctx
			},
			wantErr:  context.Canceled,
			wantKill: true,
		},
		{
			name:           "context deadline exceeded during query",
			waitForCtxDone: true,
			ctx: func(t *testing.T) context.Context {
				ctx, cancel := context.WithTimeoutCause(context.Background(), 10*time.Millisecond, errors.New("test: query timeout"))
				t.Cleanup(cancel)
				return ctx
			},
			wantErr:  context.DeadlineExceeded,
			wantKill: true,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fake := &fakeStdConn{queryErr: tc.queryErr, waitForCtxDone: tc.waitForCtxDone}
			conn := queryer(t, &killOnCancelConnector{Connector: fakeConnector{conn: fake}})

			_, err := conn.QueryContext(tc.ctx(t), "SELECT 1", nil)

			if !errors.Is(err, tc.wantErr) {
				t.Errorf("QueryContext() error = %v, want %v", err, tc.wantErr)
			}
			if !tc.wantKill {
				if len(fake.execs) != 0 {
					t.Fatalf("QueryContext() sent %d extra queries, want none: %+v", len(fake.execs), fake.execs)
				}
				return
			}
			if len(fake.execs) != 1 {
				t.Fatalf("QueryContext() sent %d extra queries, want one KILL QUERY", len(fake.execs))
			}
			got := fake.execs[0]
			if got.query != "KILL QUERY WHERE query_id = ? ASYNC" {
				t.Errorf("kill query = %q, want KILL QUERY WHERE query_id = ? ASYNC", got.query)
			}
			if len(got.args) != 1 {
				t.Fatalf("kill args = %+v, want one query_id", got.args)
			}
			if id, _ := got.args[0].Value.(string); !uuidV4.MatchString(id) {
				t.Errorf("kill query_id = %v, want a version 4 UUID", got.args[0].Value)
			}
			if got.ctxErr != nil {
				t.Errorf("kill ran on an ended context: %v", got.ctxErr)
			}
		})
	}
}

func TestKillOnCancelStopsAfterAccessDenied(t *testing.T) {
	tests := []struct {
		name      string
		killErr   error
		wantKills int
		wantWarns int32
	}{
		{
			name:      "kill succeeds",
			wantKills: 3,
		},
		{
			name:      "access denied",
			killErr:   &clickhouse.HTTPError{StatusCode: 500, Err: &clickhouse.Exception{Code: accessDeniedCode, Name: "ACCESS_DENIED"}},
			wantKills: 1,
			wantWarns: 1,
		},
		{
			name:      "other error",
			killErr:   errors.New("dial tcp: connection refused"),
			wantKills: 3,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			warnings := countWarnings(t)
			fake := &fakeStdConn{waitForCtxDone: true, killErr: tc.killErr}
			connector := &killOnCancelConnector{Connector: fakeConnector{conn: fake}}
			ctx, cancel := context.WithCancelCause(context.Background())
			cancel(errors.New("test: dashboard refreshed"))

			for range 3 {
				_, _ = queryer(t, connector).QueryContext(ctx, "SELECT 1", nil)
			}

			if len(fake.execs) != tc.wantKills {
				t.Errorf("sent %d KILL QUERY for 3 cancelled queries, want %d", len(fake.execs), tc.wantKills)
			}
			if got := warnings.warns.Load(); got != tc.wantWarns {
				t.Errorf("logged %d warnings, want %d", got, tc.wantWarns)
			}
		})
	}
}

func TestKillOnCancelConnInterfaces(t *testing.T) {
	inner := reflect.TypeOf(clickhouse.Connector(&clickhouse.Options{Protocol: clickhouse.HTTP}).Driver())
	wrapper := reflect.TypeFor[*killOnCancelConn]()
	optional := []reflect.Type{
		reflect.TypeFor[driver.Conn](),
		reflect.TypeFor[driver.ConnBeginTx](),
		reflect.TypeFor[driver.ConnPrepareContext](),
		reflect.TypeFor[driver.ExecerContext](),
		reflect.TypeFor[driver.QueryerContext](),
		reflect.TypeFor[driver.NamedValueChecker](),
		reflect.TypeFor[driver.Pinger](),
		reflect.TypeFor[driver.SessionResetter](),
		reflect.TypeFor[driver.Validator](),
		reflect.TypeFor[driver.Execer](),  //nolint:staticcheck // database/sql still calls it
		reflect.TypeFor[driver.Queryer](), //nolint:staticcheck // database/sql still calls it
	}
	for _, driverInterface := range optional {
		t.Run(driverInterface.Name(), func(t *testing.T) {
			if got, want := wrapper.Implements(driverInterface), inner.Implements(driverInterface); got != want {
				t.Errorf("%v implements %v = %t, but %v implements it = %t", wrapper, driverInterface, got, inner, want)
			}
		})
	}
}

func TestNewQueryID(t *testing.T) {
	first, second := newQueryID(), newQueryID()
	for _, id := range []string{first, second} {
		if !uuidV4.MatchString(id) {
			t.Errorf("newQueryID() = %q, want a version 4 UUID", id)
		}
	}
	if first == second {
		t.Errorf("newQueryID() returned %q twice", first)
	}
}
