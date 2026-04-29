package schemacache

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestCache_GetSet(t *testing.T) {
	c := New[string](time.Minute, 0, 10)

	if _, ok := c.Get("missing"); ok {
		t.Fatal("expected miss on empty cache")
	}

	c.Set("k", "v")
	got, ok := c.Get("k")
	if !ok || got != "v" {
		t.Fatalf("expected (v,true), got (%q,%v)", got, ok)
	}
}

func TestCache_TTLExpiry(t *testing.T) {
	// Use manual clock to keep the test fast and deterministic.
	now := time.Unix(0, 0)
	c := New[string](100*time.Millisecond, 0, 10)
	c.now = func() time.Time { return now }

	c.Set("k", "v")

	// Just before expiry.
	now = now.Add(99 * time.Millisecond)
	if _, ok := c.Get("k"); !ok {
		t.Fatal("entry should still be valid just before TTL")
	}

	// After expiry.
	now = now.Add(2 * time.Millisecond)
	if _, ok := c.Get("k"); ok {
		t.Fatal("entry should be expired")
	}
	if c.Len() != 0 {
		t.Fatalf("expired entry should be evicted on access, Len()=%d", c.Len())
	}
}

func TestCache_Delete(t *testing.T) {
	c := New[int](time.Minute, 0, 10)
	c.Set("k", 1)
	c.Delete("k")
	if _, ok := c.Get("k"); ok {
		t.Fatal("entry should have been deleted")
	}
}

func TestCache_Clear(t *testing.T) {
	c := New[int](time.Minute, 0, 10)
	c.Set("a", 1)
	c.Set("b", 2)
	c.Clear()
	if c.Len() != 0 {
		t.Fatalf("Clear() should empty the cache, Len()=%d", c.Len())
	}
}

func TestCache_MaxItemsEviction(t *testing.T) {
	now := time.Unix(0, 0)
	c := New[int](time.Minute, 0, 3)
	c.now = func() time.Time { return now }

	// Fill beyond capacity with strictly-increasing expiry times so the
	// earliest-expiring entry is predictable.
	for i := range 5 {
		c.Set(fmt.Sprintf("k%d", i), i)
		now = now.Add(time.Millisecond) // pushes each subsequent expiry further out
	}

	if got := c.Len(); got > 3 {
		t.Fatalf("expected cache to be bounded at 3, Len()=%d", got)
	}
	// The first two keys should have been evicted (earliest expiries).
	for _, k := range []string{"k0", "k1"} {
		if _, ok := c.Get(k); ok {
			t.Fatalf("key %q should have been evicted", k)
		}
	}
}

func TestCache_DoReturnsCachedValue(t *testing.T) {
	c := New[string](time.Minute, 0, 10)
	c.Set("k", "cached")

	called := false
	got, err := c.Do(context.Background(), "k", func(ctx context.Context) (string, error) {
		called = true
		return "fresh", nil
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "cached" {
		t.Fatalf("expected cached value, got %q", got)
	}
	if called {
		t.Fatal("fn should not be invoked on cache hit")
	}
}

func TestCache_DoCachesResult(t *testing.T) {
	c := New[int](time.Minute, 0, 10)

	calls := 0
	fn := func(ctx context.Context) (int, error) {
		calls++
		return 42, nil
	}

	for range 3 {
		got, err := c.Do(context.Background(), "k", fn)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != 42 {
			t.Fatalf("got %d, want 42", got)
		}
	}
	if calls != 1 {
		t.Fatalf("fn should be called exactly once, got %d", calls)
	}
}

func TestCache_DoErrorNotCached(t *testing.T) {
	c := New[int](time.Minute, 0, 10)

	errBoom := errors.New("boom")
	_, err := c.Do(context.Background(), "k", func(ctx context.Context) (int, error) {
		return 0, errBoom
	})
	if !errors.Is(err, errBoom) {
		t.Fatalf("expected boom error, got %v", err)
	}
	if c.Len() != 0 {
		t.Fatal("errored fn results should not be cached")
	}
}

func TestCache_DoSingleflight(t *testing.T) {
	// Concurrent callers missing the same key should collapse into exactly
	// one upstream invocation. This is the main reason we use the cache at
	// all — a 20-panel dashboard opens with 20 parallel resource calls.
	c := New[int](time.Minute, 0, 10)

	const callers = 50
	var inFlight int32
	started := make(chan struct{})

	fn := func(ctx context.Context) (int, error) {
		atomic.AddInt32(&inFlight, 1)
		<-started // hold all concurrent miss-holders inside fn until released
		return 7, nil
	}

	var wg sync.WaitGroup
	results := make([]int, callers)
	errs := make([]error, callers)
	for i := range callers {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i], errs[i] = c.Do(context.Background(), "k", fn)
		}(i)
	}

	// Give goroutines a moment to arrive at the singleflight gate, then
	// release. We can't observe "all are waiting" directly, but in practice
	// 50 goroutines schedule quickly and any that arrive late will hit the
	// cached value instead.
	time.Sleep(10 * time.Millisecond)
	close(started)
	wg.Wait()

	if atomic.LoadInt32(&inFlight) != 1 {
		t.Fatalf("expected singleflight to collapse to 1 upstream call, got %d", inFlight)
	}
	for i := range callers {
		if errs[i] != nil {
			t.Fatalf("caller %d errored: %v", i, errs[i])
		}
		if results[i] != 7 {
			t.Fatalf("caller %d got %d, want 7", i, results[i])
		}
	}
}

func TestCache_DoLeaderCancelDoesNotPoisonWaiters(t *testing.T) {
	// Cancelling the singleflight leader must not propagate to waiters whose
	// own contexts are still live — a single closed panel shouldn't abort the
	// fetch for every other panel sharing the call.
	c := New[int](time.Minute, 0, 10)

	release := make(chan struct{})
	fn := func(ctx context.Context) (int, error) {
		<-release
		if err := ctx.Err(); err != nil {
			return 0, err
		}
		return 11, nil
	}

	leaderCtx, cancelLeader := context.WithCancel(context.Background())
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		_, _ = c.Do(leaderCtx, "k", fn)
	}()

	time.Sleep(10 * time.Millisecond) // let the leader enter singleflight

	const waiters = 5
	results := make([]int, waiters)
	errs := make([]error, waiters)
	for i := range waiters {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i], errs[i] = c.Do(context.Background(), "k", fn)
		}(i)
	}

	time.Sleep(10 * time.Millisecond)
	cancelLeader()
	close(release)
	wg.Wait()

	for i := range waiters {
		if errs[i] != nil {
			t.Fatalf("waiter %d saw leader's cancellation: %v", i, errs[i])
		}
		if results[i] != 11 {
			t.Fatalf("waiter %d got %d, want 11", i, results[i])
		}
	}
}

func TestCache_KeyIsolation(t *testing.T) {
	// A primitive defense-in-depth check: different keys must not collide.
	// If a future refactor regresses this, integration tests won't catch it.
	c := New[string](time.Minute, 0, 10)
	c.Set("a", "value-a")
	c.Set("b", "value-b")

	if v, _ := c.Get("a"); v != "value-a" {
		t.Fatalf("a: got %q", v)
	}
	if v, _ := c.Get("b"); v != "value-b" {
		t.Fatalf("b: got %q", v)
	}
}

func TestCache_JitterStaysWithinBand(t *testing.T) {
	ttl := 100 * time.Millisecond
	jitter := 40 * time.Millisecond
	c := New[int](ttl, jitter, 10)

	// Sample the jitter band a few times and assert every value lies within
	// [ttl - jitter/2, ttl + jitter/2). This is a weak property test — we
	// don't care about the distribution, only the bounds.
	for range 50 {
		d := c.ttlWithJitter()
		if d < ttl-jitter/2 || d >= ttl+jitter/2 {
			t.Fatalf("ttl with jitter %v out of band [%v, %v)", d, ttl-jitter/2, ttl+jitter/2)
		}
	}
}
