package plugin

import (
	"sync"
	"testing"
	"time"

	"github.com/grafana/sqlds/v5"
	"github.com/stretchr/testify/assert"
)

func newTestIdleCache(ttl time.Duration) (*idleConnectionCache, *time.Time, *sync.WaitGroup, *int) {
	now := time.Unix(0, 0)
	closed := 0
	var mu sync.Mutex
	var wg sync.WaitGroup
	cache := newIdleConnectionCache(ttl)
	cache.now = func() time.Time { return now }
	cache.close = func(sqlds.CachedConnection) {
		mu.Lock()
		closed++
		mu.Unlock()
		wg.Done()
	}
	return cache, &now, &wg, &closed
}

func TestIdleConnectionCacheEvictsUnusedPools(t *testing.T) {
	cache, now, wg, closed := newTestIdleCache(time.Minute)

	cache.Store("ds-default", sqlds.CachedConnection{})
	cache.Store("ds-user-a", sqlds.CachedConnection{})
	cache.Store("ds-user-b", sqlds.CachedConnection{})

	*now = now.Add(45 * time.Second)
	_, ok := cache.Load("ds-user-b") // keeps user-b fresh
	assert.True(t, ok)

	*now = now.Add(30 * time.Second)
	wg.Add(1) // only user-a has been idle for more than a minute
	cache.Store("ds-user-c", sqlds.CachedConnection{})
	wg.Wait()

	assert.Equal(t, 1, *closed)
	_, ok = cache.Load("ds-user-a")
	assert.False(t, ok, "the idle pool must be evicted")
	for _, key := range []string{"ds-default", "ds-user-b", "ds-user-c"} {
		_, ok = cache.Load(key)
		assert.True(t, ok, key)
	}
}

func TestIdleConnectionCacheNeverEvictsTheDefaultConnection(t *testing.T) {
	cache, now, _, closed := newTestIdleCache(time.Minute)

	cache.Store("ds-default", sqlds.CachedConnection{})
	*now = now.Add(time.Hour)
	cache.Store("ds-default", sqlds.CachedConnection{})
	*now = now.Add(time.Hour)
	cache.Store("ds-user-a", sqlds.CachedConnection{})

	_, ok := cache.Load("ds-default")
	assert.True(t, ok)
	assert.Equal(t, 0, *closed)
}

func TestIdleConnectionCacheDisposeClosesEverything(t *testing.T) {
	cache, _, wg, closed := newTestIdleCache(time.Minute)
	cache.Store("ds-default", sqlds.CachedConnection{})
	cache.Store("ds-user-a", sqlds.CachedConnection{})

	wg.Add(2)
	cache.Dispose()
	wg.Wait()

	assert.Equal(t, 2, *closed)
	count := 0
	cache.Range(func(string, sqlds.CachedConnection) bool { count++; return true })
	assert.Equal(t, 0, count)
}
