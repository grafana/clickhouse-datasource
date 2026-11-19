package plugin

import (
	"context"
	"crypto/rand"
	"database/sql/driver"
	"errors"
	"fmt"
	"sync/atomic"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

const (
	killQueryTimeout = 5 * time.Second
	accessDeniedCode = 497
)

// stdConn is the set of driver interfaces the clickhouse-go std connection implements.
type stdConn interface {
	driver.Conn
	driver.ConnBeginTx
	driver.ConnPrepareContext
	driver.ExecerContext
	driver.QueryerContext
	driver.NamedValueChecker
	driver.Pinger
	driver.SessionResetter
}

// killOnCancelConnector kills an HTTP query on the server when its context ends first,
// which a closed HTTP connection does not do. Workaround for ClickHouse/clickhouse-go#1699.
type killOnCancelConnector struct {
	driver.Connector
	killDenied atomic.Bool
}

func (c *killOnCancelConnector) Connect(ctx context.Context) (driver.Conn, error) {
	conn, err := c.Connector.Connect(ctx)
	if err != nil {
		return nil, err
	}
	std, ok := conn.(stdConn)
	if !ok {
		return conn, nil
	}
	return &killOnCancelConn{stdConn: std, killDenied: &c.killDenied}, nil
}

type killOnCancelConn struct {
	stdConn
	killDenied *atomic.Bool
}

func (c *killOnCancelConn) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	queryID := newQueryID()
	rows, err := c.stdConn.QueryContext(clickhouse.Context(ctx, clickhouse.WithQueryID(queryID)), query, args)
	if err != nil && ctx.Err() != nil && !c.killDenied.Load() {
		c.kill(context.WithoutCancel(ctx), queryID)
	}
	return rows, err
}

func (c *killOnCancelConn) kill(ctx context.Context, queryID string) {
	ctx, cancel := context.WithTimeoutCause(ctx, killQueryTimeout, errors.New("kill cancelled query: timed out"))
	defer cancel()

	_, err := c.ExecContext(ctx, "KILL QUERY WHERE query_id = ? ASYNC", []driver.NamedValue{{Ordinal: 1, Value: queryID}})
	var ex *clickhouse.Exception
	switch {
	case err == nil:
	case errors.As(err, &ex) && ex.Code == accessDeniedCode:
		if c.killDenied.CompareAndSwap(false, true) {
			backend.Logger.Warn("ClickHouse denied KILL QUERY for a cancelled HTTP query, so cancelled queries on this data source keep running on the server. Grant SELECT ON system.processes to the data source user, then save the data source again to stop them", "error", err)
		}
	default:
		backend.Logger.Debug("failed to kill cancelled ClickHouse query", "query_id", queryID, "error", err)
	}
}

// newQueryID returns a random version 4 UUID.
func newQueryID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}
