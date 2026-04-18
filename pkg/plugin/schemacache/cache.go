// Package schemacache provides a small TTL + singleflight cache used to memoize
// ClickHouse schema introspection queries (system.tables, system.columns, and
// DISTINCT column-value probes) per datasource instance.
//
// The goal is narrow: cut the N+1 round-trips the query builder produces when a
// dashboard with many panels is opened, without caching anything that crosses
// tenant or datasource boundaries. The cache lives on the SchemaProvider, so
// each datasource instance has its own namespace; keys are composed by the
// caller and do not need to include the datasource UID.
package schemacache

import (
	"context"
	"math/rand/v2"
	"sort"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

// DefaultMaxItems is used when New is called with maxItems <= 0.
const DefaultMaxItems = 256

// Cache is a generic, TTL-bounded in-process cache with singleflight-backed
// miss dedup. It is safe for concurrent use.
type Cache[V any] struct {
	ttl      time.Duration
	jitter   time.Duration
	maxItems int

	mu      sync.Mutex
	entries map[string]entry[V]
	sf      singleflight.Group

	// now is overridable in tests so TTL behaviour is deterministic.
	now func() time.Time
}

type entry[V any] struct {
	value   V
	expires time.Time
}

// New returns a cache with the given TTL, expiry jitter, and max item count.
// jitter is applied as a uniform ±jitter/2 band around ttl on every Set —
// mt-infra caching.md calls for jitter specifically to avoid stampedes when
// many entries were populated in a burst (e.g. on first dashboard load).
//
// A maxItems <= 0 is replaced with DefaultMaxItems.
func New[V any](ttl, jitter time.Duration, maxItems int) *Cache[V] {
	if maxItems <= 0 {
		maxItems = DefaultMaxItems
	}
	return &Cache[V]{
		ttl:      ttl,
		jitter:   jitter,
		maxItems: maxItems,
		entries:  make(map[string]entry[V]),
		now:      time.Now,
	}
}

// Get returns the cached value if present and unexpired. Expired entries are
// removed opportunistically on access.
func (c *Cache[V]) Get(key string) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.getLocked(key)
}

func (c *Cache[V]) getLocked(key string) (V, bool) {
	var zero V
	e, ok := c.entries[key]
	if !ok {
		return zero, false
	}
	if c.now().After(e.expires) {
		delete(c.entries, key)
		return zero, false
	}
	return e.value, true
}

// Set stores value under key with the cache's TTL (± jitter).
func (c *Cache[V]) Set(key string, value V) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[key] = entry[V]{
		value:   value,
		expires: c.now().Add(c.ttlWithJitter()),
	}
	c.evictIfNeededLocked()
}

// Delete removes key from the cache. It's a no-op if key is absent.
func (c *Cache[V]) Delete(key string) {
	c.mu.Lock()
	delete(c.entries, key)
	c.mu.Unlock()
}

// Clear drops all entries. Useful for a "refresh schema" action wired to the
// frontend, or in tests.
func (c *Cache[V]) Clear() {
	c.mu.Lock()
	c.entries = make(map[string]entry[V])
	c.mu.Unlock()
}

// Len returns the current number of (including expired but not-yet-evicted) entries.
// Intended for tests and metrics.
func (c *Cache[V]) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.entries)
}

// Do returns the cached value for key if present, otherwise calls fn and caches
// its result. Concurrent callers miss-hitting the same key are collapsed into a
// single fn invocation via singleflight, so one slow upstream query does not
// produce N queued queries when a dashboard opens.
//
// If fn returns an error the result is not cached. The caller receives the
// zero value and the error.
func (c *Cache[V]) Do(ctx context.Context, key string, fn func(context.Context) (V, error)) (V, error) {
	if v, ok := c.Get(key); ok {
		return v, nil
	}
	result, err, _ := c.sf.Do(key, func() (any, error) {
		// Re-check after acquiring the singleflight slot: another caller
		// may have populated the entry while we waited.
		if v, ok := c.Get(key); ok {
			return v, nil
		}
		v, err := fn(ctx)
		if err != nil {
			return v, err
		}
		c.Set(key, v)
		return v, nil
	})
	if err != nil {
		var zero V
		return zero, err
	}
	return result.(V), nil
}

func (c *Cache[V]) ttlWithJitter() time.Duration {
	if c.jitter <= 0 {
		return c.ttl
	}
	// Uniform band of width c.jitter centred on c.ttl.
	delta := time.Duration(rand.Int64N(int64(c.jitter))) - c.jitter/2
	return c.ttl + delta
}

// evictIfNeededLocked keeps the cache at or below maxItems. It first drops
// expired entries (cheap) and, only if still over capacity, falls back to
// dropping the earliest-expiring entries (a simple approximation of LRU that
// does not require tracking access order on every Get).
//
// Must be called with c.mu held.
func (c *Cache[V]) evictIfNeededLocked() {
	if len(c.entries) <= c.maxItems {
		return
	}
	now := c.now()
	for k, e := range c.entries {
		if now.After(e.expires) {
			delete(c.entries, k)
		}
	}
	if len(c.entries) <= c.maxItems {
		return
	}
	type kv struct {
		key     string
		expires time.Time
	}
	items := make([]kv, 0, len(c.entries))
	for k, e := range c.entries {
		items = append(items, kv{k, e.expires})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].expires.Before(items[j].expires) })
	overflow := len(c.entries) - c.maxItems
	for i := 0; i < overflow && i < len(items); i++ {
		delete(c.entries, items[i].key)
	}
}
