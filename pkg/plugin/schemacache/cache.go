// Package schemacache is a TTL + singleflight cache for ClickHouse schema
// introspection queries (system.tables, system.columns, DISTINCT column probes).
//
// One cache lives per SchemaProvider, so entries never cross datasource or
// tenant boundaries.
package schemacache

import (
	"context"
	"math/rand/v2"
	"sort"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

const DefaultMaxItems = 256

// Cache is a TTL-bounded in-process cache with singleflight miss dedup.
// Safe for concurrent use.
type Cache[V any] struct {
	ttl      time.Duration
	jitter   time.Duration
	maxItems int

	mu      sync.Mutex
	entries map[string]entry[V]
	sf      singleflight.Group

	now func() time.Time // test seam
}

type entry[V any] struct {
	value   V
	expires time.Time
}

// New returns a cache with the given TTL, expiry jitter (±jitter/2 around ttl
// per Set, to avoid stampedes), and max item count. maxItems <= 0 uses
// DefaultMaxItems.
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
// dropped on access.
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

// Set stores value under key with the cache's TTL (±jitter).
func (c *Cache[V]) Set(key string, value V) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[key] = entry[V]{
		value:   value,
		expires: c.now().Add(c.ttlWithJitter()),
	}
	c.evictIfNeededLocked()
}

// Delete removes key from the cache.
func (c *Cache[V]) Delete(key string) {
	c.mu.Lock()
	delete(c.entries, key)
	c.mu.Unlock()
}

// Clear drops all entries.
func (c *Cache[V]) Clear() {
	c.mu.Lock()
	c.entries = make(map[string]entry[V])
	c.mu.Unlock()
}

// Len returns the entry count, including expired-but-not-yet-evicted entries.
func (c *Cache[V]) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.entries)
}

// Do returns the cached value for key if present; otherwise calls fn and
// caches its result. Concurrent misses on the same key collapse into one fn
// invocation via singleflight. Errors are not cached.
func (c *Cache[V]) Do(ctx context.Context, key string, fn func(context.Context) (V, error)) (V, error) {
	if v, ok := c.Get(key); ok {
		return v, nil
	}
	result, err, _ := c.sf.Do(key, func() (any, error) {
		// Recheck under singleflight: another caller may have populated it.
		if v, ok := c.Get(key); ok {
			return v, nil
		}
		// Detach from the leader's ctx — singleflight broadcasts fn's error
		// to every waiter, so leader cancellation would poison them too.
		v, err := fn(context.WithoutCancel(ctx))
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
	delta := time.Duration(rand.Int64N(int64(c.jitter))) - c.jitter/2
	return c.ttl + delta
}

// evictIfNeededLocked keeps len <= maxItems by dropping expired entries first,
// then earliest-expiring entries (cheap LRU approximation). Caller holds c.mu.
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
