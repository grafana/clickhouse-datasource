package plugin

import (
	"strings"
	"sync"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/sqlds/v5"
)

// connectionIdleTTL is how long a per-header connection pool may go unused
// before it is closed.
const connectionIdleTTL = 15 * time.Minute

// defaultConnectionKeySuffix ends the cache key sqlds uses for the default
// connection ("<uid>-default"). sqlds never recreates that entry once it is
// gone, so it is never evicted.
const defaultConnectionKeySuffix = "-default"

// idleConnectionCache is a sqlds.ConnectionCache that closes per-header
// connection pools left unused for longer than ttl.
//
// With forwarded headers, sqlds opens one *sql.DB per distinct header set
// (user, rotating OAuth token, dashboard, panel, ...). Its default cache never
// evicts, so every pool it ever opened stayed in memory for the life of the
// datasource instance.
//
// Eviction is checked on Store, the only operation that grows the cache. An
// evicted pool is closed in the background: sql.DB.Close waits for queries
// already running on it, and Store must not block on that.
type idleConnectionCache struct {
	mu      sync.Mutex
	entries map[string]*idleConnectionEntry
	ttl     time.Duration
	now     func() time.Time
	close   func(sqlds.CachedConnection)
}

type idleConnectionEntry struct {
	conn     sqlds.CachedConnection
	lastUsed time.Time
}

func newIdleConnectionCache(ttl time.Duration) *idleConnectionCache {
	return &idleConnectionCache{
		entries: make(map[string]*idleConnectionEntry),
		ttl:     ttl,
		now:     time.Now,
		close: func(conn sqlds.CachedConnection) {
			if err := conn.Close(); err != nil {
				backend.Logger.Warn("Failed to close idle ClickHouse connection pool", "error", err)
			}
		},
	}
}

func (c *idleConnectionCache) Load(key string) (sqlds.CachedConnection, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.entries[key]
	if !ok {
		return sqlds.CachedConnection{}, false
	}
	entry.lastUsed = c.now()
	return entry.conn, true
}

func (c *idleConnectionCache) Store(key string, conn sqlds.CachedConnection) {
	c.mu.Lock()
	now := c.now()
	c.entries[key] = &idleConnectionEntry{conn: conn, lastUsed: now}
	var evicted []sqlds.CachedConnection
	for k, entry := range c.entries {
		if strings.HasSuffix(k, defaultConnectionKeySuffix) || now.Sub(entry.lastUsed) <= c.ttl {
			continue
		}
		evicted = append(evicted, entry.conn)
		delete(c.entries, k)
	}
	c.mu.Unlock()

	for _, conn := range evicted {
		go c.close(conn)
	}
}

func (c *idleConnectionCache) Range(f func(key string, conn sqlds.CachedConnection) bool) {
	c.mu.Lock()
	snapshot := make(map[string]sqlds.CachedConnection, len(c.entries))
	for k, entry := range c.entries {
		snapshot[k] = entry.conn
	}
	c.mu.Unlock()

	for k, conn := range snapshot {
		if !f(k, conn) {
			return
		}
	}
}

func (c *idleConnectionCache) Dispose() {
	c.mu.Lock()
	entries := c.entries
	c.entries = make(map[string]*idleConnectionEntry)
	c.mu.Unlock()

	for _, entry := range entries {
		c.close(entry.conn)
	}
}
