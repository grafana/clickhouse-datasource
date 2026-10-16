package plugin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"runtime/pprof"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func connectTestSettings(t *testing.T, protocol string, port, dialTimeout int) backend.DataSourceInstanceSettings {
	t.Helper()
	jsonData, err := json.Marshal(map[string]any{
		"host":        "127.0.0.1",
		"port":        port,
		"protocol":    protocol,
		"dialTimeout": dialTimeout,
	})
	if err != nil {
		t.Fatalf("marshal settings: %v", err)
	}
	return backend.DataSourceInstanceSettings{JSONData: jsonData}
}

// resetServer accepts TCP connections, never writes to them, and resets each one after the given delay.
func resetServer(t *testing.T, after time.Duration) int {
	t.Helper()
	ln, err := net.ListenTCP("tcp", &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1)})
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	done := make(chan struct{})
	var wg sync.WaitGroup
	wg.Go(func() {
		for {
			conn, err := ln.AcceptTCP()
			if err != nil {
				return
			}
			wg.Go(func() {
				select {
				case <-time.After(after):
				case <-done:
				}
				_ = conn.SetLinger(0)
				_ = conn.Close()
			})
		}
	})
	t.Cleanup(func() {
		close(done)
		_ = ln.Close()
		wg.Wait()
	})
	return ln.Addr().(*net.TCPAddr).Port
}

// sdkStatus is the per-query status the plugin SDK reports for a Connect error that sqlds wrapped.
func sdkStatus(t *testing.T, err error) backend.Status {
	t.Helper()
	body, marshalErr := json.Marshal(backend.DataResponse{Error: backend.DownstreamError(err)})
	if marshalErr != nil {
		t.Fatalf("marshal data response: %v", marshalErr)
	}
	var resp struct {
		Status backend.Status `json:"status"`
	}
	if unmarshalErr := json.Unmarshal(body, &resp); unmarshalErr != nil {
		t.Fatalf("unmarshal data response %s: %v", body, unmarshalErr)
	}
	return resp.Status
}

func connectionOpeners(t *testing.T) int {
	t.Helper()
	var buf bytes.Buffer
	if err := pprof.Lookup("goroutine").WriteTo(&buf, 2); err != nil {
		t.Fatalf("write goroutine profile: %v", err)
	}
	return strings.Count(buf.String(), "database/sql.(*DB).connectionOpener(")
}

// settledConnectionOpeners waits for the count to stop changing, because a closed *sql.DB stops its opener asynchronously.
func settledConnectionOpeners(t *testing.T) int {
	t.Helper()
	n := connectionOpeners(t)
	for range 100 {
		time.Sleep(20 * time.Millisecond)
		next := connectionOpeners(t)
		if next == n {
			return n
		}
		n = next
	}
	t.Fatalf("database/sql connection opener count did not settle, last count %d", n)
	return n
}

func TestConnectKeepsUnderlyingCause(t *testing.T) {
	tests := []struct {
		name        string
		protocol    string
		resetAfter  time.Duration
		dialTimeout int
		cancelAfter time.Duration
		wantPrefix  string
		wantIs      error
		wantAs      any
		wantStatus  backend.Status
	}{
		{
			name:        "native, request cancelled before the server resets the connection",
			protocol:    "native",
			resetAfter:  time.Second,
			dialTimeout: 30,
			cancelAfter: 200 * time.Millisecond,
			wantPrefix:  "the operation was cancelled during execution: context canceled: handshake: ",
			wantIs:      context.Canceled,
			wantAs:      new(*net.OpError),
			wantStatus:  backend.StatusInternal,
		},
		{
			name:        "native, dial timeout expires while the server stays silent",
			protocol:    "native",
			resetAfter:  time.Minute,
			dialTimeout: 1,
			wantPrefix:  "[timeout] handshake: ",
			wantIs:      os.ErrDeadlineExceeded,
			wantAs:      new(*net.OpError),
			wantStatus:  backend.StatusTimeout,
		},
		{
			name:        "http, request cancelled while the server stays silent",
			protocol:    "http",
			resetAfter:  time.Minute,
			dialTimeout: 30,
			cancelAfter: 200 * time.Millisecond,
			wantPrefix:  "the operation was cancelled during execution: context canceled: failed to query server hello: ",
			wantIs:      context.Canceled,
			wantAs:      new(*url.Error),
			wantStatus:  backend.StatusInternal,
		},
		{
			name:        "http, dial timeout expires while the server stays silent",
			protocol:    "http",
			resetAfter:  time.Minute,
			dialTimeout: 1,
			wantPrefix:  "[timeout] failed to query server hello: ",
			wantIs:      context.DeadlineExceeded,
			wantAs:      new(*url.Error),
			wantStatus:  backend.StatusTimeout,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			if tc.cancelAfter > 0 {
				var cancel context.CancelCauseFunc
				ctx, cancel = context.WithCancelCause(ctx)
				timer := time.AfterFunc(tc.cancelAfter, func() { cancel(fmt.Errorf("test: request cancelled: %w", context.Canceled)) })
				t.Cleanup(func() {
					timer.Stop()
					cancel(errors.New("test: finished"))
				})
			}
			settings := connectTestSettings(t, tc.protocol, resetServer(t, tc.resetAfter), tc.dialTimeout)

			db, err := (&Clickhouse{}).Connect(ctx, settings, nil)
			if err == nil {
				_ = db.Close()
				t.Fatal("Connect() error = nil, want an error")
			}
			if !strings.HasPrefix(err.Error(), tc.wantPrefix) {
				t.Errorf("Connect() error = %q, want prefix %q", err, tc.wantPrefix)
			}
			if !errors.Is(err, tc.wantIs) {
				t.Errorf("Connect() error = %q, want it to wrap %v", err, tc.wantIs)
			}
			if !errors.As(err, tc.wantAs) {
				t.Errorf("Connect() error = %q, want it to wrap a %T", err, tc.wantAs)
			}
			if got := sdkStatus(t, err); got != tc.wantStatus {
				t.Errorf("SDK status for Connect() error %q = %d, want %d", err, got, tc.wantStatus)
			}
		})
	}
}

func TestConnectClosesPoolOnFailure(t *testing.T) {
	doneCtx, cancel := context.WithCancelCause(context.Background())
	cancel(errors.New("test: request already cancelled"))

	tests := []struct {
		name     string
		protocol string
		ctx      context.Context
	}{
		{name: "native, ping fails", protocol: "native", ctx: context.Background()},
		{name: "http, ping fails", protocol: "http", ctx: context.Background()},
		{name: "context already done", protocol: "native", ctx: doneCtx},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			settings := connectTestSettings(t, tc.protocol, resetServer(t, 0), 5)
			const attempts = 20
			before := settledConnectionOpeners(t)
			for range attempts {
				if db, err := (&Clickhouse{}).Connect(tc.ctx, settings, nil); err == nil {
					_ = db.Close()
					t.Fatal("Connect() error = nil, want an error")
				}
			}

			after := connectionOpeners(t)
			for deadline := time.Now().Add(5 * time.Second); after > before && time.Now().Before(deadline); {
				time.Sleep(10 * time.Millisecond)
				after = connectionOpeners(t)
			}
			if leaked := after - before; leaked > 0 {
				t.Errorf("%d failed Connect() calls left %d database/sql connection openers running, want 0", attempts, leaked)
			}
		})
	}
}
